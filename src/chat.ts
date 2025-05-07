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
            model: MODEL, // 通常のモデルで一旦実装（軽量モデルがあれば変更）
            messages: [
                { role: "system", content: INTENT_SYSTEM_PROMPT },
                { role: "user", content: userMessage },
            ],
            max_tokens: 50, // JSON形式なので少し余裕を持たせる
            temperature: 0, // 判断なので創造性は不要
            response_format: { type: "json_object" }, // JSONモードを有効化
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
                    model: MODEL,
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
                model: MODEL,
                userMessage,
            },
            "Error determining intent to reply",
        );
        timer.end({ model: MODEL, status: "error" });
        return false; // エラー時は念のため応答しないようにfalseを返す
    }
}
