import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { PassThrough } from "node:stream";
import { config } from "./config";

const openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
});

const MODEL = config.OPENAI_MODEL || "o3-mini";

export async function createChatCompletion(messages: ChatCompletionMessageParam[]) {
    const completion = await openai.chat.completions.create({
        model: MODEL,
        messages,
        // max_tokens: 2000,
    });
    return completion.choices[0].message?.content;
}

export async function createChatCompletionStream(messages: ChatCompletionMessageParam[]) {
    const stream = await openai.chat.completions.create({
        model: MODEL,
        messages,
        // max_tokens: 2000,
        stream: true,
    });

    const passThrough = new PassThrough();

    (async () => {
        try {
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (content) {
                    passThrough.write(content);
                }
            }
            passThrough.end();
        } catch (error) {
            passThrough.destroy(error as Error);
        }
    })();

    return passThrough;
}
