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
    files?: SlackFile[];
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

export interface SlackFile {
    id: string;
    created: number;
    timestamp: number;
    name: string;
    title: string;
    mimetype: string;
    filetype: string;
    pretty_type: string;
    user: string;
    editable: boolean;
    size: number;
    mode: string;
    is_external: boolean;
    external_type: string;
    is_public: boolean;
    public_url_shared: boolean;
    display_as_bot: boolean;
    username: string;
    url_private: string;
    url_private_download: string;
    thumb_64?: string;
    thumb_80?: string;
    thumb_160?: string;
    thumb_360?: string;
    thumb_480?: string;
    thumb_720?: string;
    thumb_960?: string;
    thumb_1024?: string;
    permalink: string;
    permalink_public?: string;
    channels: string[];
    groups: string[];
    ims: string[];
    shares?: object;
    has_rich_preview?: boolean;
}
