#!/usr/bin/env ts-node
import dotenv from "dotenv";
dotenv.config();

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * 最もシンプルなFirestoreテストスクリプト
 * 権限エラーの原因を特定するための基本的なテストを実行します
 */
async function main() {
    try {
        console.log("=== シンプルFirestoreテスト ===");
        
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        
        console.log(`FIREBASE_PROJECT_ID: ${projectId || '未設定'}`);
        console.log(`GOOGLE_APPLICATION_CREDENTIALS: ${credentialsPath || '未設定'}`);
        
        if (!credentialsPath) {
            throw new Error("GOOGLE_APPLICATION_CREDENTIALS環境変数が設定されていません");
        }
        
        console.log("Firebase初期化中...");
        const serviceAccount = require(credentialsPath);
        
        initializeApp({
            credential: cert(serviceAccount)
        });
        
        console.log("Firestore初期化中...");
        const db = getFirestore();
        
        db.settings({ 
            ignoreUndefinedProperties: true,
            databaseId: "chatgpt-slack-bot" 
        });
        console.log(`データベースID: chatgpt-slack-bot`);
        
        console.log("コレクション一覧を取得中...");
        try {
            const collections = await db.listCollections();
            console.log(`コレクション一覧取得成功: ${collections.length}件`);
            
            for (const collection of collections) {
                console.log(`- ${collection.id}`);
            }
        } catch (error) {
            console.error("コレクション一覧取得エラー:", error);
        }
        
        console.log("\nテストデータ書き込み中...");
        try {
            const testRef = db.collection("_test_collection").doc("test_document");
            await testRef.set({
                message: "テストメッセージ",
                timestamp: new Date()
            });
            console.log("テストデータ書き込み成功");
            
            console.log("\nテストデータ読み取り中...");
            const docSnap = await testRef.get();
            if (docSnap.exists) {
                console.log("テストデータ読み取り成功:", docSnap.data());
            } else {
                console.log("テストデータが存在しません");
            }
            
            console.log("\nテストデータ削除中...");
            await testRef.delete();
            console.log("テストデータ削除成功");
            
        } catch (error) {
            console.error("テストデータ操作エラー:", error);
        }
        
        console.log("\n=== テスト完了 ===");
        
    } catch (error) {
        console.error("テストエラー:", error);
        process.exit(1);
    }
}

main();
