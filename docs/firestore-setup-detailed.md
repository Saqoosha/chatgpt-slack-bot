# Firestore セットアップ詳細ガイド

このガイドでは、ChatGPT Slack Bot のシステムプロンプト管理を Firestore に移行するための詳細な手順を説明します。

## 1. Firebase プロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例：「chatgpt-slack-bot」）
4. Google アナリティクスの設定を選択（任意）
5. 「プロジェクトを作成」をクリック
6. プロジェクトの作成が完了するまで待機

## 2. Firestore データベースの作成

1. 左側メニューから「Firestore Database」を選択
2. 「データベースの作成」をクリック
3. セキュリティルールのモードを選択
   - 開発時は「テストモード」を選択（すべての読み書きを許可）
   - 本番環境では「本番環境モード」を選択
4. リージョンを選択（例：「asia-northeast1」（東京））
5. 「次へ」をクリック
6. 「有効にする」をクリック

## 3. サービスアカウントの作成と権限設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 上部のプロジェクト選択ドロップダウンから、作成したFirebaseプロジェクトを選択
3. 左側メニューから「IAM と管理」→「サービスアカウント」を選択
4. 「サービスアカウントを作成」をクリック
5. サービスアカウント詳細を入力
   - サービスアカウント名：「chatgpt-slack-bot」
   - サービスアカウントID：自動生成されるIDをそのまま使用するか、カスタムIDを入力
   - 説明：「ChatGPT Slack Bot用のサービスアカウント」
6. 「作成して続行」をクリック
7. 「ロールを選択」をクリック
8. 「Cloud Firestore」→「Cloud Firestore 管理者」を選択
9. 「追加」をクリックして別のロールを追加
10. 「Firebase」→「Firebase 管理者」を選択
11. 「完了」をクリック

## 4. サービスアカウントキーの生成

1. 作成したサービスアカウントの行の右端にある「︙」（アクションメニュー）をクリック
2. 「鍵を管理」を選択
3. 「鍵を追加」→「新しい鍵を作成」をクリック
4. キーのタイプとして「JSON」を選択
5. 「作成」をクリック
6. JSONキーファイルが自動的にダウンロードされます

## 5. サービスアカウントキーの保存

セキュリティのため、以下のいずれかの方法でサービスアカウントキーを保存することをお勧めします：

1. リポジトリ内の`credentials`ディレクトリ（`.gitignore`に追加済み）
   ```bash
   mkdir -p /path/to/repo/credentials
   mv ~/Downloads/your-project-id-12345.json /path/to/repo/credentials/
   ```

2. ホームディレクトリの隠しフォルダ
   ```bash
   mkdir -p ~/.config/firebase
   mv ~/Downloads/your-project-id-12345.json ~/.config/firebase/
   ```

3. システムフォルダ（適切な権限設定が必要）
   ```bash
   sudo mkdir -p /etc/secrets/firebase
   sudo mv ~/Downloads/your-project-id-12345.json /etc/secrets/firebase/
   sudo chmod 600 /etc/secrets/firebase/your-project-id-12345.json
   ```

## 6. 環境変数の設定

1. `.env`ファイルに`FIREBASE_PROJECT_ID`を追加
   ```
   FIREBASE_PROJECT_ID=your-project-id
   ```

2. `GOOGLE_APPLICATION_CREDENTIALS`環境変数を設定
   - シェルの起動スクリプト（`.bashrc`、`.zshrc`など）に追加
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-project-id-12345.json
     ```
   - または、アプリ起動時に設定
     ```bash
     GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-project-id-12345.json pnpm dev
     ```

## 7. Firestoreセキュリティルールの設定

1. Firebase Consoleで「Firestore Database」→「ルール」タブを選択
2. 以下のルールを設定（開発時のみ）
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
3. 本番環境では、より制限的なルールを設定することをお勧めします

## 8. 移行スクリプトの実行

1. 環境変数が正しく設定されていることを確認
   ```bash
   echo $GOOGLE_APPLICATION_CREDENTIALS
   ```

2. 既存データの移行
   ```bash
   pnpm migrate
   ```

3. 移行後の動作確認
   ```bash
   pnpm verify
   ```

## トラブルシューティング

### 権限エラー（PERMISSION_DENIED）

```
Error: 7 PERMISSION_DENIED: Missing or insufficient permissions.
```

このエラーが発生した場合：

1. サービスアカウントに適切な権限が付与されているか確認
   - IAMコンソールで「Cloud Firestore 管理者」と「Firebase 管理者」の役割が付与されているか確認

2. 環境変数が正しく設定されているか確認
   ```bash
   echo $GOOGLE_APPLICATION_CREDENTIALS
   ```

3. JSONキーファイルが正しいか確認
   ```bash
   cat $GOOGLE_APPLICATION_CREDENTIALS | grep project_id
   ```

### データベースが見つからないエラー（NOT_FOUND）

```
Error: 5 NOT_FOUND: 
```

このエラーが発生した場合：

1. Firestoreデータベースが作成されているか確認
   - Firebase Consoleで「Firestore Database」を開き、データベースが存在するか確認
   - 存在しない場合は「データベースの作成」をクリック

2. 正しいプロジェクトIDを使用しているか確認
   ```bash
   cat $GOOGLE_APPLICATION_CREDENTIALS | grep project_id
   ```

3. 診断ツールを実行して詳細情報を取得
   ```bash
   pnpm diagnose-firestore
   ```

### その他のエラー

詳細な診断情報を取得するには：

```bash
pnpm diagnose-firestore
```

このコマンドは、Firestore接続に関する詳細な情報と、問題が発生した場合の具体的な解決方法を表示します。
