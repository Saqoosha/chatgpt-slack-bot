import { performance } from "node:perf_hooks";
import { getChannelName } from "./slack";
import { readKeyValue, writeKeyValue } from "./sskvs";

// システムプロンプトのキャッシュ
interface SystemPromptCache {
    prompt: string;
    timestamp: number;
    key: string; // SSKVSのキーを保存
}

const systemPromptCache = new Map<string, SystemPromptCache>();
const SYSTEM_PROMPT_CACHE_TTL = 1000 * 60 * 60; // 1時間

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
    console.log(`Invalidated system prompt cache for channel: ${channelId}`);
}

export async function getSystemPrompt(channelId: string): Promise<string> {
    const startTime = performance.now();
    try {
        // まずチャンネルIDだけでキャッシュをチェック
        const cached = systemPromptCache.get(channelId);
        const now = Date.now();
        if (cached && now - cached.timestamp < SYSTEM_PROMPT_CACHE_TTL) {
            const cacheHitTime = performance.now() - startTime;
            console.log({ systemPromptCacheHit: `${cacheHitTime}ms` });
            return cached.prompt;
        }

        // キャッシュミスの場合のみチャンネル名を取得
        const channelName = await getChannelName(channelId);
        const key = createCacheKey(channelId, channelName);

        // 古い形式のキャッシュもチェック（移行期間用）
        const legacyCached = systemPromptCache.get(key);
        if (legacyCached && now - legacyCached.timestamp < SYSTEM_PROMPT_CACHE_TTL) {
            // 新しい形式にマイグレート
            systemPromptCache.set(channelId, legacyCached);
            const cacheHitTime = performance.now() - startTime;
            console.log({ systemPromptLegacyCacheHit: `${cacheHitTime}ms` });
            return legacyCached.prompt;
        }

        // SSKVSから取得
        const value = await readKeyValue(key);
        const prompt = value || "";

        // 結果をキャッシュ（両方の形式で保存）
        const cacheEntry = {
            prompt,
            timestamp: now,
            key,
        };
        systemPromptCache.set(channelId, cacheEntry);
        systemPromptCache.set(key, cacheEntry); // 後方互換性のため

        const cacheMissTime = performance.now() - startTime;
        console.log({ systemPromptCacheMiss: `${cacheMissTime}ms` });
        return prompt;
    } catch (error) {
        console.error("Error fetching system prompt:", error);
        const errorTime = performance.now() - startTime;
        console.log({ systemPromptError: `${errorTime}ms` });
        return "";
    }
}

export async function updateSystemPrompt(channelId: string, text: string): Promise<void> {
    const channelName = await getChannelName(channelId);
    const key = createCacheKey(channelId, channelName);
    await writeKeyValue(key, text);
    invalidateSystemPromptCache(channelId, channelName);
}

export function getSystemPromptKey(channelId: string, channelName: string): string {
    return createCacheKey(channelId, channelName);
}
