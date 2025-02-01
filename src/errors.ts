export interface SlackBotError extends Error {
    type: "API_ERROR" | "THREAD_LENGTH_ERROR" | "RATE_LIMIT_ERROR" | "UNKNOWN_ERROR";
    details?: unknown;
}

export class APIError extends Error implements SlackBotError {
    type = "API_ERROR" as const;
    constructor(
        message: string,
        public details?: unknown,
    ) {
        super(message);
        this.name = "APIError";
    }
}

export class ThreadLengthError extends Error implements SlackBotError {
    type = "THREAD_LENGTH_ERROR" as const;
    constructor(
        message: string,
        public details?: unknown,
    ) {
        super(message);
        this.name = "ThreadLengthError";
    }
}

export class RateLimitError extends Error implements SlackBotError {
    type = "RATE_LIMIT_ERROR" as const;
    constructor(
        message: string,
        public details?: unknown,
    ) {
        super(message);
        this.name = "RateLimitError";
    }
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof APIError) {
        return "ごめんなさい、今ちょっと調子が悪いみたいです。また後でお話しできますか？";
    }
    if (error instanceof ThreadLengthError) {
        return "新しいスレッドで続きをお話ししませんか？";
    }
    if (error instanceof RateLimitError) {
        return "今アクセスが集中しているみたいです。少し経ってからまたお話ししましょう。";
    }
    if (error instanceof Error) {
        return "ごめんなさい、うまく動作できませんでした。また後でお話しできますか？";
    }
    return "なんだか調子が悪いみたいです。また後でお話しできますか？";
}
