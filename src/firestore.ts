import { performance } from "node:perf_hooks";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { config } from "./config";
import { logger } from "./logger";

export const SYSTEM_PROMPTS_COLLECTION = "system_prompts";

let firestoreDB: Firestore;

/**
 * Firestoreクライアントを初期化する関数
 * 
 * 注意: この関数を呼び出す前に、以下の準備が必要です:
 * 1. Firebase Consoleでプロジェクトを作成
 * 2. Firestoreデータベースを作成（「データベースの作成」ボタンをクリック）
 * 3. サービスアカウントに適切な権限を付与
 * 4. 環境変数GOOGLE_APPLICATION_CREDENTIALSを設定
 */
export function initializeFirestore(): Firestore {
    if (firestoreDB) {
        return firestoreDB;
    }

    try {
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            const errorMsg = "環境変数GOOGLE_APPLICATION_CREDENTIALSが設定されていません。";
            logger.error({ event: "firestore_env_error" }, errorMsg);
            throw new Error(errorMsg);
        }

        if (getApps().length === 0) {
            initializeApp({
                projectId: config.FIREBASE_PROJECT_ID,
            });
            logger.info({ 
                event: "firebase_app_initialized", 
                projectId: config.FIREBASE_PROJECT_ID,
                credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS
            }, "Firebase app initialized");
        }

        firestoreDB = getFirestore();
        
        firestoreDB.settings({ 
            ignoreUndefinedProperties: true
        });
        
        logger.info({ 
            event: "firestore_initialized", 
            projectId: config.FIREBASE_PROJECT_ID,
            databaseId: "(default)" // Firestoreのデフォルトデータベース
        }, "Firestore initialized successfully");
        
        return firestoreDB;
    } catch (error) {
        logger.error({ 
            event: "firestore_init_error", 
            error,
            projectId: config.FIREBASE_PROJECT_ID,
            credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || "未設定"
        }, "Error initializing Firestore");
        throw error;
    }
}

export async function writeSystemPrompt(key: string, value: string): Promise<void> {
    const db = initializeFirestore();
    const timer = performance.now();

    try {
        await db.collection(SYSTEM_PROMPTS_COLLECTION).doc(key).set({
            value,
            updatedAt: new Date(),
        });
        logger.info(
            { event: "firestore_write", key, duration: performance.now() - timer },
            "System prompt written to Firestore"
        );
    } catch (error) {
        logger.error(
            { event: "firestore_write_error", error, key, duration: performance.now() - timer },
            "Error writing system prompt to Firestore"
        );
        throw error;
    }
}

export async function readSystemPrompt(key: string): Promise<string> {
    const db = initializeFirestore();
    const timer = performance.now();

    try {
        const doc = await db.collection(SYSTEM_PROMPTS_COLLECTION).doc(key).get();
        const result = doc.exists ? doc.data()?.value || "" : "";
        
        logger.info(
            { event: "firestore_read", key, exists: doc.exists, duration: performance.now() - timer },
            "System prompt read from Firestore"
        );
        
        return result;
    } catch (error) {
        logger.error(
            { event: "firestore_read_error", error, key, duration: performance.now() - timer },
            "Error reading system prompt from Firestore"
        );
        return "";
    }
}

export async function getAllSystemPrompts(): Promise<{ key: string; value: string }[]> {
    const db = initializeFirestore();
    const timer = performance.now();

    try {
        const snapshot = await db.collection(SYSTEM_PROMPTS_COLLECTION).get();
        const results = snapshot.docs.map(doc => ({
            key: doc.id,
            value: doc.data().value || "",
        }));
        
        logger.info(
            { event: "firestore_get_all", count: results.length, duration: performance.now() - timer },
            "All system prompts retrieved from Firestore"
        );
        
        return results;
    } catch (error) {
        logger.error(
            { event: "firestore_get_all_error", error, duration: performance.now() - timer },
            "Error retrieving all system prompts from Firestore"
        );
        return [];
    }
}
