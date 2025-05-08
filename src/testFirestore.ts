#!/usr/bin/env ts-node
import dotenv from "dotenv";
dotenv.config();

import { initializeFirestore, writeSystemPrompt, readSystemPrompt } from "./firestore";
import { logger } from "./logger";

/**
 * Firestoreへのテストデータ作成スクリプト
 */
async function main() {
    try {
        console.log("Firestoreへのテストデータ作成を開始します...");
        
        const db = initializeFirestore();
        console.log("Firestoreが初期化されました");
        
        const testKey = "test-channel:test-channel-name";
        const testValue = `これはテスト用のシステムプロンプトです。作成日時: ${new Date().toISOString()}`;
        
        console.log(`テストデータを作成します: キー="${testKey}"`);
        await writeSystemPrompt(testKey, testValue);
        console.log("テストデータが作成されました");
        
        console.log("作成したデータを読み取ります...");
        const readValue = await readSystemPrompt(testKey);
        console.log(`読み取り結果: ${readValue}`);
        
        if (readValue === testValue) {
            console.log("✅ テストが成功しました！データの書き込みと読み取りが正常に機能しています。");
        } else {
            console.log("❌ テストが失敗しました。書き込んだデータと読み取ったデータが一致しません。");
        }
        
        console.log("\nFirestoreコンソールで確認してください:");
        console.log("1. https://console.firebase.google.com/ にアクセス");
        console.log("2. プロジェクトを選択");
        console.log("3. 左側メニューから「Firestore Database」を選択");
        console.log("4. コレクション「system_prompts」内にドキュメント「test-channel:test-channel-name」が存在するか確認");
        
        process.exit(0);
    } catch (error) {
        logger.error({ event: "test_error", error }, "Test script failed");
        console.error("エラーが発生しました:", error);
        process.exit(1);
    }
}

main();
