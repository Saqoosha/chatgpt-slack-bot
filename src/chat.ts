import { Configuration, OpenAIApi } from "openai";

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
    console.log(JSON.stringify(completion.data, null, 2));
    return completion.data.choices[0].message?.content;
}
