import dotenv from 'dotenv';
dotenv.config();

import { performance } from "node:perf_hooks";
import type { Readable } from "node:stream";
import { App, LogLevel } from "@slack/bolt";
import type { SlackEventMiddlewareArgs } from "@slack/bolt";
import AsyncLock from 'async-lock';

import { createChatCompletion, createChatCompletionStream } from './chat';
import { getAllKeyValue, readKeyValue, writeKeyValue } from './sskvs';
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";

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

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
    logLevel: LogLevel.INFO,
    port: process.env.PORT ? Number.parseInt(process.env.PORT) : 3000,
});

(async () => {
    await app.start();
    console.log('⚡️ Bolt app is running!');
    const keyvalues = await getAllKeyValue();
    for (const kv of keyvalues) {
        systemPromptCache[kv.key] = kv.value;
    }
    console.log({ systemPromptCache });
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
    readKeyValue(key).then((value) => { systemPromptCache[key] = value || ''; });

    return systemPromptCache[key] || '';
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

app.event("message", async ({ event, say }: SlackEventMiddlewareArgs<"message">) => {
    // Ignore messages with subtypes (like message_changed, etc.)
    if ("subtype" in event) {
        return;
    }

    const messageEvent = event as unknown as BaseMessageEvent;
    console.log(messageEvent);

    const botMention = `<@${process.env.SLACK_BOT_USER_ID}>`;

    if (
        messageEvent.channel_type === "im" ||
        ((messageEvent.channel_type === "channel" || messageEvent.channel_type === "group") &&
            (await getChannelMemberCount(messageEvent.channel)) === 2 &&
            !messageEvent.text?.startsWith(botMention))
    ) {
        try {
            const stream = (await processMessage(messageEvent, true)) as Readable;
            await sendReplyWithStream(messageEvent.channel, messageEvent.ts, stream);
        } catch (error: unknown) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            await app.client.chat.postMessage({
                channel: messageEvent.channel,
                thread_ts: messageEvent.ts,
                text: `エラーが発生しました：${errorMessage}（スレッドが長すぎるかも…）`,
            });
        }
    }
});

app.event('app_mention', async ({ event }) => {
    const messageEvent: BaseMessageEvent = {
        type: "message",
        channel: event.channel,
        user: event.user,
        text: event.text || "",
        ts: event.ts,
        channel_type: "channel",
        thread_ts: event.thread_ts,
    };

    try {
        const stream = (await processMessage(messageEvent, true)) as Readable;
        await sendReplyWithStream(event.channel, event.ts, stream);
    } catch (error: unknown) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        await app.client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.ts,
            text: `エラーが発生しました：${errorMessage}（スレッドが長すぎるかも…）`,
        });
    }
});

app.event('reaction_added', async ({ event, say }) => {
    console.log(event);
    if (event.item.type !== 'message') { return; }
    const lang = {
        'jp': '日本語',
        'flag-jp': '日本語',
        'us': '英語',
        'flag-us': '英語',
        'flag-tw': '台湾の繁体中国語',
        'cn': '簡体中国語',
        'flag-cn': '簡体中国語',
        'de': 'ドイツ語',
        'flag-de': 'ドイツ語',
        'fr': 'フランス語',
        'flag-fr': 'フランス語',
        'es': 'スペイン語',
        'flag-es': 'スペイン語',
        'flag-in': 'ヒンディー語',
    }[event.reaction];
    if (!lang) { return; }
    const messages = await app.client.conversations.replies({
        channel: event.item.channel,
        ts: event.item.ts,
        inclusive: true,
    });
    if (!messages.messages) { return; }
    const message = messages.messages[0];
    if (!message.text) { return; }
    console.log(message);
    const reply = await createChatCompletion([
        { role: 'system', content: `あなたは優秀な翻訳家です。USERから受け取ったメッセージを${lang}に翻訳して返答します。返答する際に前後に解説をいれたりしません。翻訳したメッセージのみを返信します。会話をするわけではないです。` },
        { role: 'user', content: `"${message.text}"` },
    ]);
    await say({
        text: reply?.trim().replace(/^"(.*)"$/, "$1") || "",
        thread_ts: event.item.ts,
    });
});

app.command('/system-prompt', async ({ command, ack }) => {
    console.log({ command });
    await ack();

    const channelName = await getChannelName(command.channel_id);
    const key = `${command.channel_id}:${channelName}`;
    if (command.text) {
        await writeKeyValue(key, command.text);
        systemPromptCache[key] = command.text;
        await app.client.chat.postEphemeral({
            channel: command.channel_id,
            user: command.user_id,
            text: `このチャンネルの ChatGPT システムプロンプトを「${command.text}」に設定しました。`,
        });
    } else {
        const prompt = await readKeyValue(key);
        if (prompt) {
            await app.client.chat.postEphemeral({
                channel: command.channel_id,
                user: command.user_id,
                text: `このチャンネルの ChatGPT システムプロンプトは「${prompt}」です。`,
            });
        } else {
            await app.client.chat.postEphemeral({
                channel: command.channel_id,
                user: command.user_id,
                text: "このチャンネルの ChatGPT システムプロンプトは設定されていません。",
            });
        }
    }
});
