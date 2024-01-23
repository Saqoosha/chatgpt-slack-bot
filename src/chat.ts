import { OpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { Readable } from "stream";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function createChatCompletion(messages: ChatCompletionMessageParam[]) {
    const completion = await openai.chat.completions.create({
        model: "gpt-4-1106-preview",
        messages,
        max_tokens: 2000,
    });
    return completion.choices[0].message?.content;
}

export async function createChatCompletionStream(messages: ChatCompletionMessageParam[]) {
    const stream = openai.beta.chat.completions.stream({
        model: "gpt-4-1106-preview",
        messages,
        max_tokens: 2000,
        stream: true,
    });

    stream.on('content', (delta, snapshot) => {
        counter.push(delta);
    });
    stream.on('end', () => {
        counter.push(null);
    });
    stream.on('error', (error: Error) => {
        counter.push(null);
    });
    const counter = new Readable({ read() { } });
    return counter;
}
