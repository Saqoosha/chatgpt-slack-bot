import { getAllKeyValue } from "./sskvs";
import { writeSystemPrompt } from "./firestore";
import { logger } from "./logger";
import { getSystemPromptKey } from "./systemPrompt";

/**
 * SSKVSからFirestoreへのデータ移行スクリプト
 */
export async function migrateSystemPromptsToFirestore(): Promise<void> {
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
