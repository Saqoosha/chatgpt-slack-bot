import { OpenAI } from "openai";
import { performance } from "node:perf_hooks";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { PassThrough } from "node:stream";
import { config } from "./config";
import { logger, Timer } from "./logger";

const openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
});

const MODEL = config.OPENAI_MODEL || "o3-mini";

export async function createChatCompletion(messages: ChatCompletionMessageParam[]) {
    const timer = new Timer("openai_completion");
    try {
        const completion = await openai.chat.completions.create({
            model: MODEL,
            messages,
            // max_tokens: 2000,
        });
        timer.end({ model: MODEL, status: "success" });
        return completion.choices[0].message?.content;
    } catch (error) {
        logger.error(
            {
                event: "openai_completion_error",
                error,
                model: MODEL,
            },
            "Error creating chat completion",
        );
        timer.end({ model: MODEL, status: "error" });
        throw error;
    }
}

export async function createChatCompletionStream(messages: ChatCompletionMessageParam[]) {
    const timer = new Timer("openai_stream_init");
    try {
        const stream = await openai.chat.completions.create({
            model: MODEL,
            messages,
            // max_tokens: 2000,
            stream: true,
        });
        timer.end({ model: MODEL, status: "success" });

        const passThrough = new PassThrough();
        let firstChunkReceived = false;
        const streamTimer = new Timer("openai_stream_process");

        (async () => {
            try {
                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content || "";
                    if (content) {
                        if (!firstChunkReceived) {
                            logger.info(
                                {
                                    event: "first_chunk_received",
                                    model: MODEL,
                                },
                                "Received first chunk from OpenAI",
                            );
                            firstChunkReceived = true;
                        }
                        passThrough.write(content);
                    }
                }
                streamTimer.end({ model: MODEL, status: "success" });
                passThrough.end();
            } catch (error) {
                logger.error(
                    {
                        event: "stream_processing_error",
                        error,
                        model: MODEL,
                    },
                    "Error processing stream",
                );
                streamTimer.end({ model: MODEL, status: "error" });
                passThrough.destroy(error as Error);
            }
        })();

        return passThrough;
    } catch (error) {
        logger.error(
            {
                event: "stream_initialization_error",
                error,
                model: MODEL,
            },
            "Error initializing stream",
        );
        timer.end({ model: MODEL, status: "error" });
        throw error;
    }
}
