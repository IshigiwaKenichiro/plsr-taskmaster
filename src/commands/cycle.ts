import { program } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import {
    loadConfig,
    getTaskDir,
    getLatestFile,
    extractTaskName,
    extractCycleNumber
} from '../utils/taskHelper.js';

/**
 * cycleコマンドを登録
 * - 最新更新されたタスクファイルを特定
 * - plan/reviewサイクルを進める
 */
export function cycleCommand() {
    program
        .command('cycle')
        .description('タスクのplan/reviewサイクルを作成する')
        .action(async () => {
            await cycle();
        });
}

async function cycle() {
    const config = loadConfig();
    const taskDir = getTaskDir(config);

    if (!fs.existsSync(taskDir)) {
        console.log(chalk.red(`Task directory not found: ${taskDir}`));
        return;
    }

    // タスクファイルの命名規則: plan/reviewで始まり、[1以上の数字].mdで終了
    const taskFilePattern = /^(plan|review)\..+\.[1-9]\d*\.md$/;
    const mdFiles = fs.readdirSync(taskDir).filter(f => f.endsWith('.md'));
    const taskFiles = mdFiles.filter(f => taskFilePattern.test(f));

    // 除外されたファイルを警告
    const skippedFiles = mdFiles.filter(f =>
        (f.startsWith('plan.') || f.startsWith('review.')) && !taskFilePattern.test(f)
    );
    if (skippedFiles.length > 0) {
        console.log(chalk.yellow(`Warning: Skipped invalid files: ${skippedFiles.join(', ')}`));
    }

    // taskFilesが空の場合は即座にエラー終了（getLatestFileを呼ぶ前にガード）
    if (taskFiles.length === 0) {
        if (skippedFiles.length > 0) {
            console.log(chalk.red(`Error: No valid task files found. All plan/review files were skipped due to invalid naming.`));
        } else {
            console.log(chalk.red(`No task files found in ${taskDir}`));
        }
        return;
    }

    const lastEditedFile = getLatestFile(taskDir, taskFiles);

    if (!lastEditedFile) {
        console.log(chalk.red(`No task files found in ${taskDir}`));
        return;
    }

    // タスク名を抽出
    const fileName = path.basename(lastEditedFile);
    const taskName = extractTaskName(fileName);

    // タスク名が空の場合は異常として停止
    if (!taskName || taskName.trim() === '') {
        console.log(chalk.red(`Error: Invalid task file name "${fileName}". Task name is empty.`));
        return;
    }

    // 同じタスクのファイルを取得（厳密なマッチング）
    const tasks = taskFiles.filter(f => extractTaskName(f) === taskName);

    // サイクル番号がnullのファイルを除外
    const validPlans = tasks
        .filter(f => f.startsWith('plan.'))
        .filter(f => extractCycleNumber(f) !== null);
    const validReviews = tasks
        .filter(f => f.startsWith('review.'))
        .filter(f => extractCycleNumber(f) !== null);

    // planファイルがなくreviewだけ存在する異常状態をチェック
    if (validPlans.length === 0 && validReviews.length > 0) {
        console.log(chalk.red(`Error: No plan files found for task "${taskName}", but review files exist. This is an invalid state.`));
        return;
    }

    // 最大サイクル番号を取得（最小1を保証）
    const maxCyclePlan = Math.max(
        ...validPlans.map(f => extractCycleNumber(f)!),
        1
    );
    const maxCycleReview = Math.max(
        ...validReviews.map(f => extractCycleNumber(f)!),
        0
    );

    // 順序破壊検知: reviewがplanより進んでいる場合はエラー
    if (maxCycleReview > maxCyclePlan) {
        console.log(chalk.red(`Error: Cycle order violation for task "${taskName}". Review cycle (${maxCycleReview}) is ahead of plan cycle (${maxCyclePlan}).`));
        return;
    }

    // 次のプロセスを決定（plan数とreview数が同じならplan、違えばreview）
    const nowCycleProcess = maxCyclePlan === maxCycleReview ? 'plan' : 'review';

    const nowCycle = Math.max(maxCyclePlan, maxCycleReview, 1);
    // nextCycleは最小1を保証
    const nextCycle = Math.max(
        nowCycleProcess === 'review' ? maxCyclePlan : maxCyclePlan + 1,
        1
    );

    // 新しいファイルの内容を生成
    const indicates: string[] = [`# ${nowCycleProcess === 'plan' ? '実行' : 'レビュー'} サイクル${nextCycle}\n`];

    if (nowCycleProcess === 'plan') {
        indicates.push(`サイクル ${nowCycle} のレビュー参考に、プログラムを改善し、このファイルに実行内容を記載してください。\n`);
    } else {
        indicates.push(`サイクル ${nowCycle} の実行内容に対し、このファイルへレビュー所見を記載してください。\n`);
    }

    indicates.push(`## ここまでの ${nowCycleProcess === 'plan' ? 'レビュー' : '実行'}内容`);

    // 過去のサイクル情報を追記
    for (let i = 1; i <= maxCyclePlan; i++) {
        const planFile = validPlans.find(f => extractCycleNumber(f) === i);
        const reviewFile = validReviews.find(f => extractCycleNumber(f) === i);

        if (planFile) {
            indicates.push(`### サイクル${i}の実行内容`);
            indicates.push(`tasks/${planFile}`);
        }

        if (reviewFile) {
            indicates.push(`### サイクル${i}のレビュー内容`);
            indicates.push(`tasks/${reviewFile}`);
        }
    }

    indicates.push(`\n## サイクル ${nextCycle} の ${nowCycleProcess === 'plan' ? '実行' : 'レビュー'}内容\n`);
    indicates.push(`ここに記載してください。\n`);

    // ファイルを作成
    const newFileName = `${nowCycleProcess}.${taskName}.${nextCycle}.md`;
    const filePath = path.resolve(taskDir, newFileName);

    if (fs.existsSync(filePath)) {
        console.log(`${chalk.yellow('Already exists')}: ${filePath}`);
    } else {
        fs.writeFileSync(filePath, indicates.join('\n'));
        console.log(chalk.green(`Created: ${filePath}`));
    }
}
