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
    errorMessage?: string;
    messageCount?: number;
    totalTokens?: number;
    details?: Record<string, unknown>;
    [key: string]: unknown;
}

// ログメッセージのフォーマット関数
function formatLogMessage(log: LogEntry): string {
    const { event, duration, status, phase, channelId, threadTs, model, error, errorMessage, messageCount, totalTokens, details } = log;
    const parts = [];

    if (event) parts.push(`event: ${event}`);
    else parts.push("event: (missing)");

    // Optional duration
        parts.push(`duration: ${duration}`);

    // Other optional parts from original logic
        parts.push(`status: ${status}`);
    if (phase) parts.push(`phase: ${phase}`);
    if (channelId) parts.push(`ch: ${channelId.slice(-8)}`);
    if (threadTs) parts.push(`thread: ${threadTs.slice(-8)}`);
    if (model) parts.push(`model: ${model}`);
    if (messageCount) parts.push(`msgs: ${messageCount}`);
    if (totalTokens) parts.push(`tokens: ${totalTokens}`);

    const errorMessageToDisplay = errorMessage || (error ? String(error) : undefined);
    if (errorMessageToDisplay) {
        parts.push(`errMsg: ${errorMessageToDisplay}`);
    } else {
        parts.push("errMsg: (missing)");
    }

    if (details && Object.keys(details).length > 0) {
        try {
            parts.push(`detailsObj: ${JSON.stringify(details)}`);
        } catch (e) {
            parts.push("detailsObj: (failed to stringify)");
        }
    } else if (details) {
        parts.push("detailsObj: (empty object)");
    } else {
        parts.push("detailsObj: (undefined)");
    }

    parts.push(`rawLogKeys: ${Object.keys(log).join(",")}`);

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
            singleLine: false,
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
