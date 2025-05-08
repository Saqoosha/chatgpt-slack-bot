#!/usr/bin/env ts-node
import dotenv from "dotenv";
dotenv.config();

import { writeSystemPrompt } from "./firestore";
import { getAllKeyValue } from "./fixedSSKVS";
import { logger } from "./logger";
import { initializeFirestore } from "./firestore";

/**
 * SSKVSからFirestoreへのデータ移行スクリプト
 * リダイレクト対応版
 */
async function migrateSystemPromptsToFirestore(): Promise<void> {
    try {
        logger.info({ event: "migration_start" }, "Starting migration from SSKVS to Firestore");
        const keyValues = await getAllKeyValue();
        logger.info({ event: "migration_data_fetched", count: keyValues.length }, "Fetched data from SSKVS");

        if (keyValues.length === 0) {
            logger.info({ event: "migration_no_data" }, "No data to migrate");
            return;
        }

        let successCount = 0;
        let errorCount = 0;

        for (const { key, value } of keyValues) {
            try {
                await writeSystemPrompt(key, value);
                successCount++;
                logger.info({ event: "migration_item_success", key }, "Migrated system prompt");
            } catch (error) {
                errorCount++;
                logger.error(
                    { event: "migration_item_error", error, key },
                    "Error migrating system prompt"
                );
            }
        }

        logger.info(
            { event: "migration_complete", total: keyValues.length, success: successCount, errors: errorCount },
            "Migration from SSKVS to Firestore completed"
        );
    } catch (error) {
        logger.error({ event: "migration_failed", error }, "Migration from SSKVS to Firestore failed");
        throw error;
    }
}

async function main() {
    try {
        console.log("SSKVSからFirestoreへのデータ移行を開始します...");
        
        initializeFirestore();
        
        await migrateSystemPromptsToFirestore();
        
        console.log("データ移行が完了しました。");
        process.exit(0);
    } catch (error) {
        logger.error({ event: "migration_script_error", error }, "Migration script failed");
        console.error("エラーが発生しました:", error);
        process.exit(1);
    }
}

main();
