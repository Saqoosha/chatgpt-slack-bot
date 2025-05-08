# Firestore 権限設定ガイド

Firestoreを使用するには、サービスアカウントに適切な権限を付与する必要があります。このガイドでは、日本語環境で利用可能な権限オプションを説明します。

## 推奨される権限オプション

以下のいずれかの権限を選択してください：

### オプション1: Cloud Firestore 編集者
- Firestoreデータの読み書き権限
- 基本的なFirestore操作に十分な権限
- 推奨オプション

### オプション2: Firebase 管理者
- より広範な権限を提供
- Firebase プロジェクト全体へのフルアクセス
- Firestore、Authentication、Storage などすべてのサービスを管理可能

### オプション3: Secret Manager 管理者
- シークレットの管理権限（サービスアカウントキーなど）
- Firestoreへのアクセスには追加の権限が必要

## 権限設定手順

1. [Google Cloud Console](https://console.cloud.google.com/iam-admin/iam) にアクセス
2. プロジェクトを選択
3. サービスアカウントを見つける
4. 編集ボタン（鉛筆アイコン）をクリック
5. 「別のロールを追加」をクリック
6. 検索ボックスに「Firestore」または「Firebase」と入力
7. 「Cloud Firestore 編集者」を選択
8. 「保存」をクリック

## トラブルシューティング

権限エラーが発生した場合：

1. サービスアカウントに付与された権限を確認
2. 必要に応じて追加の権限を付与
3. Firestore のセキュリティルールを確認（開発時は一時的に全許可に設定）
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
4. 診断ツールを実行して詳細情報を取得
   ```bash
   pnpm diagnose-firestore
   ```
