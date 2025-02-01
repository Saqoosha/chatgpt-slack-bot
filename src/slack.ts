import { performance } from "node:perf_hooks";
import type { Readable } from "node:stream";
import AsyncLock from "async-lock";
import { app } from "./app";

const lock = new AsyncLock();

export async function getChannelName(channelId: string): Promise<string | null> {
    try {
        const result = await app.client.conversations.info({ channel: channelId });
        return result.channel.name || null;
    } catch (error) {
        console.error(`Error: ${error}`);
        return null;
    }
}

export async function getChannelMemberCount(channel: string): Promise<number> {
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
}

export const sendReplyWithStream = (channel: string, thread_ts: string, stream: Readable): Promise<void> => {
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
