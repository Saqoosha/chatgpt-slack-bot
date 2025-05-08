# Firestore 権限トラブルシューティングガイド

## 現在の問題
テスト実行時に以下のエラーが発生しています：
```
Error: 7 PERMISSION_DENIED: Missing or insufficient permissions.
```

これは、サービスアカウントに適切な権限が付与されていないか、Firestoreのセキュリティルールが正しく設定されていないことを示しています。

## 解決手順

### 1. サービスアカウントの権限を確認

1. [Google Cloud Console](https://console.cloud.google.com/iam-admin/iam) にアクセス
2. プロジェクト「whatever-co」を選択
3. サービスアカウント「chatgpt-slack-bot@whatever-co.iam.gserviceaccount.com」を探す
4. このアカウントに以下のいずれかの役割が付与されているか確認：
   - 「Cloud Firestore 編集者」
   - 「Firebase 管理者」
   - 「Cloud Datastore オーナー」

役割が付与されていない場合：
1. サービスアカウントの行の右端にある「編集」（鉛筆アイコン）をクリック
2. 「別のロールを追加」をクリック
3. 「Cloud Firestore 編集者」を検索して選択
4. 「保存」をクリック

### 2. Firestoreのセキュリティルールを確認

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. プロジェクト「whatever-co」を選択
3. 左側メニューから「Firestore Database」を選択
4. 「ルール」タブをクリック
5. 以下のルールが設定されているか確認：

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

6. 変更がある場合は「公開」ボタンをクリック

### 3. Firestoreデータベースの設定を確認

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. プロジェクト「whatever-co」を選択
3. 左側メニューから「Firestore Database」を選択
4. 「データ」タブをクリック
5. データベースが「chatgpt-slack-bot」という名前で作成されているか確認
6. データベースのロケーションが「nam5 (us-central)」になっているか確認

### 4. サービスアカウントキーを再生成

現在のサービスアカウントキーに問題がある場合は、新しいキーを生成してみてください：

1. [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts) にアクセス
2. プロジェクト「whatever-co」を選択
3. サービスアカウント「chatgpt-slack-bot@whatever-co.iam.gserviceaccount.com」をクリック
4. 「鍵」タブをクリック
5. 「鍵を追加」→「新しい鍵を作成」→「JSON」を選択
6. ダウンロードしたJSONファイルを`credentials`ディレクトリに保存
7. 環境変数`GOOGLE_APPLICATION_CREDENTIALS`を新しいキーファイルのパスに設定

### 5. 再テスト

権限設定を更新した後、以下のコマンドで再テストしてください：

```bash
pnpm read-test
```

## 追加のトラブルシューティング

上記の手順を実行しても問題が解決しない場合：

1. Firebase Consoleで新しいプロジェクトを作成
2. 新しいプロジェクトでFirestoreデータベースを作成
3. 新しいサービスアカウントを作成し、適切な権限を付与
4. 新しいサービスアカウントキーを生成
5. 環境変数とコードを新しいプロジェクト用に更新

## 参考リンク

- [Firestore セキュリティルール](https://firebase.google.com/docs/firestore/security/get-started)
- [Google Cloud IAM ロール](https://cloud.google.com/iam/docs/understanding-roles)
- [Firebase Admin SDK の設定](https://firebase.google.com/docs/admin/setup)
