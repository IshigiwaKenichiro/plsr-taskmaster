#!/usr/bin/env node
import { program } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCommand } from './commands/create.js';
import { cycleCommand } from './commands/cycle.js';
import { listCommand } from './commands/list.js';
import { stashCommand } from './commands/stash.js';
import { doneCommand } from './commands/done.js';
import { popCommand } from './commands/pop.js';
import { guideCommand } from './commands/guide.js';

/**
 * 自パッケージのバージョンを取得
 * loadConfig()はカレントディレクトリのpackage.json（利用者プロジェクト）を読むため使えない。
 * ビルド後の配置（<パッケージルート>/dist/index.js）を基準に1つ上のpackage.jsonを読む。
 */
function getOwnVersion(): string {
    const selfDir = path.dirname(fileURLToPath(import.meta.url));
    const pkg = fs.readJsonSync(path.join(selfDir, '..', 'package.json'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
}

(() => {
    program.name('plsr-task')
        .description('Pulsar Task Master - AIとのタスク対話を管理するツール')
        .version(getOwnVersion());

    createCommand();
    cycleCommand();
    listCommand();
    stashCommand();
    doneCommand();
    popCommand();
    guideCommand();

    program.parse(process.argv);
})();
