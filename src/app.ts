import dotenv from 'dotenv';
dotenv.config();

import { App, LogLevel } from '@slack/bolt';
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

app.event('app_mention', async ({ event, say }) => {
    console.log(event);
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
    const reply = await createChatCompletion(messages);
    await say({
        text: `<@${event.user}> ${reply}`,
        thread_ts: event.ts
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
