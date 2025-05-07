import type { OpenAI as OpenAITypes } from "openai";
import OpenAI from "openai";
import { PassThrough } from "node:stream";
import { config } from "./config";
import { logger, Timer } from "./logger";
import type { SlackFile } from "./types";
import { processImageForOpenAI } from "./imageProcessor";
import { Readable } from "node:stream";

const openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
});

// Use a single model for all operations, configurable via environment variable or defaulting to gpt-4.1
const MODEL = config.OPENAI_MODEL || "gpt-4.1";

export async function createChatCompletion(messages: OpenAITypes.ChatCompletionMessageParam[]) {
    const timer = new Timer("openai_completion");
    try {
        const completion = await openai.chat.completions.create({
            model: MODEL, // Use MODEL
            messages,
        });
        timer.end({ model: MODEL, status: "success" });
        return completion.choices[0].message?.content;
    } catch (error) {
        logger.error(
            {
                event: "openai_completion_error",
                error,
                model: MODEL, // Use MODEL
            },
            "Error creating chat completion",
        );
        timer.end({ model: MODEL, status: "error" });
        throw error;
    }
}

export async function createChatCompletionStream(messages: OpenAITypes.ChatCompletionMessageParam[], slackFiles?: SlackFile[]) {
    let adaptedMessages = messages;
    let hasImageContent = false;

    if (slackFiles && slackFiles.length > 0) {
        const imageContentParts: OpenAITypes.ChatCompletionContentPartImage[] = [];
        for (const slackFile of slackFiles) {
            // Process each image file to get a Data URL
            const dataUrl = await processImageForOpenAI(slackFile, config.SLACK_BOT_TOKEN);
            if (dataUrl) {
                imageContentParts.push({
                    type: "image_url",
                    image_url: { url: dataUrl, detail: "auto" },
                });
            }
        }

        if (imageContentParts.length > 0) {
            hasImageContent = true;
            // Add image parts to the last user message or the only user message
            adaptedMessages = messages.map((msg, index) => {
                if (msg.role === "user" && (index === messages.length - 1 || messages.length === 1)) {
                    const existingContent = msg.content;
                    const newContentParts: OpenAITypes.ChatCompletionContentPart[] = [];

                    if (typeof existingContent === "string" && existingContent.trim() !== "") {
                        newContentParts.push({ type: "text", text: existingContent });
                    } else if (Array.isArray(existingContent)) {
                        // Filter only text parts if msg.content could have been an array of mixed types.
                        newContentParts.push(
                            ...existingContent.filter((part): part is OpenAITypes.ChatCompletionContentPartText => part.type === "text"),
                        );
                    }

                    newContentParts.push(...imageContentParts);

                    // If, after adding images, there are no text parts at all, add a default one.
                    if (!newContentParts.some((part) => part.type === "text")) {
                        newContentParts.unshift({ type: "text", text: "Describe the image(s)." });
                    }

                    return { ...msg, content: newContentParts };
                }
                return msg;
            });
        }
    }

    const timerLabel = `openai_stream_init_${hasImageContent ? "vision_capable" : "text_only"}`;
    const timer = new Timer(timerLabel);

    try {
        const stream = await openai.chat.completions.create({
            model: MODEL,
            messages: adaptedMessages,
            stream: true,
            // max_tokens: Consider adjusting for vision. OpenAI default is 4096 for gpt-4-turbo. For gpt-4.1, check docs.
        });
        timer.end({ model: MODEL, status: "success", hasFiles: hasImageContent });

        const passThrough = new PassThrough();
        let firstChunkReceived = false;
        const streamProcessTimer = new Timer(`openai_stream_process_${hasImageContent ? "vision_capable" : "text_only"}`);

        (async () => {
            try {
                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content || "";
                    if (content) {
                        if (!firstChunkReceived) {
                            logger.info(
                                {
                                    event: `first_chunk_received_${hasImageContent ? "vision_capable" : "text_only"}`,
                                    model: MODEL,
                                },
                                `Received first chunk from OpenAI (model: ${MODEL})`,
                            );
                            firstChunkReceived = true;
                        }
                        passThrough.write(content);
                    }
                }
                streamProcessTimer.end({ model: MODEL, status: "success" });
                passThrough.end();
            } catch (error) {
                // Log stream processing errors
                const errorContext: Record<string, unknown> = {
                    model: MODEL,
                    processingDuringStream: true,
                };
                if (error instanceof Error) {
                    errorContext.errorMessage = error.message;
                    errorContext.errorStack = error.stack;
                } else {
                    errorContext.errorDetails = String(error);
                }
                logger.error(
                    { event: `stream_processing_error_${hasImageContent ? "vision_capable" : "text_only"}`, details: errorContext },
                    "Error processing stream from OpenAI",
                );
                streamProcessTimer.end({ model: MODEL, status: "error" });
                passThrough.destroy(error instanceof Error ? error : new Error(String(error)));
            }
        })();

        return passThrough;
    } catch (error) {
        // Log initial call errors
        const errorContext: Record<string, unknown> = {
            model: MODEL,
            requestMessages: adaptedMessages,
        };
        if (error instanceof Error) {
            errorContext.errorMessage = error.message;
            errorContext.errorStack = error.stack;
        } else {
            errorContext.errorDetails = String(error);
        }

        logger.error(
            { event: "openai_call_failed", details: errorContext },
            `Failed to call OpenAI API: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Pass the error to the stream to notify the client
        const syntheticError = error instanceof Error ? error : new Error(`OpenAI API call failed: ${String(error)}`);
        return new Readable({
            read() {
                this.destroy(syntheticError);
            },
        });
    }
}

const INTENT_SYSTEM_PROMPT = `あなたは、Slackの会話を分析するアシスタントです。ユーザーからのメッセージが、AIアシスタントであるあなた自身に向けられた質問や要求を含んでいるかどうかを判断してください。
もしこの会話が、あなたとユーザーの二人だけで行われているスレッド内のメッセージであれば、そのユーザーのメッセージはあなたに向けられている可能性がより高いと考慮してください。
判断結果は、必ず以下のJSON形式で返してください。他の言葉は一切含めないでください。
\`\`\`json
{
  "should_reply": boolean
}
\`\`\`
ここで、should_replyの値は true または false のどちらかです。`;

export async function determineIntentToReply(userMessage: string): Promise<boolean> {
    const timer = new Timer("determine_intent_to_reply");
    try {
        const completion = await openai.chat.completions.create({
            model: MODEL, // Use MODEL
            messages: [
                { role: "system", content: INTENT_SYSTEM_PROMPT },
                { role: "user", content: userMessage },
            ],
            max_tokens: 50,
            temperature: 0,
            response_format: { type: "json_object" },
        });
        timer.end({ model: MODEL, status: "success" });
        const rawResponse = completion.choices[0].message?.content;
        if (!rawResponse) {
            logger.warn({ event: "intent_determined_empty_response", userMessage }, "Empty response from LLM for intent determination");
            return false;
        }

        try {
            const parsedResponse = JSON.parse(rawResponse);
            const shouldReply = parsedResponse.should_reply;
            if (typeof shouldReply !== "boolean") {
                logger.warn(
                    { event: "intent_determined_invalid_json_type", userMessage, rawResponse, parsedResponse },
                    "Invalid JSON type for should_reply",
                );
                return false;
            }
            logger.debug({ event: "intent_determined", userMessage, rawResponse, parsedResponse, shouldReply }, "Intent determination result");
            return shouldReply;
        } catch (parseError) {
            logger.error(
                {
                    event: "intent_determined_json_parse_error",
                    error: parseError,
                    model: MODEL, // Use MODEL
                    userMessage,
                    rawResponse,
                },
                "Error parsing JSON response for intent determination",
            );
            return false;
        }
    } catch (error) {
        logger.error(
            {
                event: "determine_intent_error",
                error,
                model: MODEL, // Use MODEL
                userMessage,
            },
            "Error determining intent to reply",
        );
        timer.end({ model: MODEL, status: "error" });
        return false;
    }
}
