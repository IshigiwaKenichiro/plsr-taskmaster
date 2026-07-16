import { program } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import {
    loadConfig,
    getTaskDir,
    getCurrentTaskNames
} from '../utils/taskHelper.js';

/**
 * createコマンドを登録
 * - 既存タスクがなければアクティブに作成
 * - 既存タスクがあれば、実行中タスクを邪魔しないようstash側に作成
 */
export function createCommand() {
    program
        .command('create [taskName]')
        .description('タスクを作成する（実行中があればstash側に作成する）')
        .action(async (taskName: string = 'task') => {
            await create(taskName);
        });
}

async function create(taskName: string) {
    const config = loadConfig();
    const taskDir = getTaskDir(config);

    // タスクディレクトリがなければ作成
    fs.ensureDirSync(taskDir);

    const currentTasks = getCurrentTaskNames(taskDir);

    if (currentTasks.includes(taskName)) {
        console.log(chalk.red(`Error: Task "${taskName}" is already in progress`));
        return;
    }

    // 既存タスクがある場合は退避せず、実行中タスクを守るため新タスクをstash側に作成
    const planFileName = `plan.${taskName}.1.md`;
    const createInStash = currentTasks.length > 0;
    const destDir = createInStash
        ? path.join(taskDir, 'stash', taskName)
        : taskDir;
    const planFilePath = path.join(destDir, planFileName);

    if (fs.existsSync(planFilePath)) {
        console.log(chalk.red(`Error: ${planFileName} already exists`));
        return;
    }

    const content = `# ${taskName}

## 目的
ここにタスクの目的を記述してください。

## 指示内容
ここに具体的な指示を記述してください。

## 実行結果
ここに実行結果を書いて
`;

    fs.ensureDirSync(destDir);
    fs.writeFileSync(planFilePath, content);
    console.log(chalk.green(`Created: ${planFilePath}`));

    if (createInStash) {
        console.log(chalk.cyan(`Current tasks are in progress, so created in stash. Run "pop -t ${taskName}" to activate it.`));
    }
}
