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
