import type { Readable } from "node:stream";
import { performance } from "node:perf_hooks";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import type { BaseMessageEvent, SlackReply } from "./types";
import { APIError, ThreadLengthError } from "./errors";
import { createChatCompletion, createChatCompletionStream } from "./chat";
import { app } from "./app";
import { getSystemPrompt } from "./systemPrompt";
import { logger, Timer } from "./logger";

// テキストのトークン数を概算する関数（日本語は1文字2トークンとして概算）
function estimateTokenCount(text: string): number {
    // 英数字と記号は1トークン、日本語文字は2トークンとして概算
    const nonAsciiPattern = /[^\x20-\x7E]/g; // 制御文字を除く ASCII 文字以外
    const asciiPattern = /[\x20-\x7E]/g; // 制御文字を除く ASCII 文字

    const englishTokens = text.replace(nonAsciiPattern, "").length;
    const japaneseTokens = text.replace(asciiPattern, "").length * 2;
    return englishTokens + japaneseTokens;
}

export async function processMessage(event: BaseMessageEvent, asStream = false): Promise<string | Readable> {
    const timer = new Timer("process_message");
    const messages: ChatCompletionMessageParam[] = [];
    let totalTokens = 0;

    try {
        const systemPrompt = await getSystemPrompt(event.channel);
        timer.end({ phase: "system_prompt_fetch", channelId: event.channel });

        if (systemPrompt) {
            const systemTokens = estimateTokenCount(systemPrompt);
            totalTokens += systemTokens;
            messages.push({ role: "system", content: systemPrompt });
        }

        if (event.thread_ts) {
            const threadTimer = new Timer("fetch_thread_replies");
            const replies = await app.client.conversations.replies({
                channel: event.channel,
                ts: event.thread_ts,
                inclusive: true,
            });
            threadTimer.end({ channelId: event.channel, threadTs: event.thread_ts });

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
                    totalTokens += messageTokens;
                    selectedMessages.unshift({
                        role: message.bot_id ? "assistant" : "user",
                        content: message.text,
                    });
                }
            }

            messages.push(...selectedMessages);
        }

        if (event.text) {
            const newMessageTokens = estimateTokenCount(event.text);
            totalTokens += newMessageTokens;
            messages.push({ role: "user", content: event.text });
        }

        logger.info(
            {
                event: "message_processing_complete",
                channelId: event.channel,
                messageCount: messages.length,
                totalTokens,
            },
            "Message processing completed",
        );

        if (asStream) {
            return createChatCompletionStream(messages, event.files);
        }
        return createChatCompletion(messages);
    } catch (error) {
        logger.error(
            {
                event: "message_processing_error",
                error,
                channelId: event.channel,
                threadTs: event.thread_ts,
            },
            "Error processing message",
        );
        throw error;
    }
}
