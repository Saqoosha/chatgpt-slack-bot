#!/usr/bin/env ts-node
import dotenv from "dotenv";
dotenv.config();

import { migrateSystemPromptsToFirestore } from "./migrateData";
import { initializeFirestore } from "./firestore";
import { logger } from "./logger";

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
