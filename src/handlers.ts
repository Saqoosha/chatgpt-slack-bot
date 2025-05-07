import type { SlackEventMiddlewareArgs } from "@slack/bolt";
import type { Readable } from "node:stream";
import { performance } from "node:perf_hooks";
import type { BaseMessageEvent, SystemPromptCommand } from "./types";
import { getErrorMessage } from "./errors";
import { processMessage } from "./messages";
import { sendReplyWithStream } from "./slack";
import { createChatCompletion, determineIntentToReply } from "./chat";
import { getChannelMemberCount, getChannelName } from "./slack";
import { readKeyValue } from "./sskvs";
import { app } from "./app";
import { config } from "./config";
import { updateSystemPrompt } from "./systemPrompt";
import { logger, Timer } from "./logger";

// メッセージイベントのハンドラー
export async function handleMessageEvent({ event, say }: SlackEventMiddlewareArgs<"message">) {
    const timer = new Timer("handle_message");

    if ("subtype" in event) {
        // Ignore messages with subtypes (like message_changed, etc.)
        return;
    }

    const messageEvent = event as unknown as BaseMessageEvent;
    logger.debug({ event: "message_received", messageEvent }, "Message event received");

    const botMention = `<@${config.SLACK_BOT_USER_ID}>`;

    // ボットへの呼びかけとみなす条件チェック
    const isBotMentioned = (text?: string): boolean => {
        if (!text) {
            return false;
        }
        // 明示的なメンション（文中でもOK）
        if (text.includes(botMention)) {
            return true;
        }
        // 「ChatGPT」という言葉を含む (スペースや大文字・小文字を許容する正規表現)
        const chatGptRegex = /chat\s*gpt/i;
        if (chatGptRegex.test(text)) {
            return true;
        }
        return false;
    };

    // スレッド内で過去にユーザーからのメンションがあったか確認する関数
    const wasBotMentionedInThreadHistory = async (channelId: string, threadTs: string): Promise<boolean> => {
        const threadTimer = new Timer("fetch_thread_replies_for_mention_check");
        try {
            const replies = await app.client.conversations.replies({
                channel: channelId,
                ts: threadTs,
            });
            threadTimer.end({ channelId, threadTs, status: "success" });

            if (replies.messages && replies.messages.length > 0) {
                for (const message of replies.messages) {
                    // ユーザーからのメッセージで、かつボットへのメンションがあるか確認
                    if (message.user && message.user !== config.SLACK_BOT_USER_ID && isBotMentioned(message.text)) {
                        logger.info(
                            { event: "thread_mention_check", reason: "mentioned_in_thread_history", channelId, threadTs, responds: true },
                            "Bot was mentioned in thread history by a user.",
                        );
                        return true;
                    }
                }
            }
        } catch (error) {
            logger.error(
                {
                    event: "fetch_thread_replies_error_mention_check",
                    error,
                    channelId,
                    threadTs,
                },
                "Error fetching thread replies for mention check",
            );
            threadTimer.end({ channelId, threadTs, status: "error" });
        }
        return false;
    };

    // チャンネルタイプ別の応答条件を判定
    const shouldRespondToMessage = async (currentEvent: BaseMessageEvent): Promise<boolean> => {
        // DMは常に応答
        if (currentEvent.channel_type === "im") {
            logger.debug({ event: "should_respond_check", channelType: currentEvent.channel_type, responds: true }, "Responding to IM");
            return true;
        }

        // 現在のメッセージがボットへの呼びかけなら応答 (最優先)
        if (isBotMentioned(currentEvent.text)) {
            logger.debug(
                { event: "should_respond_check", reason: "current_message_mentioned", responds: true },
                "Responding due to current message mention",
            );
            return true;
        }

        // チャンネルまたはグループの場合
        if (currentEvent.channel_type === "channel" || currentEvent.channel_type === "group") {
            // スレッド内で、過去に一度でもユーザーからのメンションがあれば応答
            if (currentEvent.thread_ts) {
                if (await wasBotMentionedInThreadHistory(currentEvent.channel, currentEvent.thread_ts)) {
                    // スレッドメンションあり、かつ最新メッセージの意図がボット宛なら応答
                    if (currentEvent.text && (await determineIntentToReply(currentEvent.text))) {
                        logger.info(
                            {
                                event: "should_respond_check",
                                reason: "intent_to_reply_in_thread",
                                channelId: currentEvent.channel,
                                threadTs: currentEvent.thread_ts,
                                responds: true,
                            },
                            "Intent to reply confirmed by LLM in mentioned thread.",
                        );
                        return true;
                    }
                }
            }

            // 上記スレッドチェックで応答が決まらなかった場合
            // 少人数（ボット+1人）チャンネルの場合も応答
            // (この条件は、スレッド外のメッセージや、スレッドだがまだ誰もメンションしてない場合に適用される)
            const memberCount = await getChannelMemberCount(currentEvent.channel);
            if (memberCount === 2) {
                logger.debug(
                    { event: "should_respond_check", reason: "small_channel", memberCount, responds: true },
                    "Responding due to small channel size",
                );
                return true;
            }
        }

        logger.debug({ event: "should_respond_check", responds: false }, "Not responding based on conditions");
        return false;
    };

    if (await shouldRespondToMessage(messageEvent)) {
        // 応答条件を判定
        try {
            const stream = (await processMessage(messageEvent, true)) as Readable;
            timer.end({ phase: "message_processing", channelId: messageEvent.channel });

            await sendReplyWithStream(messageEvent.channel, messageEvent.ts, stream);
        } catch (error: unknown) {
            logger.error(
                {
                    event: "message_handler_error",
                    error,
                    channelId: messageEvent.channel,
                    threadTs: messageEvent.ts,
                },
                "Error handling message",
            );
            const errorMessage = getErrorMessage(error);
            await app.client.chat.postMessage({
                channel: messageEvent.channel,
                thread_ts: messageEvent.ts,
                text: errorMessage,
            });
            timer.end({ status: "error", channelId: messageEvent.channel });
        }
    }
}

