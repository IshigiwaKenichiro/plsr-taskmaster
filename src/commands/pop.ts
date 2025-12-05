import { program } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import inq from 'inquirer';
import {
    loadConfig,
    getTaskDir,
    getCurrentTaskNames,
    getTaskFilesByName
} from '../utils/taskHelper.js';

/**
 * popコマンドを登録
 * - stashされたタスクを復元
 */
export function popCommand() {
    program
        .command('pop')
        .description('stashされたタスクを復元する')
        .option('-t, --task <taskName>', '復元するタスク名を指定')
        .action(async (options) => {
            await pop(options.task);
        });
}

/**
 * stashディレクトリ内のタスク名一覧を取得
 */
function getStashedTaskNames(stashDir: string): string[] {
    if (!fs.existsSync(stashDir)) {
        return [];
    }

    return fs.readdirSync(stashDir)
        .filter(f => fs.statSync(path.join(stashDir, f)).isDirectory());
}

/**
 * inquirerでタスクを選択
 */
async function selectTask(taskNames: string[]): Promise<string> {
    const { selectedTask } = await inq.prompt([{
        name: 'selectedTask',
        type: 'list',
        message: 'Select task to pop:',
        choices: taskNames
    }]);

    return selectedTask;
}

/**
 * タスクに関連する全エントリを取得
 * - plan.<taskName>.<cycle>.md, review.<taskName>.<cycle>.md
 * - <taskName>.* (補助ファイル: <taskName>.notes.txt, <taskName>.assets/ など)
 * - <taskName>/ (タスク専用ディレクトリ)
 */
function getTaskRelatedEntries(taskDir: string, taskName: string): string[] {
    if (!fs.existsSync(taskDir)) {
        return [];
    }

    const entries = fs.readdirSync(taskDir);
    const related: string[] = [];

    for (const entry of entries) {
        // stashディレクトリは除外
        if (entry === 'stash') continue;

        // plan.<taskName>.<cycle>.md または review.<taskName>.<cycle>.md
        if ((entry.startsWith(`plan.${taskName}.`) || entry.startsWith(`review.${taskName}.`)) && entry.endsWith('.md')) {
            related.push(entry);
            continue;
        }

        // <taskName>.* (補助ファイル/ディレクトリ)
        if (entry.startsWith(`${taskName}.`)) {
            related.push(entry);
            continue;
        }

        // <taskName>/ (タスク専用ディレクトリ、ファイル名と完全一致)
        if (entry === taskName) {
            const entryPath = path.join(taskDir, entry);
            if (fs.statSync(entryPath).isDirectory()) {
                related.push(entry);
            }
        }
    }

    return related;
}

/**
 * 現在のタスクをstashに退避
 * @param excludeTaskName ポップ対象のタスク名（既存stashを破壊しないよう除外）
 */
async function stashCurrentTasks(taskDir: string, stashDir: string, excludeTaskName?: string): Promise<void> {
    let currentTasks = getCurrentTaskNames(taskDir);

    // ポップ対象のタスクは除外（既存stashを上書きしないため）
    if (excludeTaskName) {
        currentTasks = currentTasks.filter(name => name !== excludeTaskName);
    }

    if (currentTasks.length === 0) {
        return;
    }

    console.log(chalk.yellow('Stashing current tasks first...'));
    fs.ensureDirSync(stashDir);

    for (const taskName of currentTasks) {
        const taskStashDir = path.join(stashDir, taskName);
        fs.ensureDirSync(taskStashDir);

        // タスクに関連する全エントリを取得（.md以外の補助ファイル/ディレクトリも含む）
        const entries = getTaskRelatedEntries(taskDir, taskName);
        for (const entry of entries) {
            const srcPath = path.join(taskDir, entry);
            const destPath = path.join(taskStashDir, entry);
            const isDir = fs.statSync(srcPath).isDirectory();
            fs.moveSync(srcPath, destPath, { overwrite: true });
            const typeLabel = isDir ? '[dir]' : '[file]';
            console.log(chalk.yellow(`  Stashed: ${entry} ${typeLabel} -> stash/${taskName}/`));
        }
    }
}

/**
 * 指定タスクをpop（stashから復元）
 * 全エントリを移動（ファイル、サブディレクトリ含む）
 */
async function popTask(taskDir: string, stashDir: string, taskName: string): Promise<void> {
    const taskStashDir = path.join(stashDir, taskName);

    if (!fs.existsSync(taskStashDir)) {
        console.log(chalk.red(`Task "${taskName}" not found in stash`));
        return;
    }

    // 全エントリを取得（ファイル、サブディレクトリ含む）
    const entries = fs.readdirSync(taskStashDir);

    if (entries.length === 0) {
        console.log(chalk.red(`No entries found in stash/${taskName}/`));
        return;
    }

    for (const entry of entries) {
        const srcPath = path.join(taskStashDir, entry);
        const destPath = path.join(taskDir, entry);
        const isDir = fs.statSync(srcPath).isDirectory();
        fs.moveSync(srcPath, destPath, { overwrite: true });
        const typeLabel = isDir ? '[dir]' : '[file]';
        console.log(chalk.green(`  Restored: stash/${taskName}/${entry} ${typeLabel} -> ${entry}`));
    }

    // 空になったstashディレクトリを削除
    fs.removeSync(taskStashDir);
    console.log(chalk.green(`\nPopped task: ${taskName}`));
}

async function pop(taskName?: string) {
    const config = loadConfig();
    const taskDir = getTaskDir(config);
    const stashDir = path.join(taskDir, 'stash');

    if (!fs.existsSync(stashDir)) {
        console.log(chalk.yellow('No stashed tasks'));
        return;
    }

    const stashedTasks = getStashedTaskNames(stashDir);

    if (stashedTasks.length === 0) {
        console.log(chalk.yellow('No stashed tasks'));
        return;
    }

    // タスク名を決定
    let selectedTask = taskName;

    if (!selectedTask) {
        // 1件の場合はリスト入力せずにそのままpop
        if (stashedTasks.length === 1) {
            selectedTask = stashedTasks[0];
            console.log(chalk.cyan(`Auto-selecting single stashed task: ${selectedTask}`));
        } else {
            // 複数件の場合はinquirerでリスト選択
            selectedTask = await selectTask(stashedTasks);
        }
    }

    // 指定されたタスクがstashに存在するか確認
    if (!stashedTasks.includes(selectedTask)) {
        console.log(chalk.red(`Task "${selectedTask}" not found in stash`));
        console.log(chalk.cyan('Available stashed tasks:'));
        stashedTasks.forEach(name => console.log(chalk.white(`  - ${name}`)));
        return;
    }

    // 現在のタスクがあれば先にstash（ポップ対象は除外して既存stashを保護）
    await stashCurrentTasks(taskDir, stashDir, selectedTask);

    // 選択されたタスクをpop
    await popTask(taskDir, stashDir, selectedTask);
}
