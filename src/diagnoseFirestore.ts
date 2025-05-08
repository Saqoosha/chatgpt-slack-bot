#!/usr/bin/env ts-node
import dotenv from "dotenv";
dotenv.config();

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { config } from "./config";
import { logger } from "./logger";
import * as fs from "fs";
import * as path from "path";

/**
 * Firestoreの接続診断スクリプト
 * 権限エラーの原因を特定するための詳細情報を出力します
 */
async function main() {
    try {
        console.log("=== Firestore診断ツール ===");
        console.log("\n1. 環境変数の確認");
        
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        
        console.log(`FIREBASE_PROJECT_ID: ${projectId || '未設定'}`);
        console.log(`GOOGLE_APPLICATION_CREDENTIALS: ${credentialsPath || '未設定'}`);
        
        if (!projectId) {
            console.error("エラー: FIREBASE_PROJECT_ID が設定されていません。");
            process.exit(1);
        }
        
        if (!credentialsPath) {
            console.error("エラー: GOOGLE_APPLICATION_CREDENTIALS が設定されていません。");
            process.exit(1);
        }
        
        console.log("\n2. 認証情報ファイルの確認");
        
        if (!fs.existsSync(credentialsPath)) {
            console.error(`エラー: 認証情報ファイルが見つかりません: ${credentialsPath}`);
            process.exit(1);
        }
        
        try {
            const credentialContent = fs.readFileSync(credentialsPath, 'utf8');
            const credential = JSON.parse(credentialContent);
            
            console.log("認証情報ファイルの読み込み: 成功");
            console.log(`- project_id: ${credential.project_id}`);
            console.log(`- client_email: ${credential.client_email}`);
            
            if (credential.project_id !== projectId) {
                console.warn(`警告: 認証情報のproject_id(${credential.project_id})とFIREBASE_PROJECT_ID(${projectId})が一致しません。`);
            }
        } catch (error) {
            console.error("エラー: 認証情報ファイルの解析に失敗しました。", error);
            process.exit(1);
        }
        
        console.log("\n3. Firestore初期化");
        
        try {
            if (getApps().length === 0) {
                initializeApp({
                    projectId: config.FIREBASE_PROJECT_ID,
                });
                console.log("Firebase初期化: 成功");
            } else {
                console.log("Firebase初期化: 既に初期化済み");
            }
            
            const db = getFirestore();
            db.settings({ 
                ignoreUndefinedProperties: true,
                databaseId: "chatgpt-slack-bot"
            });
            console.log("Firestore設定: 成功");
            console.log(`- データベースID: chatgpt-slack-bot`);
            
            console.log("\n4. Firestoreへの接続テスト");
            
            try {
                console.log("読み取りテスト実行中...");
                const testCollection = db.collection("_diagnostics");
                const testDoc = await testCollection.doc("test").get();
                console.log(`読み取りテスト: ${testDoc.exists ? '成功（ドキュメントが存在します）' : '成功（ドキュメントは存在しません）'}`);
                
                console.log("書き込みテスト実行中...");
                await testCollection.doc("test").set({
                    timestamp: new Date(),
                    message: "診断テスト"
                });
                console.log("書き込みテスト: 成功");
                
                console.log("テストデータ削除中...");
                await testCollection.doc("test").delete();
                console.log("テストデータ削除: 成功");
                
                console.log("\n診断結果: すべてのテストに成功しました！Firestoreへの接続と操作が正常に機能しています。");
            } catch (error) {
                console.error("Firestoreテストエラー:", error);
                
                if (error.code === 7) {
                    console.log("\n=== 権限エラーの解決方法 ===");
                    console.log("1. Firebase Consoleで「IAMと管理」→「IAM」を開く");
                    console.log(`2. サービスアカウント「${JSON.parse(fs.readFileSync(credentialsPath, 'utf8')).client_email}」を探す`);
                    console.log("3. 編集ボタンをクリックし、「別のロールを追加」をクリック");
                    console.log("4. 「Cloud Firestore」→「Cloud Firestore 管理者」を選択");
                    console.log("5. 「保存」をクリック");
                    console.log("\nまた、Firestoreのセキュリティルールも確認してください:");
                    console.log("1. Firebase Consoleで「Firestore Database」→「ルール」を開く");
                    console.log("2. 以下のルールを設定（開発時のみ）:");
                    console.log("```");
                    console.log("rules_version = '2';");
                    console.log("service cloud.firestore {");
                    console.log("  match /databases/{database}/documents {");
                    console.log("    match /{document=**} {");
                    console.log("      allow read, write: if true;");
                    console.log("    }");
                    console.log("  }");
                    console.log("}");
                    console.log("```");
                }
                
                if (error.code === 5) {
                    console.log("\n=== データベースが見つからないエラーの解決方法 ===");
                    console.log("1. Firebase Consoleで「Firestore Database」を開く");
                    console.log("2. 「データベースの作成」をクリック");
                    console.log("3. リージョンを選択して「次へ」をクリック");
                    console.log("4. セキュリティルールを選択して「有効にする」をクリック");
                }
            }
            
        } catch (error) {
            console.error("Firestore初期化エラー:", error);
        }
        
    } catch (error) {
        console.error("診断スクリプトエラー:", error);
        process.exit(1);
    }
}

main();
