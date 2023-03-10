import dotenv from 'dotenv';
dotenv.config();

import { App, LogLevel, AppMentionEvent } from '@slack/bolt';
import { createChatCompletion, ChatMessage } from './chat';

const app = new App({
    token: process.env.SLACK_BOT_TOKEN!,
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN!,
    logLevel: LogLevel.INFO,
    port: parseInt(process.env.PORT!) || 3000,
});

(async () => {
    await app.start();
    console.log('⚡️ Bolt app is running!');
})();

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

const processMessage = async (event: AppMentionEvent) => {
    let messages: ChatMessage[] = [];
    if (event.thread_ts) {
        const replies = await app.client.conversations.replies({
            token: process.env.SLACK_BOT_TOKEN!,
            channel: event.channel,
            ts: event.thread_ts,
            inclusive: true,
        });
        const sorted = replies.messages?.sort((a, b) => {
            if (a.ts! < b.ts!) {
                return -1;
            }
            if (a.ts! > b.ts!) {
                return 1;
            }
            return 0;
        }) || [];
        for (const message of sorted) {
            messages.push({
                role: message.bot_id ? 'assistant' : 'user',
                content: message.text || ''
            });
        }
    }
    messages.push({ role: 'user', content: event.text || '' });
    return await createChatCompletion(messages) || "???";
};

app.event('message', async ({ event, say }) => {
    console.log(event);
    const ev = event as any;
    if (ev.channel_type === 'im'
        || (ev.channel_type === 'channel' && await getChannelMemberCount(ev.channel) == 2)) {
        const reply = await processMessage(ev);
        await say({
            text: reply,
            thread_ts: event.ts
        });
    }
});

app.event('app_mention', async ({ event, say }) => {
    console.log(event);
    let reply = await processMessage(event);
    if (!reply.startsWith(`<@${event.user}>`)) {
        reply = `<@${event.user}> ${reply}`;
    }
    await say({
        text: reply,
        thread_ts: event.ts
    });
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
        text: `${reply?.trim().replace(/^"(.*)"$/, '$1')}`,
        thread_ts: event.item.ts,
    });
});

// --

import express from 'express';
{
    const web = express();
    const port = process.env.PORT || 3001;
    web.get('/', (_req, res) => res.send('Hello World!'));
    web.listen(port, () => console.log(`Example app listening on port ${port}!`));
}
