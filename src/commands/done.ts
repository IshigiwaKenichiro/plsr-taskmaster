import { program } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { format } from 'date-fns';
import {
    loadConfig,
    getTaskDir,
    getCurrentTaskNames,
    getTaskFilesByName
} from '../utils/taskHelper.js';

/**
 * doneコマンドを登録
 * - 実行中のタスクをdone.yyyy-MM-ddディレクトリに移動
 */
export function doneCommand() {
    program
        .command('done')
        .description('実行中タスクを完了する')
        .action(async () => {
            await done();
        });
}

async function done() {
    const config = loadConfig();
    const taskDir = getTaskDir(config);

    if (!fs.existsSync(taskDir)) {
        console.log(chalk.red(`Task directory not found: ${taskDir}`));
        return;
    }

    const currentTasks = getCurrentTaskNames(taskDir);

    if (currentTasks.length === 0) {
        console.log(chalk.yellow('No active tasks to complete'));
        return;
    }

    // 今日の日付でdoneディレクトリを作成
    const today = format(new Date(), 'yyyy-MM-dd');
    const doneDirName = `done.${today}`;
    const doneDir = path.join(taskDir, doneDirName);
    fs.ensureDirSync(doneDir);

    for (const taskName of currentTasks) {
        const taskDoneDir = path.join(doneDir, taskName);
        fs.ensureDirSync(taskDoneDir);

        const files = getTaskFilesByName(taskDir, taskName);
        for (const file of files) {
            const destPath = path.join(taskDoneDir, file.fileName);
            fs.moveSync(file.filePath, destPath, { overwrite: true });
            console.log(chalk.blue(`Done: ${file.fileName} -> ${doneDirName}/${taskName}/`));
        }
    }

    console.log(chalk.green(`Completed ${currentTasks.length} task(s)`));
}
