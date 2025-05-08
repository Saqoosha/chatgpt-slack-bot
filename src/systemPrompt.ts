import { performance } from "node:perf_hooks";
import { getChannelName } from "./slack";
import { readKeyValue, writeKeyValue, getAllKeyValue } from "./sskvs";
import { readSystemPrompt, writeSystemPrompt, getAllSystemPrompts } from "./firestore";
import { logger, Timer } from "./logger";
import { config } from "./config";

// システムプロンプトのキャッシュ
interface SystemPromptCache {
    prompt: string;
    timestamp: number;
    key: string; // SSKVSのキーを保存
}

const systemPromptCache = new Map<string, SystemPromptCache>();
const SYSTEM_PROMPT_CACHE_TTL = 1000 * 60 * 60; // 1時間

// Botの識別情報とSlackマークダウン形式の仕様
const BOT_IDENTITY_INFO = `あなたは会話の中で<@${config.SLACK_BOT_USER_ID}>と呼ばれることがあります。これはSlack上でのあなた自身のIDです。このIDでメンションされた場合は、それがあなた自身へのメンションだと認識してください。また、「ChatGPT」と呼ばれた場合も、それはあなた自身のことを指していると理解してください。

あなたの返答はSlackに表示されます。Slackでは以下のマークダウン記法を使用してください：
- 太字は [スペース]*テキスト*[スペース] と記述します（単一のアスタリスクの前後に必ずスペースが必要）
- 斜体は [スペース]_テキスト_[スペース] と記述します（アンダースコアの前後に必ずスペースが必要）
- 取り消し線は [スペース]~テキスト~[スペース] と記述します（単一のチルダの前後に必ずスペースが必要）
- コードブロックは \`\`\`言語名\n コード \`\`\` と記述します
- インラインコードは \`コード\` と記述します
- 引用は >テキスト と記述します

【重要】標準的なマークダウン記法（**太字**、*斜体*、~~取り消し線~~など）ではなく、必ずSlack形式のマークダウンを使用してください。特に、太字・斜体・取り消し線の記号の前後には必ずスペースを入れてください。スペースがないと書式が適用されません。

正しい例：「これは *太字* です」「これは _斜体_ です」「これは ~取り消し線~ です」
誤った例：「これは*太字*です」「これは_斜体_です」「これは~取り消し線~です」

必ず記号の前後にスペースを入れてください。`;

// キャッシュキーを生成
function createCacheKey(channelId: string, channelName: string): string {
    return `${channelId}:${channelName}`;
}

// キャッシュを無効化する関数
export function invalidateSystemPromptCache(channelId: string, channelName?: string): void {
    if (channelName) {
        // 古い形式のキーも無効化
        const legacyKey = createCacheKey(channelId, channelName);
        systemPromptCache.delete(legacyKey);
    }
    systemPromptCache.delete(channelId);
    logger.info({ event: "cache_invalidate", channelId }, "System prompt cache invalidated");
}

export async function getSystemPrompt(channelId: string): Promise<string> {
    const timer = new Timer("get_system_prompt");
    try {
        // まずチャンネルIDだけでキャッシュをチェック
        const cached = systemPromptCache.get(channelId);
        const now = Date.now();
        if (cached && now - cached.timestamp < SYSTEM_PROMPT_CACHE_TTL) {
            timer.end({ status: "cache_hit", channelId });
            return addBotIdentityInfo(cached.prompt);
        }

        // キャッシュミスの場合のみチャンネル名を取得
        const channelName = await getChannelName(channelId);
        const key = createCacheKey(channelId, channelName);

        // 古い形式のキャッシュもチェック（移行期間用）
        const legacyCached = systemPromptCache.get(key);
        if (legacyCached && now - legacyCached.timestamp < SYSTEM_PROMPT_CACHE_TTL) {
            // 新しい形式にマイグレート
            systemPromptCache.set(channelId, legacyCached);
            timer.end({ status: "legacy_cache_hit", channelId });
            return addBotIdentityInfo(legacyCached.prompt);
        }

        const prompt = await readSystemPrompt(key);

        // 結果をキャッシュ（両方の形式で保存）
        const cacheEntry = {
            prompt,
            timestamp: now,
            key,
        };
        systemPromptCache.set(channelId, cacheEntry);
        systemPromptCache.set(key, cacheEntry); // 後方互換性のため

        timer.end({ status: "cache_miss", channelId });
        return addBotIdentityInfo(prompt);
    } catch (error) {
        logger.error({ event: "get_system_prompt_error", error, channelId }, "Error fetching system prompt");
        timer.end({ status: "error", channelId });
        return BOT_IDENTITY_INFO; // エラー時でもBot ID情報は返す
    }
}

// ユーザー設定のシステムプロンプトにBot識別情報を追加する
function addBotIdentityInfo(userPrompt: string): string {
    if (!userPrompt) return BOT_IDENTITY_INFO;
    if (userPrompt.includes(BOT_IDENTITY_INFO)) return userPrompt; // すでに含まれている場合は追加しない
    return `${userPrompt}\n\n${BOT_IDENTITY_INFO}`;
}

export async function updateSystemPrompt(channelId: string, text: string): Promise<void> {
    const timer = new Timer("update_system_prompt");
    try {
        const channelName = await getChannelName(channelId);
        const key = createCacheKey(channelId, channelName);
        await writeSystemPrompt(key, text);
        invalidateSystemPromptCache(channelId, channelName);
        timer.end({ status: "success", channelId });
    } catch (error) {
        logger.error({ event: "update_system_prompt_error", error, channelId }, "Error updating system prompt");
        timer.end({ status: "error", channelId });
        throw error;
    }
}

export function getSystemPromptKey(channelId: string, channelName: string): string {
    return createCacheKey(channelId, channelName);
}
