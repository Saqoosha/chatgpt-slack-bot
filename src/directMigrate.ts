#!/usr/bin/env ts-node
import dotenv from "dotenv";
dotenv.config();

import { writeSystemPrompt, initializeFirestore } from "./firestore";
import { logger } from "./logger";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";

const execPromise = promisify(exec);

const credentialsDir = path.resolve(__dirname, "../credentials");
const credentialsFiles = fs.readdirSync(credentialsDir);
const jsonFiles = credentialsFiles.filter(file => file.endsWith('.json'));
const credentialsPath = jsonFiles.length > 0 
    ? path.join(credentialsDir, jsonFiles[0]) 
    : null;

console.log(`使用するサービスアカウントキー: ${credentialsPath}`);

if (credentialsPath) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
}

/**
 * curlコマンドを使用してSSKVSからデータを取得し、Firestoreに移行するスクリプト
 */
async function migrateSystemPromptsToFirestore(): Promise<void> {
    try {
        logger.info({ event: "migration_start" }, "Starting migration from SSKVS to Firestore using curl");
        
        console.log("curlコマンドでSSKVSからデータを取得中...");
        const { stdout } = await execPromise('curl -L -s "https://script.google.com/macros/s/AKfycbwdSNemQwC25_le2OJ_B8f8TxQh3KP5be5U7Dbdk1TvqQL1G7DZJHuho5TbIdE99ws8Gg/exec?action=getAll"');
        
        let keyValues;
        try {
            keyValues = JSON.parse(stdout);
            logger.info({ event: "migration_data_fetched", count: keyValues.length }, "Fetched data from SSKVS using curl");
        } catch (parseError) {
            logger.error({ event: "migration_parse_error", error: parseError }, "Error parsing SSKVS data");
            console.error("JSONパースエラー:", parseError);
            console.log("パースできなかった内容:", stdout.substring(0, 500));
            return;
        }

        if (keyValues.length === 0) {
            logger.info({ event: "migration_no_data" }, "No data to migrate");
            return;
        }

        console.log(`${keyValues.length}件のデータを取得しました。Firestoreに移行します...`);

        let successCount = 0;
        let errorCount = 0;

        for (const { key, value } of keyValues) {
            try {
                await writeSystemPrompt(key, value);
                successCount++;
                logger.info({ event: "migration_item_success", key }, "Migrated system prompt");
                console.log(`移行成功: ${key}`);
            } catch (error) {
                errorCount++;
                logger.error(
                    { event: "migration_item_error", error, key },
                    "Error migrating system prompt"
                );
                console.error(`移行エラー: ${key}`, error);
            }
        }

        logger.info(
            { event: "migration_complete", total: keyValues.length, success: successCount, errors: errorCount },
            "Migration from SSKVS to Firestore completed"
        );
        
        console.log(`移行完了: 合計${keyValues.length}件、成功${successCount}件、エラー${errorCount}件`);
    } catch (error) {
        logger.error({ event: "migration_failed", error }, "Migration from SSKVS to Firestore failed");
        console.error("移行処理エラー:", error);
        throw error;
    }
}

async function main() {
    try {
        console.log("SSKVSからFirestoreへのデータ移行を開始します（curlを使用）...");
        
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
