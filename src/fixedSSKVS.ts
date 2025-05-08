import { config } from "./config";
import { logger } from "./logger";

export interface KeyValue {
    key: string;
    value: string;
}

interface SSKVSResponse {
    value?: string | KeyValue[];
    error?: {
        message: string;
    };
}

/**
 * SSKVSにデータを書き込む関数
 * リダイレクトに対応したバージョン
 */
export async function writeKeyValue(key: string, value: string): Promise<string> {
    const timer = performance.now();
    try {
        const fetch = (await import("node-fetch")).default;
        const response = await fetch(`${config.SSKVS_API_URL}?action=write&key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`, {
            redirect: 'follow', // リダイレクトを自動的に追跡
        });
        
        const result = await response.json() as SSKVSResponse;
        
        if (result.error) {
            throw new Error(result.error.message);
        }
        
        logger.info(
            { event: "sskvs_write", key, duration: performance.now() - timer },
            "Data written to SSKVS"
        );
        
        return typeof result.value === 'string' ? result.value : "";
    } catch (error) {
        logger.error(
            { event: "sskvs_write_error", error, key, duration: performance.now() - timer },
            "Error writing to SSKVS"
        );
        throw error;
    }
}

/**
 * SSKVSからデータを読み取る関数
 * リダイレクトに対応したバージョン
 */
export async function readKeyValue(key: string): Promise<string> {
    const timer = performance.now();
    try {
        const fetch = (await import("node-fetch")).default;
        const response = await fetch(`${config.SSKVS_API_URL}?action=read&key=${encodeURIComponent(key)}`, {
            redirect: 'follow', // リダイレクトを自動的に追跡
        });
        
        const result = await response.json() as SSKVSResponse;
        
        if (result.error) {
            throw new Error(result.error.message);
        }
        
        logger.info(
            { event: "sskvs_read", key, duration: performance.now() - timer },
            "Data read from SSKVS"
        );
        
        return typeof result.value === 'string' ? result.value : "";
    } catch (error) {
        logger.error(
            { event: "sskvs_read_error", error, key, duration: performance.now() - timer },
            "Error reading from SSKVS"
        );
        return "";
    }
}

/**
 * SSKVSから全てのデータを取得する関数
 * リダイレクトに対応したバージョン
 */
export async function getAllKeyValue(): Promise<KeyValue[]> {
    const timer = performance.now();
    try {
        const fetch = (await import("node-fetch")).default;
        
        console.log(`SSKVS APIにリクエスト送信: ${config.SSKVS_API_URL}?action=getAll`);
        
        const response = await fetch(`${config.SSKVS_API_URL}?action=getAll`, {
            redirect: 'follow', // リダイレクトを自動的に追跡
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log(`SSKVS APIからのレスポンス: status=${response.status}, ok=${response.ok}, redirected=${response.redirected}`);
        if (response.redirected) {
            console.log(`リダイレクト先URL: ${response.url}`);
        }
        
        const textResponse = await response.text();
        console.log(`レスポンス内容: ${textResponse.substring(0, 200)}...`);
        
        let result;
        try {
            result = JSON.parse(textResponse) as SSKVSResponse;
        } catch (parseError) {
            console.error(`JSONパースエラー: ${parseError}`);
            console.log(`パースできなかった内容: ${textResponse.substring(0, 500)}`);
            
            if (textResponse.trim().startsWith('[') && textResponse.trim().endsWith(']')) {
                try {
                    const directData = JSON.parse(textResponse) as KeyValue[];
                    console.log(`直接JSONとしてパース成功: ${directData.length}件のデータ`);
                    return directData;
                } catch (directParseError) {
                    console.error(`直接JSONパースエラー: ${directParseError}`);
                }
            }
            
            throw parseError;
        }
        
        if (result.error) {
            throw new Error(result.error.message);
        }
        
        const keyValues = Array.isArray(result.value) ? result.value : [];
        
        console.log(`取得したデータ: ${keyValues.length}件`);
        if (keyValues.length > 0) {
            console.log(`最初のデータ: key=${keyValues[0].key}, value=${keyValues[0].value.substring(0, 50)}...`);
        }
        
        logger.info(
            { event: "sskvs_get_all", count: keyValues.length, duration: performance.now() - timer },
            "All data retrieved from SSKVS"
        );
        
        return keyValues;
    } catch (error) {
        console.error(`SSKVS取得エラー: ${error}`);
        logger.error(
            { event: "sskvs_get_all_error", error, duration: performance.now() - timer },
            "Error retrieving all data from SSKVS"
        );
        return [];
    }
}
