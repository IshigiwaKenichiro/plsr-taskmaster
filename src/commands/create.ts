import { program } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import {
    loadConfig,
    getTaskDir,
    getCurrentTaskNames,
    getTaskFilesByName
} from '../utils/taskHelper.js';

/**
 * createコマンドを登録
 * - 既存タスクがあればstashに退避
 * - 新しいタスクを作成
 */
export function createCommand() {
    program
        .command('create [taskName]')
        .description('タスクを作成する（実行中があればわきにどける）')
        .action(async (taskName: string = 'task') => {
            await create(taskName);
        });
}

async function create(taskName: string) {
    const config = loadConfig();
    const taskDir = getTaskDir(config);

    // タスクディレクトリがなければ作成
    fs.ensureDirSync(taskDir);

    // 既存タスクをstashに退避
    const currentTasks = getCurrentTaskNames(taskDir);
    if (currentTasks.length > 0) {
        const stashDir = path.join(taskDir, 'stash');
        fs.ensureDirSync(stashDir);

        for (const existingTaskName of currentTasks) {
            const taskStashDir = path.join(stashDir, existingTaskName);
            fs.ensureDirSync(taskStashDir);

            const files = getTaskFilesByName(taskDir, existingTaskName);
            for (const file of files) {
                const destPath = path.join(taskStashDir, file.fileName);
                fs.moveSync(file.filePath, destPath, { overwrite: true });
                console.log(chalk.yellow(`Stashed: ${file.fileName} -> stash/${existingTaskName}/`));
            }
        }
    }

    // 新しいタスクを作成
    const planFileName = `plan.${taskName}.1.md`;
    const planFilePath = path.join(taskDir, planFileName);

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

    fs.writeFileSync(planFilePath, content);
    console.log(chalk.green(`Created: ${planFilePath}`));
}
