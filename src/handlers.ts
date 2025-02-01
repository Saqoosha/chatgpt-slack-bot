import type { SlackEventMiddlewareArgs } from "@slack/bolt";
import type { Readable } from "node:stream";
import { performance } from "node:perf_hooks";
import type { BaseMessageEvent, SystemPromptCommand } from "./types";
import { getErrorMessage } from "./errors";
import { processMessage } from "./messages";
import { sendReplyWithStream } from "./slack";
import { createChatCompletion } from "./chat";
import { getChannelMemberCount, getChannelName } from "./slack";
import { readKeyValue } from "./sskvs";
import { app } from "./app";
import { config } from "./config";
import { updateSystemPrompt } from "./systemPrompt";

// メッセージイベントのハンドラー
export async function handleMessageEvent({ event, say }: SlackEventMiddlewareArgs<"message">) {
    const startTime = performance.now();

    // Ignore messages with subtypes (like message_changed, etc.)
    if ("subtype" in event) {
        return;
    }

    const messageEvent = event as unknown as BaseMessageEvent;
    console.log(messageEvent);

    const botMention = `<@${config.SLACK_BOT_USER_ID}>`;

    if (
        messageEvent.channel_type === "im" ||
        ((messageEvent.channel_type === "channel" || messageEvent.channel_type === "group") &&
            (await getChannelMemberCount(messageEvent.channel)) === 2 &&
            !messageEvent.text?.startsWith(botMention))
    ) {
        try {
            const stream = (await processMessage(messageEvent, true)) as Readable;
            const processingTime = performance.now() - startTime;
            console.log(`Time to process request: ${processingTime}ms`);

            await sendReplyWithStream(messageEvent.channel, messageEvent.ts, stream);
        } catch (error: unknown) {
            console.error(error);
            const errorMessage = getErrorMessage(error);
            await app.client.chat.postMessage({
                channel: messageEvent.channel,
                thread_ts: messageEvent.ts,
                text: errorMessage,
            });
            const errorTime = performance.now() - startTime;
            console.log(`Error occurred after: ${errorTime}ms`);
        }
    }
}

// メンション時のハンドラー
export async function handleMentionEvent({ event }: SlackEventMiddlewareArgs<"app_mention">) {
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
        const errorMessage = getErrorMessage(error);
        await app.client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.ts,
            text: errorMessage,
        });
    }
}

// リアクション追加時のハンドラー
export async function handleReactionEvent({ event, say }: SlackEventMiddlewareArgs<"reaction_added">) {
    console.log(event);
    if (event.item.type !== "message") {
        return;
    }
    const lang = {
        jp: "日本語",
        "flag-jp": "日本語",
        us: "英語",
        "flag-us": "英語",
        "flag-tw": "台湾の繁体中国語",
        cn: "簡体中国語",
        "flag-cn": "簡体中国語",
        de: "ドイツ語",
        "flag-de": "ドイツ語",
        fr: "フランス語",
        "flag-fr": "フランス語",
        es: "スペイン語",
        "flag-es": "スペイン語",
        "flag-in": "ヒンディー語",
    }[event.reaction];
    if (!lang) {
        return;
    }
    const messages = await app.client.conversations.replies({
        channel: event.item.channel,
        ts: event.item.ts,
        inclusive: true,
    });
    if (!messages.messages) {
        return;
    }
    const message = messages.messages[0];
    if (!message.text) {
        return;
    }
    console.log(message);
    const reply = await createChatCompletion([
        {
            role: "system",
            content: `あなたは優秀な翻訳家です。USERから受け取ったメッセージを${lang}に翻訳して返答します。返答する際に前後に解説をいれたりしません。翻訳したメッセージのみを返信します。会話をするわけではないです。`,
        },
        { role: "user", content: `"${message.text}"` },
    ]);
    await say({
        text: reply?.trim().replace(/^"(.*)"$/, "$1") || "",
        thread_ts: event.item.ts,
    });
}

// システムプロンプトコマンドのハンドラー
export async function handleSystemPromptCommand({ command, ack }: { command: SystemPromptCommand; ack: () => Promise<void> }) {
    console.log({ command });
    await ack();

    if (command.text) {
        await updateSystemPrompt(command.channel_id, command.text);
        await app.client.chat.postEphemeral({
            channel: command.channel_id,
            user: command.user_id,
            text: `このチャンネルの ChatGPT システムプロンプトを「${command.text}」に設定しました。`,
        });
    } else {
        const channelName = await getChannelName(command.channel_id);
        const key = `${command.channel_id}:${channelName}`;
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
}
