import { OpenAI } from "openai";
import { performance } from "node:perf_hooks";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { PassThrough } from "node:stream";
import { config } from "./config";

const openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
});

const MODEL = config.OPENAI_MODEL || "o3-mini";

export async function createChatCompletion(messages: ChatCompletionMessageParam[]) {
    const startTime = performance.now();
    const completion = await openai.chat.completions.create({
        model: MODEL,
        messages,
        // max_tokens: 2000,
    });
    const apiTime = performance.now() - startTime;
    console.log({ openaiApiTime: `${apiTime}ms` });
    return completion.choices[0].message?.content;
}

export async function createChatCompletionStream(messages: ChatCompletionMessageParam[]) {
    const startTime = performance.now();
    const stream = await openai.chat.completions.create({
        model: MODEL,
        messages,
        // max_tokens: 2000,
        stream: true,
    });
    const apiInitTime = performance.now() - startTime;
    console.log({ openaiStreamInitTime: `${apiInitTime}ms` });

    const passThrough = new PassThrough();
    let firstChunkReceived = false;

    (async () => {
        try {
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (content) {
                    if (!firstChunkReceived) {
                        const timeToFirstChunk = performance.now() - startTime;
                        console.log({ timeToFirstChunk: `${timeToFirstChunk}ms` });
                        firstChunkReceived = true;
                    }
                    passThrough.write(content);
                }
            }
            const totalStreamTime = performance.now() - startTime;
            console.log({ totalStreamTime: `${totalStreamTime}ms` });
            passThrough.end();
        } catch (error) {
            console.error("Stream error:", error);
            passThrough.destroy(error as Error);
        }
    })();

    return passThrough;
}
