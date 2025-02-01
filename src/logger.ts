import pino from "pino";

interface LogEntry {
    msg?: string;
    event?: string;
    duration?: string;
    status?: string;
    phase?: string;
    channelId?: string;
    threadTs?: string;
    model?: string;
    error?: unknown;
    messageCount?: number;
    totalTokens?: number;
    [key: string]: unknown;
}

// ログメッセージのフォーマット関数
function formatLogMessage(log: LogEntry): string {
    const { event, duration, status, phase, channelId, threadTs, model, error, messageCount, totalTokens } = log;
    const parts = [];

    // イベント名（必須）
    parts.push(event);

    // 処理時間（存在する場合）
    if (duration) parts.push(duration);

    // オプション項目（存在する場合のみ追加）
    if (status) parts.push(`status: ${status}`);
    if (phase) parts.push(`phase: ${phase}`);
    if (channelId) parts.push(`ch: ${channelId.slice(-8)}`); // 最後の8文字のみ表示
    if (threadTs) parts.push(`thread: ${threadTs.slice(-8)}`); // 最後の8文字のみ表示
    if (model) parts.push(`model: ${model}`);
    if (messageCount) parts.push(`msgs: ${messageCount}`);
    if (totalTokens) parts.push(`tokens: ${totalTokens}`);
    if (error) parts.push(`error: ${error}`);

    return parts.join(" | ");
}

// 開発環境用の設定
const devConfig = {
    transport: {
        target: "pino-pretty",
        options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname",
            messageFormat: "{msg}",
            singleLine: true,
        },
    },
    formatters: {
        level: (label: string) => ({ level: label }),
        log: (object: LogEntry) => {
            return { msg: formatLogMessage(object) };
        },
    },
    base: undefined,
};

// 本番環境用の設定
const prodConfig = {
    formatters: {
        level: (label: string) => ({ level: label }),
        log: (object: LogEntry) => {
            return { msg: formatLogMessage(object) };
        },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: undefined,
};

// 環境に応じた設定を選択
const config = process.env.NODE_ENV === "production" ? prodConfig : devConfig;

// ロガーを作成
export const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    ...config,
});

// パフォーマンス計測用のユーティリティ
export class Timer {
    private startTime: number;
    private name: string;

    constructor(name: string) {
        this.name = name;
        this.startTime = performance.now();
    }

    end(metadata: Record<string, unknown> = {}): void {
        const duration = performance.now() - this.startTime;
        logger.info({
            event: this.name,
            duration: `${duration.toFixed(1)}ms`,
            ...metadata,
        });
    }
}

// 使用例:
// const timer = new Timer("operation_name");
// ... 処理 ...
// timer.end({ additionalInfo: "value" });
