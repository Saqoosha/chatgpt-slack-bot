#!/usr/bin/env ts-node
import dotenv from "dotenv";
dotenv.config();

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from 'fs';

/**
 * 読み取り専用のFirestoreテストスクリプト
 * 権限エラーの原因を特定するための基本的なテストを実行します
 */
async function main() {
    try {
        console.log("=== 読み取り専用Firestoreテスト ===");
        
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
        
        console.log("Firebase初期化中...");
        const app = initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id
        });
        
        console.log("Firestore初期化中...");
        const db = getFirestore(app);
        
        db.settings({ 
            ignoreUndefinedProperties: true,
            databaseId: "chatgpt-slack-bot" // 明示的にデータベース名を指定
        });
        
        console.log(`Firestoreプロジェクト: ${serviceAccount.project_id}`);
        console.log(`Firestoreデータベース: chatgpt-slack-bot`);
        
        console.log("\n読み取りテスト実行中...");
        try {
            console.log("コレクション一覧を取得中...");
            const collections = await db.listCollections();
            console.log(`コレクション数: ${collections.length}`);
            
            for (const collection of collections) {
                console.log(`- コレクション: ${collection.id}`);
                
                const snapshot = await collection.get();
                console.log(`  ドキュメント数: ${snapshot.size}`);
                
                let count = 0;
                snapshot.forEach(doc => {
                    if (count < 5) {
                        console.log(`  - ドキュメントID: ${doc.id}`);
                        count++;
                    }
                });
            }
            
            if (collections.length === 0 || !collections.some(c => c.id === 'system_prompts')) {
                console.log("\nsystem_promptsコレクションが見つかりません。");
            } else {
                console.log("\nsystem_promptsコレクションが見つかりました。");
                
                const systemPromptsSnapshot = await db.collection('system_prompts').get();
                console.log(`system_promptsコレクションのドキュメント数: ${systemPromptsSnapshot.size}`);
                
                systemPromptsSnapshot.forEach(doc => {
                    console.log(`- ドキュメントID: ${doc.id}`);
                    console.log(`  データ: ${JSON.stringify(doc.data())}`);
                });
            }
            
        } catch (error) {
            console.error("Firestore読み取りエラー:", error);
            console.error("エラーの詳細:", JSON.stringify(error, null, 2));
        }
        
        console.log("\n=== テスト完了 ===");
        
    } catch (error) {
        console.error("テストエラー:", error);
        console.error("エラーの詳細:", JSON.stringify(error, null, 2));
        process.exit(1);
    }
}

main();
