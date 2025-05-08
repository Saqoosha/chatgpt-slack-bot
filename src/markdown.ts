import { logger } from "./logger";

/**
 * 標準マークダウン記法をSlackのmrkdwn形式に変換する
 * 
 * 対応するフォーマット:
 * - **太字** → *太字*
 * - *斜体* → _斜体_
 * - ~~取り消し線~~ → ~取り消し線~
 * - `インラインコード` → `インラインコード`
 * - ```コードブロック``` → ```コードブロック```
 * - > 引用 → >引用
 * 
 * @param text 変換するテキスト
 * @returns Slackのmrkdwn形式に変換されたテキスト
 */
export function formatMarkdownForSlack(text: string): string {
  if (!text) return text;
  
  try {
    let formattedText = text;
    
    formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '*$1*');
    
    formattedText = formattedText.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '_$1_');
    
    formattedText = formattedText.replace(/~~(.*?)~~/g, '~$1~');
    
    formattedText = formattedText.replace(/^>\s+/gm, '>');
    
    logger.info({ 
      event: "markdown_format", 
      original: text, 
      formatted: formattedText,
      originalContainsBold: text.includes("**"),
      originalContainsItalic: text.includes("*"),
      formattedContainsBold: formattedText.includes("*"),
      formattedContainsItalic: formattedText.includes("_")
    }, "Markdown formatted for Slack");
    
    return formattedText;
  } catch (error) {
    logger.error(
      { event: "markdown_format_error", error },
      "Error formatting markdown for Slack"
    );
    return text; // エラーが発生した場合は元のテキストを返す
  }
}
