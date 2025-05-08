#!/usr/bin/env ts-node
import dotenv from "dotenv";
dotenv.config();

import { readSystemPrompt, writeSystemPrompt, getAllSystemPrompts } from "./firestore";
import { initializeFirestore } from "./firestore";
import { logger } from "./logger";

/**
 * Firestoreへの移行後の動作確認スクリプト
 */
async function main() {
    try {
        console.log("Firestoreの動作確認を開始します...");
        
        initializeFirestore();
        
        console.log("1. 全てのシステムプロンプトを取得中...");
        const allPrompts = await getAllSystemPrompts();
        console.log(`取得したプロンプト数: ${allPrompts.length}`);
        
        if (allPrompts.length > 0) {
            console.log("最初のプロンプト例:");
            console.log(`キー: ${allPrompts[0].key}`);
            console.log(`値: ${allPrompts[0].value.substring(0, 100)}...`);
            
            console.log("\n2. 特定のプロンプトを読み取り中...");
            const testKey = allPrompts[0].key;
            const prompt = await readSystemPrompt(testKey);
            console.log(`キー「${testKey}」のプロンプト: ${prompt.substring(0, 100)}...`);
            
            console.log("\n3. プロンプトを更新中...");
            const testValue = `テスト用プロンプト - ${new Date().toISOString()}`;
            await writeSystemPrompt(testKey, testValue);
            console.log(`キー「${testKey}」のプロンプトを更新しました`);
            
            console.log("\n4. 更新されたプロンプトを確認中...");
            const updatedPrompt = await readSystemPrompt(testKey);
            console.log(`更新後のプロンプト: ${updatedPrompt}`);
            
            console.log("\n5. 元の値に戻しています...");
            await writeSystemPrompt(testKey, allPrompts[0].value);
            console.log(`キー「${testKey}」のプロンプトを元の値に戻しました`);
        } else {
            console.log("プロンプトが見つかりませんでした。先に移行スクリプトを実行してください。");
        }
        
        console.log("\n動作確認が完了しました。");
        process.exit(0);
    } catch (error) {
        logger.error({ event: "verification_error", error }, "Verification script failed");
        console.error("エラーが発生しました:", error);
        process.exit(1);
    }
}

main();
