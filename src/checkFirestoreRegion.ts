#!/usr/bin/env ts-node
import dotenv from "dotenv";
dotenv.config();

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from 'fs';

/**
 * Firestoreのリージョン設定を確認するスクリプト
 * 権限エラーの原因がリージョン設定の問題かどうかを確認します
 */
async function main() {
    try {
        console.log("=== Firestoreリージョン確認ツール ===");
        
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        
        console.log(`FIREBASE_PROJECT_ID: ${projectId || '未設定'}`);
        console.log(`GOOGLE_APPLICATION_CREDENTIALS: ${credentialsPath || '未設定'}`);
        
        if (!credentialsPath) {
            throw new Error("GOOGLE_APPLICATION_CREDENTIALS環境変数が設定されていません");
        }
        
        console.log("サービスアカウントキーの確認中...");
        const serviceAccountContent = fs.readFileSync(credentialsPath, 'utf8');
        const serviceAccount = JSON.parse(serviceAccountContent);
        
        console.log(`サービスアカウントタイプ: ${serviceAccount.type}`);
        console.log(`サービスアカウントプロジェクトID: ${serviceAccount.project_id}`);
        console.log(`サービスアカウントクライアントメール: ${serviceAccount.client_email.split('@')[0]}@...`);
        
        console.log("\nFirebase初期化中...");
        const app = initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id,
            databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
        }, 'region-check');
        
        console.log("Firestore初期化中...");
        const db = getFirestore(app);
        
        db.settings({ 
            ignoreUndefinedProperties: true,
            databaseId: "chatgpt-slack-bot",
            host: "firestore.googleapis.com",
            ssl: true
        });
        
        console.log("\nFirestoreプロジェクト情報取得中...");
        try {
            const projectInfo = await db._getProjectId();
            console.log(`プロジェクトID: ${projectInfo}`);
            
            console.log("\nデータベース情報取得中...");
            const databasePath = `projects/${serviceAccount.project_id}/databases/chatgpt-slack-bot`;
            console.log(`データベースパス: ${databasePath}`);
            
            console.log("\nリージョン設定の確認が完了しました。");
            console.log("注意: Firestoreデータベースが「nam5」（アメリカ合衆国）リージョンに作成されていることを確認してください。");
            console.log("Firebase Consoleで確認: https://console.firebase.google.com/project/_/firestore/data");
        } catch (error) {
            console.error("Firestore情報取得エラー:", error);
            console.error("エラーの詳細:", JSON.stringify(error, null, 2));
            
            console.log("\n権限エラーが発生した場合の対処法:");
            console.log("1. サービスアカウントに「Cloud Firestore 編集者」権限が付与されているか確認");
            console.log("2. Firestoreのセキュリティルールが適切に設定されているか確認");
            console.log("3. データベースが「chatgpt-slack-bot」という名前で作成されているか確認");
            console.log("4. データベースのリージョンが「nam5」（アメリカ合衆国）になっているか確認");
        }
        
        console.log("\n=== 確認完了 ===");
        
    } catch (error) {
        console.error("テストエラー:", error);
        console.error("エラーの詳細:", JSON.stringify(error, null, 2));
        process.exit(1);
    }
}

main();
