#!/usr/bin/env node
import { program } from 'commander';
import { createCommand } from './commands/create.js';
import { cycleCommand } from './commands/cycle.js';
import { stashCommand } from './commands/stash.js';
import { doneCommand } from './commands/done.js';
import { popCommand } from './commands/pop.js';

(() => {
    program.name('plsr-task')
        .description('Pulsar Task Master - AIとのタスク対話を管理するツール')
        .version('1.0.0');

    createCommand();
    cycleCommand();
    stashCommand();
    doneCommand();
    popCommand();

    program.parse(process.argv);
})();
