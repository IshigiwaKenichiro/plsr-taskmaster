import fs from 'fs-extra';
import path from 'path';

/** タスク設定 */
export interface TaskConfig {
    taskDir: string;
}

/** タスクファイル情報 */
export interface TaskFileInfo {
    fileName: string;
    filePath: string;
    taskName: string;
    cycle: number;
    type: 'plan' | 'review';
}

/**
 * package.jsonからplsr-task設定を読み込む
 * 実行ディレクトリのpackage.jsonを参照
 */
export function loadConfig(): TaskConfig {
    const pkgPath = path.resolve(process.cwd(), 'package.json');

    if (!fs.existsSync(pkgPath)) {
        return { taskDir: 'tasks' };
    }

    const pkg = fs.readJsonSync(pkgPath);
    const plsrTask = pkg['plsr-task'] ?? {};

    return {
        taskDir: plsrTask['task-dir'] ?? 'tasks'
    };
}

/**
 * タスクディレクトリのパスを取得
 */
export function getTaskDir(config: TaskConfig): string {
    return path.resolve(process.cwd(), config.taskDir);
}

/**
 * ファイル名からサイクル番号を抽出
 * plan.taskName.1.md => 1
 */
export function extractCycleNumber(fileName: string): number | null {
    const parts = fileName.split('.');
    if (parts.length >= 3) {
        const cyclePart = parts[parts.length - 2];
        const cycleNumber = parseInt(cyclePart, 10);
        return isNaN(cycleNumber) ? null : cycleNumber;
    }
    return null;
}

/**
 * ファイル名からタスク名を抽出
 * plan.taskName.1.md => taskName
 */
export function extractTaskName(fileName: string): string {
    const parts = fileName.split('.');
    // plan.taskName.1.md => ['plan', 'taskName', '1', 'md']
    // 先頭（plan/review）と末尾2つ（サイクル番号、拡張子）を除く
    if (parts.length >= 4) {
        return parts.slice(1, -2).join('.');
    }
    return '';
}

/**
 * タスクディレクトリ内のタスクファイル一覧を取得
 */
export function getTaskFiles(taskDir: string): TaskFileInfo[] {
    if (!fs.existsSync(taskDir)) {
        return [];
    }

    const files = fs.readdirSync(taskDir)
        .filter(f => f.endsWith('.md'))
        .filter(f => f.startsWith('plan.') || f.startsWith('review.'));

    return files.map(fileName => {
        const type = fileName.startsWith('plan.') ? 'plan' : 'review';
        return {
            fileName,
            filePath: path.join(taskDir, fileName),
            taskName: extractTaskName(fileName),
            cycle: extractCycleNumber(fileName) ?? 0,
            type
        };
    });
}

/**
 * 最新更新されたファイルを取得
 */
export function getLatestFile(taskDir: string, files: string[]): string | null {
    if (files.length === 0) return null;

    const latest = files
        .map(f => ({
            name: f,
            time: fs.statSync(path.join(taskDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time)[0];

    return latest ? path.join(taskDir, latest.name) : null;
}

/**
 * 現在進行中のタスク名一覧を取得（重複なし）
 */
export function getCurrentTaskNames(taskDir: string): string[] {
    const files = getTaskFiles(taskDir);
    const names = new Set(files.map(f => f.taskName));
    return Array.from(names);
}

/**
 * 特定タスクのファイル一覧を取得
 */
export function getTaskFilesByName(taskDir: string, taskName: string): TaskFileInfo[] {
    return getTaskFiles(taskDir).filter(f => f.taskName === taskName);
}
