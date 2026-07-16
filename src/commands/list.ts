import { program } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import {
    loadConfig,
    getTaskDir,
    getTaskFiles,
    getCurrentTaskNames,
    getTaskFilesByName,
    getTaskStatus,
    getStashedTaskNames,
    getDoneArchives,
    TaskStatus,
    STASH_DIR_NAME
} from '../utils/taskHelper.js';

/**
 * listコマンドを登録
 * - 実行中タスク・stash・doneアーカイブの一覧とサイクル状態を表示
 */
export function listCommand() {
    program
        .command('list')
        .aliases(['ls', 'status'])
        .description('タスクの一覧とサイクル状態を表示する')
        .option('--json', 'JSON形式で出力する（AIエージェント向け）')
        .option('-a, --all', 'doneアーカイブのタスク名まで表示する')
        .action(async (options: { json?: boolean; all?: boolean }) => {
            await list(options);
        });
}

/** doneアーカイブの表示用情報（taskNamesは--all時のみ含める） */
interface DoneSummary {
    date: string;
    count: number;
    taskNames?: string[];
}

/** list出力用のスナップショット（--jsonでそのままシリアライズする） */
interface ListResult {
    taskDir: string;
    active: TaskStatus[];
    stash: TaskStatus[];
    done: DoneSummary[];
}

/** plan/reviewファイルを1つも持たない壊れたstashディレクトリ（人間向け表示でのみ警告する） */
type InvalidStashNames = string[];

async function list(options: { json?: boolean; all?: boolean }) {
    const config = loadConfig();
    const taskDir = getTaskDir(config);

    const [result, invalidStash] = collectListResult(taskDir, config.taskDir, options.all === true);

    if (options.json) {
        // AIやパイプ処理が読むため、色コードを混ぜず純粋なJSONのみ出力する
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    printHumanReadable(result, invalidStash);
}

/**
 * タスク状況を収集する
 * taskDirが存在しなくてもエラーにせず空として返す（AIがcreate前の状態確認に使うため）
 */
function collectListResult(taskDir: string, taskDirLabel: string, includeDoneTaskNames: boolean): [ListResult, InvalidStashNames] {
    // アクティブタスク
    const active = getCurrentTaskNames(taskDir)
        .map(name => getTaskStatus(name, getTaskFilesByName(taskDir, name)))
        .filter((s): s is TaskStatus => s !== null);

    // stashタスク: stash/<name>/ 配下のファイルから同様にサイクル状態を算出
    const stashDir = path.join(taskDir, STASH_DIR_NAME);
    const stash: TaskStatus[] = [];
    const invalidStash: InvalidStashNames = [];

    for (const name of getStashedTaskNames(stashDir)) {
        const files = getTaskFiles(path.join(stashDir, name));
        const status = getTaskStatus(name, files);
        if (status) {
            stash.push(status);
        } else {
            // pop対象として壊れているため一覧から除外し、別途警告する
            invalidStash.push(name);
        }
    }

    // doneアーカイブ: 日付ディレクトリが増え続けるため、デフォルトは件数サマリのみ
    const done: DoneSummary[] = getDoneArchives(taskDir).map(archive => ({
        date: archive.date,
        count: archive.taskNames.length,
        ...(includeDoneTaskNames ? { taskNames: archive.taskNames } : {})
    }));

    return [{ taskDir: taskDirLabel, active, stash, done }, invalidStash];
}

/** タスク行のインデント幅と列間の空白 */
const INDENT = '  ';
const COLUMN_GAP = '   ';

function printHumanReadable(result: ListResult, invalidStash: InvalidStashNames) {
    console.log(chalk.bold(`Tasks in: ${result.taskDir}\n`));

    // 列揃えのため、全セクション共通の最長タスク名から幅を算出する
    const allNames = [...result.active, ...result.stash].map(s => s.taskName);
    const nameWidth = Math.max(...allNames.map(n => n.length), 0);

    printStatusSection('Active', result.active, chalk.green('●'), nameWidth);
    printStatusSection('Stash', result.stash, chalk.yellow('○'), nameWidth);

    if (invalidStash.length > 0) {
        for (const name of invalidStash) {
            console.log(chalk.gray(`${INDENT}(invalid stash: ${name})`));
        }
    }

    const totalDoneTasks = result.done.reduce((sum, d) => sum + d.count, 0);
    console.log(chalk.bold(`Done (${result.done.length} archives, ${totalDoneTasks} tasks):`));
    if (result.done.length === 0) {
        console.log(chalk.gray(`${INDENT}(none)`));
    }
    for (const archive of result.done) {
        console.log(chalk.blue(`${INDENT}done.${archive.date}${COLUMN_GAP}${archive.count} task(s)`));
        for (const name of archive.taskNames ?? []) {
            console.log(chalk.blue(`${INDENT}${INDENT}- ${name}`));
        }
    }
}

function printStatusSection(title: string, statuses: TaskStatus[], marker: string, nameWidth: number) {
    console.log(chalk.bold(`${title} (${statuses.length}):`));

    if (statuses.length === 0) {
        // AIが「空」を誤解しないよう明示する
        console.log(chalk.gray(`${INDENT}(none)`));
    }

    for (const s of statuses) {
        const nextColor = s.nextAction === 'run' ? chalk.cyan : chalk.magenta;
        console.log([
            `${INDENT}${marker} ${s.taskName.padEnd(nameWidth)}`,
            `cycle ${s.cycle}`,
            nextColor(`next: ${s.nextAction.padEnd('review'.length)}`),
            chalk.gray(`(plan:${s.planCount} review:${s.reviewCount})`)
        ].join(COLUMN_GAP));
    }

    console.log('');
}
