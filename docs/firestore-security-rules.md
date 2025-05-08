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

本番環境では、より制限的なルールを設定することをお勧めします。例えば：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /system_prompts/{document=**} {
      // 認証済みユーザーのみ読み書き可能
      allow read, write: if request.auth != null;
    }
    
    // その他のコレクションに対するルール
    match /{collection}/{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
  }
}
```

## 注意事項

- 開発用の全許可ルールは、開発環境でのみ使用してください
- 本番環境では、必要最小限の権限を付与するルールを設定してください
- セキュリティルールの変更は即時反映されます
