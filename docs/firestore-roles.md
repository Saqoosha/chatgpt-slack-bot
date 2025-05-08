# Firestore 権限設定ガイド

Firestoreを使用するには、サービスアカウントに適切な権限を付与する必要があります。このガイドでは、利用可能な権限オプションを説明します。

## 推奨される権限オプション

以下のいずれかの権限を選択してください：

### オプション1: Firebase 管理者（Firebase Admin）
- 最も広範な権限を提供
- Firebase プロジェクト全体へのフルアクセス
- Firestore、Authentication、Storage などすべてのサービスを管理可能

### オプション2: Firebase データベース管理者（Firebase Database Admin）
- Firestore と Realtime Database の管理権限
- データの読み書き、インデックスの管理、バックアップの作成など

### オプション3: カスタムロール
以下の権限を含むカスタムロールを作成：
- `datastore.databases.get`
- `datastore.databases.list`
- `datastore.entities.create`
- `datastore.entities.delete`
- `datastore.entities.get`
- `datastore.entities.list`
- `datastore.entities.update`
- `datastore.indexes.list`
- `datastore.operations.get`

## 権限設定手順

1. [Google Cloud Console](https://console.cloud.google.com/iam-admin/iam) にアクセス
2. プロジェクトを選択
3. サービスアカウントを見つける
4. 編集ボタン（鉛筆アイコン）をクリック
5. 「別のロールを追加」をクリック
6. 検索ボックスに「Firebase」と入力
7. 上記のいずれかの役割を選択
8. 「保存」をクリック

## カスタムロールの作成手順

1. [Google Cloud Console](https://console.cloud.google.com/iam-admin/roles) にアクセス
2. 「カスタムロールを作成」をクリック
3. タイトルと説明を入力（例：「Firestore 管理者」）
4. 「権限を追加」をクリック
5. 上記の権限を追加
6. 「作成」をクリック
7. IAM ページに戻り、サービスアカウントに新しいカスタムロールを付与

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
