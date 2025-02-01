import dotenv from "dotenv";
dotenv.config();

import { performance } from "node:perf_hooks";
import type { Readable } from "node:stream";
import { App, LogLevel } from "@slack/bolt";
import AsyncLock from "async-lock";

import { createChatCompletion, createChatCompletionStream } from "./chat";
import { getAllKeyValue, readKeyValue } from "./sskvs";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { handleMessageEvent, handleMentionEvent, handleReactionEvent, handleSystemPromptCommand } from "./handlers";

// 基本的なメッセージイベントの型定義
interface BaseMessageEvent {
    type: string;
    channel: string;
    user: string;
    text: string;
    ts: string;
    channel_type: "im" | "channel" | "group";
    thread_ts?: string;
    subtype?: string;
}

interface SlackReply {
    ts: string;
    text?: string;
    bot_id?: string;
}

const lock = new AsyncLock();
const systemPromptCache: Record<string, string> = {};

export const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
    logLevel: LogLevel.INFO,
    port: process.env.PORT ? Number.parseInt(process.env.PORT) : 3000,
});

(async () => {
    await app.start();
    console.log("⚡️ Bolt app is running!");
    const keyvalues = await getAllKeyValue();
    // console.log({ keyvalues });
})();

const getChannelName = async (channelId: string): Promise<string | null> => {
    try {
        const result = await app.client.conversations.info({ channel: channelId });
        return result.channel.name || null;
    } catch (error) {
        console.error(`Error: ${error}`);
        return null;
    }
};

const getChannelMemberCount = async (channel: string): Promise<number> => {
    try {
        const response = await app.client.conversations.members({
            channel,
            limit: 3,
        });
        console.log(response.members);
        return response.members?.length || 0;
    } catch (error) {
        console.error(error);
        return 0;
    }
};

const getSystemPrompt = async (channelId: string): Promise<string> => {
    const channelName = await getChannelName(channelId);
    const key = `${channelId}:${channelName}`;

    // うらで更新
    readKeyValue(key).then((value) => {
        systemPromptCache[key] = value || "";
    });

    return systemPromptCache[key] || "";
};

const processMessage = async (event: BaseMessageEvent, asStream = false): Promise<string | Readable> => {
    const messages: ChatCompletionMessageParam[] = [];

    const systemPrompt = await getSystemPrompt(event.channel);
    console.log({ systemPrompt });
    if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
    }

    if (event.thread_ts) {
        const replies = await app.client.conversations.replies({
            channel: event.channel,
            ts: event.thread_ts,
            inclusive: true,
        });
        const sorted =
            replies.messages?.sort((a: SlackReply, b: SlackReply) => {
                if (a.ts < b.ts) return -1;
                if (a.ts > b.ts) return 1;
                return 0;
            }) || [];

        for (const message of sorted) {
            if (message.text) {
                messages.push({
                    role: message.bot_id ? "assistant" : "user",
                    content: message.text,
                });
            }
        }
    }

    if (event.text) {
        messages.push({ role: "user", content: event.text });
    }

    if (asStream) {
        return createChatCompletionStream(messages);
    }
    return createChatCompletion(messages);
};

const sendReplyWithStream = (channel: string, thread_ts: string, stream: Readable): Promise<void> => {
    const startTime = performance.now();
    let t = startTime;
    let reply = "";
    let prevReply = "";
    let message: { channel?: string; ts?: string } | undefined;

    const updateMessage = async () => {
        if (reply === prevReply) return;
        prevReply = reply;
        if (message) {
            await app.client.chat.update({
                channel: message.channel,
                ts: message.ts,
                text: reply,
            });
        } else {
            message = await app.client.chat.postMessage({
                channel,
                thread_ts,
                text: reply,
            });
        }
    };

    return new Promise((resolve, reject) => {
        stream.on("data", (data: Buffer) => {
            reply += data.toString();
            const dt = performance.now() - t;
            if (dt > 2000 && reply.length > 50) {
                t = performance.now();
                lock.acquire("updateMessage", updateMessage).catch(reject);
            }
        });

        stream.on("end", () => {
            lock.acquire("updateMessage", updateMessage).then(resolve).catch(reject);
        });

        stream.on("error", (error) => {
            reject(error);
        });
    });
};

// エラー型の定義
interface SlackBotError extends Error {
    type: "API_ERROR" | "THREAD_LENGTH_ERROR" | "RATE_LIMIT_ERROR" | "UNKNOWN_ERROR";
    details?: unknown;
}

class APIError extends Error implements SlackBotError {
    type = "API_ERROR" as const;
    constructor(
        message: string,
        public details?: unknown,
    ) {
        super(message);
        this.name = "APIError";
    }
}

class ThreadLengthError extends Error implements SlackBotError {
    type = "THREAD_LENGTH_ERROR" as const;
    constructor(
        message: string,
        public details?: unknown,
    ) {
        super(message);
        this.name = "ThreadLengthError";
    }
}

class RateLimitError extends Error implements SlackBotError {
    type = "RATE_LIMIT_ERROR" as const;
    constructor(
        message: string,
        public details?: unknown,
    ) {
        super(message);
        this.name = "RateLimitError";
    }
}

app.event("message", handleMessageEvent);
app.event("app_mention", handleMentionEvent);
app.event("reaction_added", handleReactionEvent);
app.command("/system-prompt", handleSystemPromptCommand);
