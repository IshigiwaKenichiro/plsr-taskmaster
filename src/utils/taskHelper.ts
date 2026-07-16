import fs from 'fs-extra';
import path from 'path';

/** stashディレクトリ名（create/stash/pop/listで共有） */
export const STASH_DIR_NAME = 'stash';

/** doneディレクトリのプレフィックス（done/listで共有） */
export const DONE_DIR_PREFIX = 'done.';

/** doneディレクトリの日付フォーマット（planテンプレートの{{date}}でも再利用） */
export const DONE_DATE_FORMAT = 'yyyy-MM-dd';

/** タスク設定 */
export interface TaskConfig {
    taskDir: string;
    /** planテンプレートファイルのパス（cwd相対または絶対）。未指定なら内蔵デフォルトを使用 */
    templatePath?: string;
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
    // readJsonSyncの戻り値は型情報がないため、unknownとしてガードしてから取り出す
    const plsrTask: Record<string, unknown> = pkg['plsr-task'] ?? {};

    const taskDirRaw = plsrTask['task-dir'];
    const templateRaw = plsrTask['template'];

    return {
        taskDir: typeof taskDirRaw === 'string' ? taskDirRaw : 'tasks',
        templatePath: typeof templateRaw === 'string' ? templateRaw : undefined
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

/** 次に必要なアクション: run=plan実行待ち, review=レビュー所見待ち */
export type NextAction = 'run' | 'review';

/** タスクのサイクル状態 */
export interface TaskStatus {
    taskName: string;
    /** 現在の最大サイクル番号 */
    cycle: number;
    nextAction: NextAction;
    planCount: number;
    reviewCount: number;
}

/** planサイクル番号の初期値（planは必ず1から始まるため） */
const INITIAL_PLAN_CYCLE = 1;
/** reviewサイクル番号の初期値（reviewが1つもない状態を表すため） */
const INITIAL_REVIEW_CYCLE = 0;

/**
 * タスクファイル群からサイクル状態を算出
 *
 * cycle.tsの「次に作るファイル」判定（plan数==review数→plan作成）とは式が逆に見えるが、
 * こちらは「人/AIが今やるべきこと」を表すため:
 * - maxPlan > maxReview → 最新planに対応するreviewがまだない → planの実行待ち(run)
 * - maxPlan == maxReview → reviewファイルは作成済みで所見の記入が次 → レビュー待ち(review)
 *
 * ファイル内容のパース（所見未記入かどうか）は行わない。
 * プレースホルダ文字列への依存は脆いため、ファイル構造のみで判定する方針。
 */
export function getTaskStatus(taskName: string, files: TaskFileInfo[]): TaskStatus | null {
    const taskFiles = files.filter(f => f.taskName === taskName);
    if (taskFiles.length === 0) {
        return null;
    }

    const plans = taskFiles.filter(f => f.type === 'plan');
    const reviews = taskFiles.filter(f => f.type === 'review');

    const maxPlan = Math.max(...plans.map(f => f.cycle), INITIAL_PLAN_CYCLE);
    const maxReview = Math.max(...reviews.map(f => f.cycle), INITIAL_REVIEW_CYCLE);

    return {
        taskName,
        cycle: Math.max(maxPlan, maxReview),
        nextAction: maxPlan === maxReview ? 'review' : 'run',
        planCount: plans.length,
        reviewCount: reviews.length
    };
}

/**
 * stashディレクトリ内のタスク名一覧を取得
 */
export function getStashedTaskNames(stashDir: string): string[] {
    if (!fs.existsSync(stashDir)) {
        return [];
    }

    return fs.readdirSync(stashDir)
        .filter(f => fs.statSync(path.join(stashDir, f)).isDirectory());
}

/** doneアーカイブ1日付分の情報 */
export interface DoneArchiveInfo {
    /** done.2026-07-15 形式のディレクトリ名 */
    dirName: string;
    /** 2026-07-15 形式の日付部分 */
    date: string;
    taskNames: string[];
}

/** doneアーカイブのディレクトリ名パターン（done.yyyy-MM-dd 以外の紛らわしい名前を除外するため） */
const DONE_DIR_PATTERN = /^done\.\d{4}-\d{2}-\d{2}$/;

/**
 * doneアーカイブ一覧を取得（日付降順）
 * yyyy-MM-dd形式は辞書順ソートで日付順と一致するため文字列比較で並べる
 */
export function getDoneArchives(taskDir: string): DoneArchiveInfo[] {
    if (!fs.existsSync(taskDir)) {
        return [];
    }

    return fs.readdirSync(taskDir)
        .filter(f => DONE_DIR_PATTERN.test(f))
        .filter(f => fs.statSync(path.join(taskDir, f)).isDirectory())
        .sort((a, b) => b.localeCompare(a))
        .map(dirName => ({
            dirName,
            date: dirName.slice(DONE_DIR_PREFIX.length),
            taskNames: fs.readdirSync(path.join(taskDir, dirName))
                .filter(f => fs.statSync(path.join(taskDir, dirName, f)).isDirectory())
        }));
}
