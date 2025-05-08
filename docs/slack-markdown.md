# Slack Markdown (mrkdwn) 仕様書

Slackでは標準的なマークダウンとは異なる独自の「mrkdwn」形式を使用しています。このドキュメントでは、Slackで正しく表示されるマークダウン記法について説明します。

## 基本的な書式

| 書式 | Slack記法 | 例 | 表示 |
|------|----------|-----|------|
| 太字 | `*テキスト*` | `*太字*` | **太字** |
| 斜体 | `_テキスト_` | `_斜体_` | *斜体* |
| 取り消し線 | `~テキスト~` | `~取り消し線~` | ~~取り消し線~~ |
| インラインコード | `` `コード` `` | `` `コード` `` | `コード` |
| コードブロック | ` ```コード``` ` | ` ```コード``` ` | ```コード``` |
| 引用 | `>テキスト` | `>引用テキスト` | > 引用テキスト |

## 改行

テキスト内で改行を挿入するには、`\n`を使用します。

```
これは1行目です。\nこれは2行目です。
```

## リスト

Slackには特定のリスト構文はありませんが、通常のテキストと改行を使用して模倣できます：

```
- 項目1\n- 項目2\n- 項目3
```

## リンク

URLを直接含めると、自動的にリンクに変換されます：

```
http://example.com
```

または、表示テキストを変更したい場合は以下の構文を使用します：

```
<http://example.com|リンクテキスト>
```

## メンション

ユーザー、チャンネル、またはグループをメンションするには：

- ユーザーメンション: `<@U012AB3CD>`
- チャンネルメンション: `<#C123ABC456>`
- グループメンション: `<!subteam^SAZ94GDB8>`
- 特殊メンション: `<!here>`, `<!channel>`, `<!everyone>`

## 日付フォーマット

日付を表示するには、以下の構文を使用します：

```
<!date^1392734382^{date} at {time}|February 18th, 2014 at 6:39 AM PST>
```

## 注意事項

1. 標準的なマークダウン記法（**太字**、*斜体*、~~取り消し線~~など）はSlackでは正しく表示されません。
2. Slack特有の記法を使用する必要があります。
3. `&`, `<`, `>` などの特殊文字はHTMLエンティティにエスケープする必要があります。

## 実装例

このリポジトリでは、標準的なマークダウン記法をSlackのmrkdwn形式に変換する関数を実装しています：

```typescript
export function formatMarkdownForSlack(text: string): string {
  if (!text) return text;
  
  try {
    let formattedText = text;

    // 太字: **text** → *text*
    formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '*$1*');
    
    // 斜体: *text* → _text_
    formattedText = formattedText.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '_$1_');
    
    // 取り消し線: ~~text~~ → ~text~
    formattedText = formattedText.replace(/~~(.*?)~~/g, '~$1~');
    
    // 引用: > text → >text
    formattedText = formattedText.replace(/^>\s+/gm, '>');
    
    return formattedText;
  } catch (error) {
    return text; // エラーが発生した場合は元のテキストを返す
  }
}
```

## 参考資料

- [Slack API: Formatting text for app surfaces](https://api.slack.com/reference/surfaces/formatting)
