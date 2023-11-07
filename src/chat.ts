import { OpenAI } from "openai";
import { Readable } from "stream";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export type Role = "system" | "user" | "assistant";
export type ChatMessage = {
    role: Role;
    content: string;
};

export async function createChatCompletion(messages: ChatMessage[]) {
    const completion = await openai.chat.completions.create({
        model: "gpt-4-1106-preview",
        messages,
    });
    return completion.choices[0].message?.content;
}

export async function createChatCompletionStream(messages: ChatMessage[]) {
    const stream = openai.beta.chat.completions.stream({
        model: "gpt-4-1106-preview",
        messages,
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
