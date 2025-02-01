import type { Readable } from "node:stream";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import type { BaseMessageEvent, SlackReply } from "./types";
import { APIError, ThreadLengthError } from "./errors";
import { createChatCompletion, createChatCompletionStream } from "./chat";
import { app } from "./app";
import { getChannelName } from "./slack";
import { readKeyValue } from "./sskvs";

// トークン数の制限値（GPT-3.5/4の制限に基づく）
const MAX_INPUT_TOKENS = 4000;

// テキストのトークン数を概算する関数（日本語は1文字2トークンとして概算）
function estimateTokenCount(text: string): number {
    // 英数字と記号は1トークン、日本語文字は2トークンとして概算
    const nonAsciiPattern = /[^\x20-\x7E]/g; // 制御文字を除く ASCII 文字以外
    const asciiPattern = /[\x20-\x7E]/g; // 制御文字を除く ASCII 文字

    const englishTokens = text.replace(nonAsciiPattern, "").length;
    const japaneseTokens = text.replace(asciiPattern, "").length * 2;
    return englishTokens + japaneseTokens;
}

// システムプロンプトのキャッシュ
const systemPromptCache: Record<string, string> = {};

export async function getSystemPrompt(channelId: string): Promise<string> {
    const channelName = await getChannelName(channelId);
    const key = `${channelId}:${channelName}`;

    // うらで更新
    readKeyValue(key).then((value) => {
        systemPromptCache[key] = value || "";
    });

    return systemPromptCache[key] || "";
}

export async function processMessage(event: BaseMessageEvent, asStream = false): Promise<string | Readable> {
    const messages: ChatCompletionMessageParam[] = [];
    let totalTokens = 0;

    try {
        const systemPrompt = await getSystemPrompt(event.channel);
        console.log({ systemPrompt });
        if (systemPrompt) {
            const systemTokens = estimateTokenCount(systemPrompt);
            totalTokens += systemTokens;
            if (totalTokens > MAX_INPUT_TOKENS) {
                throw new ThreadLengthError("System prompt is too long", { tokenCount: totalTokens });
            }
            messages.push({ role: "system", content: systemPrompt });
        }

        if (event.thread_ts) {
            const replies = await app.client.conversations.replies({
                channel: event.channel,
                ts: event.thread_ts,
                inclusive: true,
            });

            if (!replies.messages) {
                throw new APIError("Failed to fetch thread replies");
            }

            const sorted = replies.messages.sort((a: SlackReply, b: SlackReply) => {
                if (a.ts < b.ts) return -1;
                if (a.ts > b.ts) return 1;
                return 0;
            });

            // 最新のメッセージから順に追加し、トークン制限を超えないようにする
            const reversedMessages = [...sorted].reverse();
            const selectedMessages: ChatCompletionMessageParam[] = [];

            for (const message of reversedMessages) {
                if (message.text) {
                    const messageTokens = estimateTokenCount(message.text);
                    if (totalTokens + messageTokens > MAX_INPUT_TOKENS) {
                        // トークン制限を超える場合は、その時点で終了
                        break;
                    }
                    totalTokens += messageTokens;
                    selectedMessages.unshift({
                        role: message.bot_id ? "assistant" : "user",
                        content: message.text,
                    });
                }
            }

            // 選択されたメッセージを追加
            messages.push(...selectedMessages);

            // メッセージが1つも選択されなかった場合（最新のメッセージが制限を超える場合）
            if (selectedMessages.length === 0 && reversedMessages.length > 0) {
                throw new ThreadLengthError("Latest message is too long", {
                    tokenCount: estimateTokenCount(reversedMessages[0].text || ""),
                    maxTokens: MAX_INPUT_TOKENS,
                });
            }
        }

        if (event.text) {
            const newMessageTokens = estimateTokenCount(event.text);
            totalTokens += newMessageTokens;

            if (totalTokens > MAX_INPUT_TOKENS) {
                throw new ThreadLengthError("Input message is too long", {
                    tokenCount: totalTokens,
                    maxTokens: MAX_INPUT_TOKENS,
                });
            }

            messages.push({ role: "user", content: event.text });
        }

        console.log({ totalTokens, messageCount: messages.length });

        if (asStream) {
            return createChatCompletionStream(messages);
        }
        return createChatCompletion(messages);
    } catch (error) {
        console.error(error);
        throw error;
    }
}
