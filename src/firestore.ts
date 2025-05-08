import { performance } from "node:perf_hooks";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { config } from "./config";
import { logger } from "./logger";

export const SYSTEM_PROMPTS_COLLECTION = "system_prompts";

let firestoreDB: Firestore;

export function initializeFirestore(): Firestore {
    if (firestoreDB) {
        return firestoreDB;
    }

    try {
        if (getApps().length === 0) {
            initializeApp({
                projectId: config.FIREBASE_PROJECT_ID,
            });
        }

        firestoreDB = getFirestore();
        firestoreDB.settings({ ignoreUndefinedProperties: true });
        logger.info({ event: "firestore_initialized", database: "chatgpt-slack-bot" }, "Firestore initialized successfully");
        return firestoreDB;
    } catch (error) {
        logger.error({ event: "firestore_init_error", error }, "Error initializing Firestore");
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
