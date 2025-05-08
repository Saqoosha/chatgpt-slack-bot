import type { Env } from "./types";

class ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ConfigError";
    }
}

function validateEnv(env: Partial<Env>): asserts env is Env {
    const requiredEnvVars: (keyof Env)[] = [
        "SLACK_BOT_TOKEN",
        "SLACK_SIGNING_SECRET",
        "SLACK_APP_TOKEN",
        "SLACK_BOT_USER_ID",
        "OPENAI_API_KEY",
        "SSKVS_API_URL",
        "FIREBASE_PROJECT_ID",
    ];

    const missingEnvVars = requiredEnvVars.filter((key) => !env[key]);
    if (missingEnvVars.length > 0) {
        throw new ConfigError(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
    }
}

export function loadConfig(): Env {
    validateEnv(process.env);
    return {
        SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
        SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
        SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN,
        SLACK_BOT_USER_ID: process.env.SLACK_BOT_USER_ID,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        SSKVS_API_URL: process.env.SSKVS_API_URL,
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
        PORT: process.env.PORT,
    };
}

export const config = loadConfig();
