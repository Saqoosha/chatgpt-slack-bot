// 基本的なメッセージイベントの型定義
export interface BaseMessageEvent {
    type: string;
    channel: string;
    user: string;
    text: string;
    ts: string;
    channel_type: "im" | "channel" | "group";
    thread_ts?: string;
    subtype?: string;
}

export interface SlackReply {
    ts: string;
    text?: string;
    bot_id?: string;
}

export interface SystemPromptCommand {
    channel_id: string;
    user_id: string;
    text?: string;
}

// 環境変数の型定義
export interface Env {
    SLACK_BOT_TOKEN: string;
    SLACK_SIGNING_SECRET: string;
    SLACK_APP_TOKEN: string;
    SLACK_BOT_USER_ID: string;
    OPENAI_API_KEY: string;
    OPENAI_MODEL?: string;
    SSKVS_API_URL: string;
    PORT?: string;
}

declare global {
    namespace NodeJS {
        interface ProcessEnv extends Env {}
    }
}
