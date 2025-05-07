import pino from "pino";

// Define a more structured LogEntry for consistent object logging
interface LogEntry {
    event?: string;
    msg?: string; // For the main human-readable message if any
    details?: Record<string, unknown>; // All other context-specific info goes here
    // pino adds level, time by default.
    // pid, hostname are not added because base: undefined.
}

// Define a custom application error class
export class AppError extends Error {
    details: Record<string, unknown>;

    constructor(message: string, details: Record<string, unknown> = {}) {
        super(message);
        this.name = "AppError";
        this.details = details;
        // Set the prototype explicitly to allow instanceof to work correctly
        Object.setPrototypeOf(this, AppError.prototype);
    }
}

// This function structures the input object into our desired LogEntry format.
function structureLogObject(input: object): LogEntry {
    // If the input is an AppError, extract its message and details
    if (input instanceof AppError) {
        const { message, details, name, stack, ...appErrorRest } = input;
        const entry: LogEntry = {};
        if (message) entry.msg = message; // Use AppError's message as the primary msg
        // Add AppError's own details, plus any other enumerable properties from the error object itself
        entry.details = { ...details, errorName: name, ...appErrorRest };
        // Optionally, could add stack to details if needed: entry.details.stack = stack;
        return entry;
    }

    // For other objects, proceed as before
    const { event, msg, ...rest } = input as Record<string, unknown>;
    const entry: LogEntry = {};

    if (typeof event === "string") entry.event = event;
    // If msg exists on the original object (and it wasn't an AppError), use it.
    // If input was an AppError, its message is already entry.msg.
    if (typeof msg === "string" && !(input instanceof AppError)) entry.msg = msg;

    const detailsToLog: Record<string, unknown> = {};
    let hasDetails = false;
    for (const key in rest) {
        if (Object.prototype.hasOwnProperty.call(rest, key)) {
            hasDetails = true;
            if (key === "dataPreview" && typeof rest[key] === "string" && (rest[key] as string).length > 200) {
                detailsToLog[key] = `${(rest[key] as string).substring(0, 200)}... (truncated)`;
            } else {
                detailsToLog[key] = rest[key];
            }
        }
    }

    if (hasDetails) {
        // If entry.details already exists (from AppError), merge them.
        // Otherwise, assign detailsToLog.
        entry.details = entry.details ? { ...entry.details, ...detailsToLog } : detailsToLog;
    }

    return entry;
}

// Common formatter for both dev and prod, ensuring the return type matches pino's expectations.
const logFormatter = (object: object): Record<string, unknown> => {
    // pino expects the object returned by a custom log formatter
    // to be a flat object where it will then add its own properties like time, level etc.
    // Our structureLogObject returns something like { event: '...', msg: '...', details: { ... } }
    // This is already a Record<string, unknown> essentially.
    return structureLogObject(object) as Record<string, unknown>;
};

// 開発環境用の設定 (pino-pretty を削除し、本番と同様の構造化JSONログを目指す)
const devConfig = {
    formatters: {
        level: (label: string) => ({ level: label }),
        log: logFormatter, // Use the common formatter
    },
    timestamp: pino.stdTimeFunctions.isoTime, // Consistent timestamp format
    base: undefined, // No pid, hostname
};

// 本番環境用の設定 (こちらも共通フォーマッタを使用)
const prodConfig = {
    formatters: {
        level: (label: string) => ({ level: label }),
        log: logFormatter, // Use the common formatter
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
