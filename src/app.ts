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
import { config } from "./config";
import { logger } from "./logger";
import { formatMarkdownForSlack } from "./markdown";

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
    token: config.SLACK_BOT_TOKEN,
    signingSecret: config.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: config.SLACK_APP_TOKEN,
    logLevel: LogLevel.INFO,
    port: config.PORT ? Number.parseInt(config.PORT) : 3000,
});

// グローバルエラーハンドラの追加
process.on("uncaughtException", (error) => {
    logger.error(
        {
            event: "uncaught_exception",
            error,
        },
        "Uncaught exception occurred",
    );
    // プロセスを終了させないようにエラーをキャッチするだけ
});

process.on("unhandledRejection", (reason, promise) => {
    logger.error(
        {
            event: "unhandled_rejection",
            reason,
            promise,
        },
        "Unhandled promise rejection occurred",
    );
    // プロセスを終了させないようにエラーをキャッチするだけ
});

// Boltのグローバルエラーハンドラ
app.error(async (error) => {
    logger.error(
        {
            event: "bolt_error",
            error,
        },
        "Error in Bolt app",
    );
    // エラーを処理して、アプリが落ちないようにする
});

// Slack接続の監視とヘルスチェック
let isHealthy = true;
const HEALTH_CHECK_INTERVAL = 60000; // 1分ごとにヘルスチェック

// 定期的なヘルスチェックを実行
const healthCheck = async () => {
    try {
        // Slackの認証情報をチェックして接続状態を確認
        await app.client.auth.test();

        if (!isHealthy) {
            logger.info({ event: "slack_connection_restored" }, "Connection to Slack has been restored");
            isHealthy = true;
        }
    } catch (error) {
        if (isHealthy) {
            logger.error({ event: "slack_connection_failed", error }, "Failed to connect to Slack API, connection may be broken");
            isHealthy = false;
        }

        // 接続エラーが続く場合は、一定回数後にプロセスを再起動
        // 静的な回数カウントではなく、連続失敗回数をファイルに保存してチェックする方法もある
        if (!isHealthy) {
            // エラーが5回連続で発生したらプロセスを再起動（5分間）
            // この回数はシステムの要件に応じて調整
            const errorFile = ".connection_errors";
            try {
                const errorCount = 0; // 現在は単純化のため0を使用
                // ここでファイルからエラーカウントを読み込む実装を追加できる

                if (errorCount >= 5) {
                    logger.error({ event: "slack_max_errors_reached", count: errorCount }, "Maximum connection errors reached, restarting...");
                    process.exit(1);
                }
            } catch (fileError) {
                logger.warn({ event: "error_file_read_failed", error: fileError }, "Failed to read error counter file");
            }
        }
    }
};

// ヘルスチェックを定期的に実行
setInterval(healthCheck, HEALTH_CHECK_INTERVAL);

(async () => {
    try {
        await app.start();
        console.log("⚡️ Bolt app is running!");
        const keyvalues = await getAllKeyValue();
        console.log({ keyvalues });
    } catch (error) {
        logger.error(
            {
                event: "app_start_error",
                error,
            },
            "Failed to start the Slack app",
        );
        // 起動時の失敗は致命的なので、プロセスを終了させてsystemdに再起動させる
        process.exit(1);
    }
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
            logger.info(
                {
                    event: "message_update_app",
                    channelId: message.channel,
                    messageTs: message.ts,
                    originalText: reply,
                    // formattedText: formatMarkdownForSlack(reply),
                },
                "Updating message from app.ts"
            );
            await app.client.chat.update({
                channel: message.channel,
                ts: message.ts,
                text: reply, // 変換処理を一時的に無効化
            });
        } else {
            logger.info(
                {
                    event: "message_post_app",
                    channelId: channel,
                    threadTs: thread_ts,
                    originalText: reply,
                    // formattedText: formatMarkdownForSlack(reply),
                },
                "Posting message from app.ts"
            );
            message = await app.client.chat.postMessage({
                channel,
                thread_ts,
                text: reply, // 変換処理を一時的に無効化
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
// app_mentionイベントを無効化して二重応答を防止
// app.event("app_mention", handleMentionEvent);
app.event("reaction_added", handleReactionEvent);
app.command("/system-prompt", handleSystemPromptCommand);
