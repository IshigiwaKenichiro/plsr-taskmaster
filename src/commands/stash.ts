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
 * stashコマンドを登録
 * - 実行中のタスクをstashディレクトリに退避
 */
export function stashCommand() {
    program
        .command('stash')
        .description('実行中タスクをわきにどける')
        .action(async () => {
            await stash();
        });
}

async function stash() {
    const config = loadConfig();
    const taskDir = getTaskDir(config);

    if (!fs.existsSync(taskDir)) {
        console.log(chalk.red(`Task directory not found: ${taskDir}`));
        return;
    }

    const currentTasks = getCurrentTaskNames(taskDir);

    if (currentTasks.length === 0) {
        console.log(chalk.yellow('No active tasks to stash'));
        return;
    }

    const stashDir = path.join(taskDir, 'stash');
    fs.ensureDirSync(stashDir);

    for (const taskName of currentTasks) {
        const taskStashDir = path.join(stashDir, taskName);
        fs.ensureDirSync(taskStashDir);

        const files = getTaskFilesByName(taskDir, taskName);
        for (const file of files) {
            const destPath = path.join(taskStashDir, file.fileName);
            fs.moveSync(file.filePath, destPath, { overwrite: true });
            console.log(chalk.yellow(`Stashed: ${file.fileName} -> stash/${taskName}/`));
        }
    }

    console.log(chalk.green(`Stashed ${currentTasks.length} task(s)`));
}
