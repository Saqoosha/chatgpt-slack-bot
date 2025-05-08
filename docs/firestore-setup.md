# Firestore セットアップガイド

このガイドでは、chatgpt-slack-botアプリケーション用のFirestoreデータベースをセットアップする手順を説明します。

## 1. Firebase プロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例：`chatgpt-slack-bot`）
4. Google アナリティクスの設定を選択（任意）
5. 「プロジェクトを作成」をクリック
6. プロジェクトの作成が完了するまで待機

## 2. Firestore データベースの作成

1. 左側メニューから「Firestore Database」を選択
2. 「データベースの作成」をクリック
3. セキュリティルールのモードを選択
   - 開発時は「テストモード」を選択（すべての読み書きを許可）
   - 本番環境では「本番環境モード」を選択
4. ロケーションを選択（例：`asia-northeast1`）
5. 「次へ」をクリック
6. 「有効にする」をクリック

## 3. サービスアカウントの作成

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 左上のプロジェクト選択ドロップダウンから、作成したFirebaseプロジェクトを選択
3. 左側メニューから「IAMと管理」→「サービスアカウント」を選択
4. 「サービスアカウントを作成」をクリック
5. サービスアカウント名を入力（例：`chatgpt-slack-bot-firestore`）
6. サービスアカウントIDを入力（自動生成されます）
7. 説明を入力（例：`Firestore access for chatgpt-slack-bot`）
8. 「作成して続行」をクリック

## 4. サービスアカウントに権限を付与

1. 「ロールを選択」をクリック
2. 「Firebase」カテゴリを選択
3. 「Firebase Firestore 管理者」ロールを選択
4. 「追加」をクリック
5. 「完了」をクリック

## 5. サービスアカウントキーの作成

1. 作成したサービスアカウントの行の右端にある「︙」（アクションメニュー）をクリック
2. 「鍵を管理」を選択
3. 「鍵を追加」→「新しい鍵を作成」をクリック
4. キーのタイプとして「JSON」を選択
5. 「作成」をクリック
6. JSONキーファイルが自動的にダウンロードされます
7. このファイルを安全な場所に保存してください（例：`credentials/your-project-id-firebase-adminsdk.json`）

## 6. Firestore セキュリティルールの設定

1. [Firebase Console](https://console.firebase.google.com/)に戻る
2. 左側メニューから「Firestore Database」→「ルール」タブを選択
3. 以下のルールを入力（開発時の例）:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      // 開発時は全ての読み書きを許可
      allow read, write: if true;
      
      // 本番環境では認証済みユーザーのみ許可
      // allow read, write: if request.auth != null;
    }
  }
}
```

4. 「公開」をクリック

## 7. アプリケーションの設定

1. `.env`ファイルに以下の環境変数を追加:

```
FIREBASE_PROJECT_ID=your-project-id
```

2. サービスアカウントキーのパスを環境変数に設定:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials/your-project-id-firebase-adminsdk.json
```

## 8. データの移行

1. 既存データをFirestoreに移行:

```bash
pnpm migrate
```

2. 移行の検証:

```bash
pnpm verify
```

## トラブルシューティング

### 権限エラー

エラーメッセージ: `Error: 7 PERMISSION_DENIED: Missing or insufficient permissions.`

解決策:
1. サービスアカウントに適切な権限が付与されているか確認
2. Firestoreのセキュリティルールが書き込みを許可しているか確認
3. 環境変数`GOOGLE_APPLICATION_CREDENTIALS`が正しいパスを指しているか確認

### データベースが見つからないエラー

エラーメッセージ: `Error: 5 NOT_FOUND: `

解決策:
1. Firestoreデータベースが作成されているか確認
2. 正しいプロジェクトIDを使用しているか確認
3. データベースのリージョンが正しいか確認
