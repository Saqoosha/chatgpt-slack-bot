import { Configuration, CreateChatCompletionResponse, OpenAIApi } from "openai";
import { Readable, Writable } from "stream";

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export type Role = "system" | "user" | "assistant";
export type ChatMessage = {
    role: Role;
    content: string;
};

export async function createChatCompletion(messages: ChatMessage[]) {
    const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages,
    });
    return completion.data.choices[0].message?.content;
}

export async function createChatCompletionStream(messages: ChatMessage[]) {
    const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages,
        stream: true,
    }, { responseType: 'stream' });

    const stream = completion.data as any as Readable;
    stream.on('data', (buffer: Buffer) => {
        buffer.toString().split('data: ').forEach((s) => {
            s = s.trim();
            if (s == '[DONE]') {
                counter.push(null);
            } else if (s.indexOf('delta') >= 0) {
                const response = JSON.parse(s);
                if (response.choices?.length > 0) {
                    const choice = response.choices[0];
                    switch (choice.finish_reason) {
                        case null:
                            if (choice.delta?.content) {
                                counter.push(choice.delta.content);
                            }
                            break;
                        case 'stop':
                            counter.push(null);
                            break;
                    }
                }
            }
        });
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
