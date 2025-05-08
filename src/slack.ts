import { performance } from "node:perf_hooks";
import type { Readable } from "node:stream";
import AsyncLock from "async-lock";
import { app } from "./app";
import { logger, Timer } from "./logger";
const lock = new AsyncLock();

// チャンネル名のキャッシュ
interface ChannelCache {
    name: string;
    timestamp: number;
}

const channelCache = new Map<string, ChannelCache>();
const CACHE_TTL = 1000 * 60 * 60; // 1時間

export async function getChannelName(channelId: string): Promise<string | null> {
    const timer = new Timer("get_channel_name");
    try {
        // キャッシュをチェック
        const cached = channelCache.get(channelId);
        const now = Date.now();
        if (cached && now - cached.timestamp < CACHE_TTL) {
            timer.end({ status: "cache_hit", channelId });
            return cached.name;
        }

        const result = await app.client.conversations.info({ channel: channelId });
        const channelName = result.channel.name || null;

        if (channelName) {
            // 結果をキャッシュ
            channelCache.set(channelId, {
                name: channelName,
                timestamp: now,
            });
        }

        timer.end({ status: "cache_miss", channelId });
        return channelName;
    } catch (error) {
        logger.error(
            {
                event: "get_channel_name_error",
                error,
                channelId,
            },
            "Error fetching channel name",
        );
        timer.end({ status: "error", channelId });
        return null;
    }
}

// メンバー数のキャッシュ
interface MemberCountCache {
    count: number;
    timestamp: number;
}

const memberCountCache = new Map<string, MemberCountCache>();
const MEMBER_CACHE_TTL = 1000 * 60 * 5; // 5分

export async function getChannelMemberCount(channel: string): Promise<number> {
    const timer = new Timer("get_channel_member_count");
    try {
        // キャッシュをチェック
        const cached = memberCountCache.get(channel);
        const now = Date.now();
        if (cached && now - cached.timestamp < MEMBER_CACHE_TTL) {
            timer.end({ status: "cache_hit", channelId: channel });
            return cached.count;
        }

        const response = await app.client.conversations.members({
            channel,
            limit: 3,
        });
        const count = response.members?.length || 0;

        // 結果をキャッシュ
        memberCountCache.set(channel, {
            count,
            timestamp: now,
        });

        timer.end({ status: "cache_miss", channelId: channel });
        return count;
    } catch (error) {
        logger.error(
            {
                event: "get_channel_member_count_error",
                error,
                channelId: channel,
            },
            "Error fetching channel member count",
        );
        timer.end({ status: "error", channelId: channel });
        return 0;
    }
}

// ストリーミング設定
const STREAM_UPDATE_INTERVAL = 2000; // 更新間隔（ミリ秒）
const MIN_UPDATE_LENGTH = 50; // 最小更新文字数
const MAX_BUFFER_SIZE = 1024 * 8; // 最大バッファサイズ

export const sendReplyWithStream = (channel: string, thread_ts: string, stream: Readable, requestStartTime?: number): Promise<void> => {
    const timer = new Timer("send_reply_with_stream");
    let t = performance.now();
    let reply = "";
    let prevReply = "";
    let message: { channel?: string; ts?: string } | undefined;
    let bufferSize = 0;
    let firstMessageSent = false;

    const updateMessage = async () => {
        if (reply === prevReply) return;

        // 差分のサイズを計算
        const diffSize = Buffer.from(reply).length - Buffer.from(prevReply).length;
        bufferSize += diffSize;

        // バッファサイズが大きすぎる場合は強制的に更新
        const shouldForceUpdate = bufferSize >= MAX_BUFFER_SIZE;

        prevReply = reply;
        if (message) {
            logger.info(
                {
                    event: "message_update",
                    channelId: message.channel,
                    messageTs: message.ts,
                    text: reply,
                },
                "Updating message"
            );
            await app.client.chat.update({
                channel: message.channel,
                ts: message.ts,
                text: reply,
            });
            if (shouldForceUpdate) {
                // 更新後はバッファをリセット
                bufferSize = 0;
            }
        } else {
            logger.info(
                {
                    event: "message_post",
                    channelId: channel,
                    threadTs: thread_ts,
                    text: reply,
                },
                "Posting message"
            );
            message = await app.client.chat.postMessage({
                channel,
                thread_ts,
                text: reply,
            });
            bufferSize = 0;

            // 最初のメッセージ送信時の時間を計測
            if (!firstMessageSent && requestStartTime) {
                const totalTime = performance.now() - requestStartTime;
                const streamTime = performance.now() - t;
                logger.info(
                    {
                        event: "first_message_sent",
                        channelId: channel,
                        threadTs: thread_ts,
                        totalTime: `${totalTime.toFixed(2)}ms`,
                        streamTime: `${streamTime.toFixed(2)}ms`,
                        messageLength: reply.length,
                    },
                    "First message sent",
                );
                firstMessageSent = true;
            }
        }
    };

    return new Promise((resolve, reject) => {
        stream.on("data", (data: Buffer) => {
            reply += data.toString();
            const dt = performance.now() - t;

            if ((dt > STREAM_UPDATE_INTERVAL && reply.length - prevReply.length > MIN_UPDATE_LENGTH) || bufferSize >= MAX_BUFFER_SIZE) {
                // 更新条件：
                // 1. 前回の更新から一定時間経過 AND 一定量の文字数変更がある
                // 2. または、バッファサイズが上限を超えている
                t = performance.now();
                lock.acquire("updateMessage", updateMessage).catch(reject);
            }
        });

        stream.on("end", () => {
            // 最後の更新を確実に行う
            lock.acquire("updateMessage", updateMessage)
                .then(() => {
                    timer.end({ channelId: channel, threadTs: thread_ts });
                    resolve();
                })
                .catch(reject);
        });

        stream.on("error", (error) => {
            logger.error(
                {
                    event: "stream_error",
                    error,
                    channelId: channel,
                    threadTs: thread_ts,
                },
                "Error in stream processing",
            );
            timer.end({ status: "error", channelId: channel, threadTs: thread_ts });
            reject(error);
        });
    });
};
