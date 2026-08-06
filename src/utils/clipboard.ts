import clipboard from 'clipboardy';

/** クリップボードコピーの結果 */
export interface ClipboardResult {
    success: boolean;
    /** 失敗理由（呼び出し側でchalk表示する。helper層はconsole出力を持たない設計のため） */
    warning?: string;
}

/**
 * テキストをクリップボードへコピーする
 *
 * SSH越し・CI・xclip未導入のLinuxなど、クリップボードが使えない環境は珍しくない。
 * コピーはあくまで補助機能でファイル作成自体は成功しているため、
 * 例外を投げずに結果を返し、呼び出し側の処理を止めない。
 */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
    try {
        await clipboard.write(text);
        return { success: true };
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return { success: false, warning: `Failed to copy to clipboard: ${reason}` };
    }
}
