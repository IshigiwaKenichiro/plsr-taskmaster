#!/usr/bin/env node
/**
 * グローバルインストール検証スクリプト
 *
 * 実行方法:
 *   node scripts/global-install-test.js
 *
 * 検証内容:
 *   1. npm packでtgzを生成
 *   2. npm install -g <tgz>でグローバルインストール
 *   3. plsr-task --helpで動作確認
 *   4. 一時プロジェクトで各コマンドをテスト（ptmエイリアス使用）
 *   5. npm uninstall -g plsr-taskmasterでアンインストール
 *   6. 一時ディレクトリを削除
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const ROOT_DIR = process.cwd();
const TEMP_DIR = path.join(os.tmpdir(), `plsr-task-test-${Date.now()}`);
const PACKAGE_NAME = 'plsr-taskmaster';

// 色付きログ出力
const log = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[OK]\x1b[0m ${msg}`),
    error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
    warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
    section: (msg) => console.log(`\n\x1b[35m=== ${msg} ===\x1b[0m\n`),
};

// コマンド実行（結果を返す）
function run(cmd, options = {}) {
    log.info(`Executing: ${cmd}`);
    try {
        const result = execSync(cmd, {
            encoding: 'utf-8',
            stdio: options.silent ? 'pipe' : 'inherit',
            cwd: options.cwd || ROOT_DIR,
            ...options,
        });
        return { success: true, output: result };
    } catch (error) {
        return { success: false, error: error.message, output: error.stdout };
    }
}

// 環境情報を出力
function printEnvironment() {
    log.section('Environment Information');
    log.info(`OS: ${os.platform()} ${os.release()}`);
    log.info(`Node.js: ${process.version}`);
    log.info(`npm: ${execSync('npm --version', { encoding: 'utf-8' }).trim()}`);
    log.info(`Root directory: ${ROOT_DIR}`);
    log.info(`Temp directory: ${TEMP_DIR}`);

    // plsr-taskのPATH確認
    const whichCmd = os.platform() === 'win32' ? 'where' : 'which';
    try {
        const plsrTaskPath = execSync(`${whichCmd} plsr-task`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
        log.warn(`plsr-task already exists at: ${plsrTaskPath}`);
    } catch {
        log.info('plsr-task is not currently installed globally');
    }
}

// テスト結果を記録
const testResults = [];
function recordTest(name, success, message = '') {
    testResults.push({ name, success, message });
    if (success) {
        log.success(`${name}: PASSED`);
    } else {
        log.error(`${name}: FAILED - ${message}`);
    }
}

// メイン処理
async function main() {
    let tgzFile = null;
    let installedGlobally = false;

    try {
        printEnvironment();

        // 1. ビルド確認
        log.section('Step 1: Build Check');
        if (!fs.existsSync(path.join(ROOT_DIR, 'dist', 'index.js'))) {
            log.info('dist/index.js not found. Running build...');
            const buildResult = run('npm run build');
            if (!buildResult.success) {
                throw new Error('Build failed');
            }
        }
        recordTest('Build check', true);

        // 2. npm pack
        log.section('Step 2: npm pack');
        const packResult = run('npm pack', { silent: true });
        if (!packResult.success) {
            throw new Error(`npm pack failed: ${packResult.error}`);
        }
        tgzFile = packResult.output.trim();
        log.info(`Created: ${tgzFile}`);
        recordTest('npm pack', fs.existsSync(path.join(ROOT_DIR, tgzFile)));

        // 3. グローバルインストール
        log.section('Step 3: Global Install');
        const installResult = run(`npm install -g "${path.join(ROOT_DIR, tgzFile)}"`);
        if (!installResult.success) {
            throw new Error('Global install failed');
        }
        installedGlobally = true;
        recordTest('Global install', true);

        // 4. plsr-task --help
        log.section('Step 4: plsr-task --help');
        const helpResult = run('plsr-task --help', { silent: true });
        recordTest('plsr-task --help', helpResult.success && helpResult.output.includes('Pulsar Task Master'));

        // 5. 一時プロジェクトで各コマンドをテスト
        log.section('Step 5: Command Tests in Temp Project');
        fs.ensureDirSync(TEMP_DIR);
        fs.writeJsonSync(path.join(TEMP_DIR, 'package.json'), {
            name: 'test-project',
            version: '1.0.0',
            'plsr-task': { 'task-dir': 'tasks' }
        });

        // 5.1 ptm create
        log.info('Testing: ptm create sample-task');
        const createResult = run('ptm create sample-task', { cwd: TEMP_DIR, silent: true });
        const createFileExists = fs.existsSync(path.join(TEMP_DIR, 'tasks', 'plan.sample-task.1.md'));
        recordTest('ptm create', createResult.success && createFileExists,
            createFileExists ? '' : 'plan.sample-task.1.md not created');

        // 5.2 ptm cycle
        log.info('Testing: ptm cycle');
        const cycleResult = run('ptm cycle', { cwd: TEMP_DIR, silent: true });
        const reviewFileExists = fs.existsSync(path.join(TEMP_DIR, 'tasks', 'review.sample-task.1.md'));
        recordTest('ptm cycle', cycleResult.success && reviewFileExists,
            reviewFileExists ? '' : 'review.sample-task.1.md not created');

        // 5.3 ptm stash
        log.info('Testing: ptm stash');
        const stashResult = run('ptm stash', { cwd: TEMP_DIR, silent: true });
        const stashDirExists = fs.existsSync(path.join(TEMP_DIR, 'tasks', 'stash', 'sample-task'));
        recordTest('ptm stash', stashResult.success && stashDirExists,
            stashDirExists ? '' : 'stash/sample-task not created');

        // 5.4 ptm pop
        log.info('Testing: ptm pop');
        const popResult = run('ptm pop', { cwd: TEMP_DIR, silent: true });
        const planFileRestored = fs.existsSync(path.join(TEMP_DIR, 'tasks', 'plan.sample-task.1.md'));
        recordTest('ptm pop', popResult.success && planFileRestored,
            planFileRestored ? '' : 'plan.sample-task.1.md not restored');

        // 5.5 ptm done
        log.info('Testing: ptm done');
        const doneResult = run('ptm done', { cwd: TEMP_DIR, silent: true });
        // doneディレクトリが作成されているか確認
        const tasksDirEntries = fs.readdirSync(path.join(TEMP_DIR, 'tasks'));
        const doneDirExists = tasksDirEntries.some(e => e.startsWith('done.'));
        recordTest('ptm done', doneResult.success && doneDirExists,
            doneDirExists ? '' : 'done.* directory not created');

    } catch (error) {
        log.error(`Test failed: ${error.message}`);
        recordTest('Overall', false, error.message);
    } finally {
        // クリーンアップ
        log.section('Cleanup');

        // グローバルアンインストール
        if (installedGlobally) {
            log.info('Uninstalling global package...');
            run(`npm uninstall -g ${PACKAGE_NAME}`, { silent: true });
        }

        // tgzファイル削除
        if (tgzFile && fs.existsSync(path.join(ROOT_DIR, tgzFile))) {
            log.info(`Removing ${tgzFile}...`);
            fs.removeSync(path.join(ROOT_DIR, tgzFile));
        }

        // 一時ディレクトリ削除
        if (fs.existsSync(TEMP_DIR)) {
            log.info(`Removing temp directory: ${TEMP_DIR}`);
            fs.removeSync(TEMP_DIR);
        }

        // 結果サマリー
        log.section('Test Results Summary');
        const passed = testResults.filter(t => t.success).length;
        const failed = testResults.filter(t => !t.success).length;

        testResults.forEach(t => {
            const status = t.success ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m';
            console.log(`  ${status} - ${t.name}${t.message ? `: ${t.message}` : ''}`);
        });

        console.log(`\n  Total: ${passed} passed, ${failed} failed`);

        if (failed > 0) {
            process.exit(1);
        }
    }
}

main();
