import fs from 'fs-extra';
import path from 'path';
import { TaskConfig } from './taskHelper.js';

/** プレースホルダの記法: {{name}} */
const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/** 内蔵デフォルトテンプレート（テンプレート未設定・読込失敗時のフォールバック） */
export const DEFAULT_PLAN_TEMPLATE = `# {{taskName}}

## 目的
ここにタスクの目的を記述してください。

## 指示内容
ここに具体的な指示を記述してください。

## 実行結果
ここに実行結果を書いて
`;

/** テンプレート読込結果 */
export interface TemplateLoadResult {
    content: string;
    source: 'file' | 'default';
    /** フォールバック発生時の理由（呼び出し側でchalk表示する。helper層はconsole出力を持たない設計のため） */
    warning?: string;
    /** source='file' のとき、読み込んだテンプレートの解決済みパス */
    resolvedPath?: string;
}

/**
 * 設定からplanテンプレートを読み込む
 * テンプレートが読めなくてもcreate自体は止めず、内蔵デフォルトへフォールバックする
 */
export function loadPlanTemplate(config: TaskConfig): TemplateLoadResult {
    if (!config.templatePath) {
        return { content: DEFAULT_PLAN_TEMPLATE, source: 'default' };
    }

    // loadConfigがcwdのpackage.jsonを読む設計に合わせ、テンプレートのパスもcwd基準で解決する
    const resolvedPath = path.resolve(process.cwd(), config.templatePath);

    if (!fs.existsSync(resolvedPath)) {
        return {
            content: DEFAULT_PLAN_TEMPLATE,
            source: 'default',
            warning: `Template file not found: ${resolvedPath}. Using built-in template.`
        };
    }

    if (!fs.statSync(resolvedPath).isFile()) {
        return {
            content: DEFAULT_PLAN_TEMPLATE,
            source: 'default',
            warning: `Template path is not a file: ${resolvedPath}. Using built-in template.`
        };
    }

    try {
        const content = fs.readFileSync(resolvedPath, 'utf-8');

        // 空のplanファイルは運用事故のもとになるため、空白のみのテンプレートは無効扱いにする
        if (content.trim() === '') {
            return {
                content: DEFAULT_PLAN_TEMPLATE,
                source: 'default',
                warning: `Template file is empty: ${resolvedPath}. Using built-in template.`
            };
        }

        return { content, source: 'file', resolvedPath };
    } catch (error) {
        return {
            content: DEFAULT_PLAN_TEMPLATE,
            source: 'default',
            warning: `Failed to read template: ${resolvedPath}. Using built-in template.`
        };
    }
}

/**
 * プレースホルダを置換する
 * 未知のプレースホルダはそのまま残す（ユーザーがMd内で使う {{...}} 記法を壊さないため）
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(PLACEHOLDER_PATTERN, (match, key: string) =>
        key in vars ? vars[key] : match
    );
}
