# Firestore セキュリティルールの設定

Firestoreのセキュリティルールは、データベースへのアクセス権限を制御します。開発中は一時的に全許可ルールを設定し、本番環境では適切に制限することをお勧めします。

## 開発用セキュリティルール

開発中は、以下のルールを使用して全てのアクセスを許可できます：

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

## セキュリティルールの設定手順

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. プロジェクト「whatever-co」を選択
3. 左側メニューから「Firestore Database」を選択
4. 「ルール」タブをクリック
5. 上記の開発用ルールをエディタに貼り付け
6. 「公開」ボタンをクリック

## 本番環境用セキュリティルール

本番環境では、より制限的なルールを設定することをお勧めします：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // system_promptsコレクションのみアクセスを許可
    match /system_prompts/{document=**} {
      // サービスアカウントからのアクセスのみ許可
      allow read, write: if request.auth != null && 
                          request.auth.token.email == "slack-rag-bot-sa@whatever-co.iam.gserviceaccount.com";
    }
    // 他のコレクションはすべて拒否
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

このルールでは：
1. サービスアカウントのメールアドレスを実際のものに置き換えてください
2. system_promptsコレクションのみアクセスを許可
3. 認証されたサービスアカウントからのアクセスのみ許可

## 注意事項

- 開発用の全許可ルールは、開発環境でのみ使用してください
- 本番環境では、必要最小限の権限を付与するルールを設定してください
- セキュリティルールの変更は即時反映されます