// メンション時のハンドラー
export async function handleMentionEvent({ event }: SlackEventMiddlewareArgs<"app_mention">) {
    const timer = new Timer("handle_mention");
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
        timer.end({ status: "success", channelId: event.channel });
    } catch (error: unknown) {
        logger.error(
            {
                event: "mention_handler_error",
                error,
                channelId: event.channel,
                threadTs: event.ts,
            },
            "Error handling mention",
        );
        const errorMessage = getErrorMessage(error);
        await app.client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.ts,
            text: errorMessage,
        });
        timer.end({ status: "error", channelId: event.channel });
    }
}

// リアクション追加時のハンドラー
export async function handleReactionEvent({ event, say }: SlackEventMiddlewareArgs<"reaction_added">) {
    const timer = new Timer("handle_reaction");
    logger.debug({ event: "reaction_received", reactionEvent: event }, "Reaction event received");

    if (event.item.type !== "message") {
        timer.end({ status: "ignored", reason: "non_message_reaction" });
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
        timer.end({ status: "ignored", reason: "unsupported_language" });
        return;
    }

    try {
        const messages = await app.client.conversations.replies({
            channel: event.item.channel,
            ts: event.item.ts,
            inclusive: true,
        });

        if (!messages.messages) {
            timer.end({ status: "error", reason: "no_messages" });
            return;
        }

        const message = messages.messages[0];
        if (!message.text) {
            timer.end({ status: "error", reason: "no_text" });
            return;
        }

        logger.debug({ originalMessage: message }, "Original message for translation");

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

        timer.end({ status: "success", language: lang });
    } catch (error) {
        logger.error(
            {
                event: "translation_error",
                error,
                channelId: event.item.channel,
                threadTs: event.item.ts,
                language: lang,
            },
            "Error translating message",
        );
        // エラーメッセージをユーザーに通知
        try {
            await app.client.chat.postMessage({
                channel: event.item.channel,
                thread_ts: event.item.ts,
                text: `翻訳処理中にエラーが発生しました。(${lang}への翻訳)`,
            });
        } catch (postError) {
            logger.error(
                {
                    event: "error_notification_failed",
                    error: postError,
                    channelId: event.item.channel,
                    threadTs: event.item.ts,
                },
                "Failed to notify user about translation error",
            );
        }
        timer.end({ status: "error", language: lang });
    }
}

// システムプロンプトコマンドのハンドラー
export async function handleSystemPromptCommand({ command, ack }: { command: SystemPromptCommand; ack: () => Promise<void> }) {
    const timer = new Timer("handle_system_prompt_command");
    logger.debug({ command }, "System prompt command received");
    await ack();

    try {
        if (command.text) {
            await updateSystemPrompt(command.channel_id, command.text);
            await app.client.chat.postEphemeral({
                channel: command.channel_id,
                user: command.user_id,
                text: `このチャンネルの ChatGPT システムプロンプトを「${command.text}」に設定しました。`,
            });
            timer.end({ status: "success", action: "update" });
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
                timer.end({ status: "success", action: "read" });
            } else {
                await app.client.chat.postEphemeral({
                    channel: command.channel_id,
                    user: command.user_id,
                    text: "このチャンネルの ChatGPT システムプロンプトは設定されていません。",
                });
                timer.end({ status: "success", action: "read_empty" });
            }
        }
    } catch (error) {
        logger.error(
            {
                event: "system_prompt_command_error",
                error,
                channelId: command.channel_id,
                userId: command.user_id,
            },
            "Error handling system prompt command",
        );
        timer.end({ status: "error" });
        try {
            await app.client.chat.postEphemeral({
                channel: command.channel_id,
                user: command.user_id,
                text: "システムプロンプトの処理中にエラーが発生しました。",
            });
        } catch (postError) {
            logger.error(
                {
                    event: "error_notification_failed",
                    error: postError,
                    channelId: command.channel_id,
                    userId: command.user_id,
                },
                "Failed to notify user about error",
            );
        }
    }
}
