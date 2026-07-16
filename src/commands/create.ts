import { program } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { format } from 'date-fns';
import {
    loadConfig,
    getTaskDir,
    getCurrentTaskNames,
    STASH_DIR_NAME,
    DONE_DATE_FORMAT
} from '../utils/taskHelper.js';
import { loadPlanTemplate, renderTemplate } from '../utils/planTemplate.js';

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
        ? path.join(taskDir, STASH_DIR_NAME, taskName)
        : taskDir;
    const planFilePath = path.join(destDir, planFileName);

    if (fs.existsSync(planFilePath)) {
        console.log(chalk.red(`Error: ${planFileName} already exists`));
        return;
    }

    // テンプレート読込（設定不備時は内蔵デフォルトにフォールバックしてcreateを止めない）
    const templateResult = loadPlanTemplate(config);
    if (templateResult.warning) {
        console.log(chalk.yellow(`Warning: ${templateResult.warning}`));
    }

    const content = renderTemplate(templateResult.content, {
        taskName,
        date: format(new Date(), DONE_DATE_FORMAT)
    });

    fs.ensureDirSync(destDir);
    fs.writeFileSync(planFilePath, content);
    console.log(chalk.green(`Created: ${planFilePath}`));

    if (templateResult.source === 'file') {
        console.log(chalk.gray(`Template: ${templateResult.resolvedPath}`));
    }

    if (createInStash) {
        console.log(chalk.cyan(`Current tasks are in progress, so created in stash. Run "pop -t ${taskName}" to activate it.`));
    }
}
