# システムプロンプト管理をFirestoreに移行

## 変更内容
- システムプロンプトの保存と取得をGASスプレッドシートからFirestoreに切り替え
- 既存のデータをFirestoreに移行するための単体スクリプト（`pnpm migrate`）を実装
- 移行後の動作確認用スクリプト（`pnpm verify`）を追加
- テストデータ作成用スクリプト（`pnpm test-firestore`）を追加
- Firestore接続診断ツール（`pnpm diagnose-firestore`）を追加
- シンプルなFirestoreテストスクリプト（`pnpm simple-test`）を追加
- 読み取り専用Firestoreテストスクリプト（`pnpm read-test`）を追加
- Firestoreリージョン確認ツール（`pnpm check-region`）を追加
- 詳細なFirestoreセットアップガイド（`docs/firestore-setup-detailed.md`）を追加
- Firestoreセキュリティルール設定ガイド（`docs/firestore-security-rules.md`）を追加
- Firestore権限トラブルシューティングガイド（`docs/firestore-permissions-troubleshooting.md`）を追加
- 現在のキャッシュメカニズムは維持

## 移行結果
SSKVSからFirestoreへの移行が完了しました：
- 20件のシステムプロンプトを正常に移行
- 全てのチャンネル設定が保持されています
- 移行エラーは0件

## Firestoreセットアップ手順

詳細な手順は [docs/firestore-setup-detailed.md](docs/firestore-setup-detailed.md) を参照してください。

主な手順:
1. Firebase プロジェクトを作成
2. Firestore データベースを作成（既に「chatgpt-slack-bot」という名前で作成済み）
3. サービスアカウントを作成し、適切な権限を付与（「Cloud Firestore 編集者」権限を使用）
4. サービスアカウントキーを生成してダウンロード
5. セキュリティルールを設定（[docs/firestore-security-rules.md](docs/firestore-security-rules.md) を参照）
6. 環境変数の設定
   - `.env`ファイルに`FIREBASE_PROJECT_ID`を追加
   - `GOOGLE_APPLICATION_CREDENTIALS`環境変数にダウンロードしたJSONキーファイルのパスを設定

## サービスアカウントキーの保存場所
セキュリティのため、以下のいずれかの方法でサービスアカウントキーを保存することをお勧めします:

1. リポジトリ内の`credentials`ディレクトリ（`.gitignore`に追加済み）
2. ホームディレクトリの隠しフォルダ（例：`~/.config/firebase/`）
3. `/etc/secrets/`などのシステムフォルダ（適切な権限設定が必要）
4. 本番環境では環境変数やシークレット管理サービスを使用

## 使用方法
1. Firestoreの接続診断
   ```
   pnpm diagnose-firestore
   ```

2. Firestoreのリージョン設定確認
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json pnpm check-region
   ```

3. シンプルなFirestoreテスト（基本的な接続テスト）
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json pnpm simple-test
   ```

4. 読み取り専用Firestoreテスト（コレクション一覧の取得）
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json pnpm read-test
   ```

5. テストデータの作成（Firestoreへの書き込みテスト）
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json pnpm test-firestore
   ```

6. 既存データの移行
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json pnpm migrate
   ```

7. 移行後の動作確認
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json pnpm verify
   ```

8. curlを使用した直接移行（SSKVSリダイレクト対応版）
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json pnpm ts-node src/directMigrate.ts
   ```

Link to Devin run: https://app.devin.ai/sessions/5bd9b23b1b15400484639ddff2d4626d
Requested by: Saqoosha (saqoosha@whatever.co)
