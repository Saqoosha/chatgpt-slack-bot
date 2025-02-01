import { config } from "./config";

export interface KeyValue {
    key: string;
    value: string;
}

interface SSKVSResponse {
    value?: string;
    error?: {
        message: string;
    };
}

async function writeKeyValue(key: string, value: string): Promise<string> {
    const fetch = (await import("node-fetch")).default;
    const response = await fetch(`${config.SSKVS_API_URL}?action=write&key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`);
    const result: SSKVSResponse = await response.json();
    console.log(result);

    if (result.error) {
        throw new Error(result.error.message);
    }

    return result.value || "";
}

async function readKeyValue(key: string): Promise<string> {
    const fetch = (await import("node-fetch")).default;
    const response = await fetch(`${config.SSKVS_API_URL}?action=read&key=${encodeURIComponent(key)}`);
    const result: SSKVSResponse = await response.json();
    console.log("readKeyValue:", result);

    return result.value || "";
}

async function getAllKeyValue(): Promise<KeyValue[]> {
    const fetch = (await import("node-fetch")).default;
    const response = await fetch(`${config.SSKVS_API_URL}?action=getAll`);
    const result: { error?: { message: string }; value?: KeyValue[] } = await response.json();
    // console.log(result);

    if (result.error) {
        throw new Error(result.error.message);
    }

    return result.value || [];
}

export { writeKeyValue, readKeyValue, getAllKeyValue };
