import { program } from 'commander';
import path from 'path';
import fs from 'fs-extra';

/** SKILL.md のテンプレート */
const SKILL_TEMPLATE = `---
name: task-cycle
description: >
  plsr-taskmasterとai-meetingを連携し、AIエージェント間でplan/reviewサイクルを自動実行する。Executorが実装し、Reviewerがレビューし、交互にサイクルを回す。
---

# Task Cycle スキル

plsr-taskmaster（\`ptm\`）によるplan/reviewサイクルを、ai-meeting（\`mtg\`）によるエージェント間通知と組み合わせて実行する。

## 前提

- \`plsr-taskmaster\`（\`ptm\`コマンド）がインストール済み
- \`plsr-meeting\`（\`mtg\`コマンド）がインストール済み
- 最初のplanファイルはユーザーが手動で作成済み（\`npx ptm create <taskName>\`）
- tasksディレクトリは \`package.json\` の \`plsr-task.task-dir\` または デフォルト \`tasks\`

## エージェント名

| 役割 | エージェント名 | 担当 |
|------|--------------|------|
| 実行者 | \`executor\` | planファイルの指示に従いコードを実装する |
| レビュアー | \`reviewer\` | plan実行結果をレビューし所見を記入する |

## 引数による動作分岐

\`$ARGUMENTS\` に応じて以下を実行する。

---

### \`run\` — 実行モード（Executor）

planファイルを読み、指示に従ってコードを実装し、結果を記入する。

#### 手順

1. **ミーティング準備**
   \`\`\`bash
   mtg join --name executor
   \`\`\`

2. **タスクディレクトリの特定**
   - \`package.json\` の \`plsr-task.task-dir\` を確認（デフォルト: \`tasks\`）

3. **最新のplanファイルを特定**
   - tasksディレクトリ内の \`plan.*.md\` ファイルを検索
   - 最も大きいサイクル番号のplanファイルが対象
   - 対応する同一サイクルの \`review.*.md\` が**存在しない**ものが未実行のplanファイル

4. **planファイルを読み込む**
   - 指示内容を把握
   - サイクル2以降の場合、参照されている過去のreviewファイルも読み、レビュー所見を理解する

5. **指示に従ってコードを実装する**
   - planに書かれた指示通りに作業を実行
   - 必要に応じてファイルの読み書き、テスト実行を行う

6. **実行結果をplanファイルに追記する**
   - planファイルの末尾に \`## 実行結果\` セクションを追記
   - 何を実施し、何を変更したかを記載
   - 変更したファイル一覧を記載

7. **サイクルを進める**
   \`\`\`bash
   npx ptm cycle
   \`\`\`
   これにより \`review.<taskName>.<N>.md\` が作成される

8. **ミーティングで通知**
   - タスク名のスレッドが存在しなければ作成:
     \`\`\`bash
     mtg start "<taskName>" --name executor --message "plan.<taskName>.<N>.md の実行が完了しました。レビューをお願いします。"
     \`\`\`
   - スレッドが存在すれば追記:
     \`\`\`bash
     mtg say "plan.<taskName>.<N>.md の実行が完了しました。レビューをお願いします。" --name executor
     \`\`\`

---

### \`review\` — レビューモード（Reviewer）

plan実行結果をレビューし、reviewファイルに所見を記入する。**コードの修正は行わない。**

#### 手順

1. **ミーティング準備**
   \`\`\`bash
   mtg join --name reviewer
   \`\`\`

2. **最新のreviewファイルを特定**
   - tasksディレクトリ内の \`review.*.md\` ファイルを検索
   - 最も大きいサイクル番号で、まだ所見が未記入のreviewファイルが対象

3. **reviewファイルと参照先を読み込む**
   - reviewファイル内で参照されている過去のplan/reviewファイルを読む
   - 対応する \`plan.<taskName>.<N>.md\` の実行結果を読む

4. **コード変更を確認する**
   - planの実行結果に記載された変更ファイルを読む
   - git diff で差分を確認してもよい
   - コードの品質、設計、バグの有無を評価する

5. **レビュー所見をreviewファイルに記入する**
   - reviewファイルの所定セクションにレビュー所見を記載
   - 以下の観点でレビューする:
     - 指示通りに実装されているか
     - コード品質（可読性、保守性）
     - バグや潜在的な問題
     - 改善提案
   - **コードの直接修正は行わない**（所見として記述するのみ）

6. **サイクルを進める**
   \`\`\`bash
   npx ptm cycle
   \`\`\`
   これにより \`plan.<taskName>.<N+1>.md\` が作成される

7. **ミーティングで通知**
   \`\`\`bash
   mtg say "review.<taskName>.<N>.md のレビューが完了しました。改善をお願いします。" --name reviewer
   \`\`\`

---

### 引数なし — ステータス表示

現在のタスク状況を表示する。

\`\`\`bash
npx ptm cycle  # 何もなければエラーで現状がわかる
\`\`\`

tasksディレクトリ内のファイル一覧を表示し、現在のサイクル状態を報告する:
- 最新のplanファイル名とサイクル番号
- 最新のreviewファイル名とサイクル番号
- 次に必要なアクション（run / review）

---

### \`check\` — ミーティング確認

\`/meeting check\` と同等の動作を行う。自分宛のメッセージを確認し、未読があれば内容を読み、適切なアクション（\`run\` or \`review\`）を判断して実行する。

1. \`mtg check --name <自分のエージェント名>\` を実行
2. 未読ありの場合:
   - \`mtg read\` でスレッド全文取得
   - メッセージ内容から次のアクションを判断:
     - 「レビューをお願いします」→ \`review\` モードを実行
     - 「改善をお願いします」→ \`run\` モードを実行
   - 対応する処理を自動実行
3. 未読なしの場合:
   - 「未読メッセージはありません」と表示

---

## 注意事項

- planファイルの内容は**追記**する。既存の内容を上書きしない
- reviewファイルも同様に追記する
- Reviewerはコード修正を行わない。所見のみ記入する
- ミーティングスレッド名にはタスク名をそのまま使う
- サイクルが完了したら \`npx ptm done\` でアーカイブ可能（手動）
`;

/**
 * guideコマンド: スキルのセットアップガイドを出力する
 */
export function guideCommand() {
    program
        .command('guide')
        .description('AIエージェント向けのスキルセットアップガイドを表示する')
        .option('--install', 'SKILL.mdを ~/.claude/skills/task-cycle/ に自動インストールする')
        .action((opts) => {
            if (opts.install) {
                installSkill();
                return;
            }

            printGuide();
        });
}

function installSkill() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (!home) {
        console.error(JSON.stringify({ error: 'HOME/USERPROFILE が見つかりません' }));
        process.exit(2);
    }

    const skillDir = path.join(home, '.claude', 'skills', 'task-cycle');
    const skillPath = path.join(skillDir, 'Skill.md');

    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillPath, SKILL_TEMPLATE, 'utf-8');

    console.log(JSON.stringify({
        installed: true,
        path: skillPath,
        next: 'plsr-meeting（mtg）もインストールしてください',
    }));
}

function printGuide() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const skillDir = path.join(home, '.claude', 'skills', 'task-cycle');
    const skillPath = path.join(skillDir, 'Skill.md');
    const skillExists = fs.existsSync(skillPath);

    const guide = `# plsr-taskmaster セットアップガイド（AIエージェント向け）

## 1. 前提パッケージ

以下の2つがグローバルインストールされている必要があります:

\`\`\`bash
npm install -g plsr-taskmaster
npm install -g plsr-meeting
\`\`\`

## 2. スキルのインストール

${skillExists
    ? `✓ Skill.md は既にインストール済みです: ${skillPath}`
    : `Skill.md が未インストールです。以下のコマンドで自動インストールできます:

\`\`\`bash
ptm guide --install
\`\`\`

または手動で \`${skillPath}\` に配置してください。`
}

## 3. 権限設定（推奨）

\`~/.claude/settings.json\` の \`allowedTools\` に以下を追加すると、毎回の承認が不要になります:

\`\`\`json
"Bash(ptm *)",
"Bash(npx ptm *)",
"Bash(mtg *)"
\`\`\`

## 4. 基本的な使い方

### タスク作成（ユーザーが手動で行う）
\`\`\`bash
npx ptm create <taskName>
\`\`\`

### 実行モード（Executor側のAI）
\`\`\`
/task-cycle run
\`\`\`

### レビューモード（Reviewer側のAI）
\`\`\`
/task-cycle review
\`\`\`

### ミーティング確認（通知を受けたAI）
\`\`\`
/task-cycle check
\`\`\`

### ステータス確認
\`\`\`
/task-cycle
\`\`\`

## 5. ワークフロー

\`\`\`
ユーザー: ptm create myTask → plan.myTask.1.md 作成
    ↓
Executor: /task-cycle run → 実装 → review.myTask.1.md 作成 → Reviewer通知
    ↓
Reviewer: /task-cycle review → 所見記入 → plan.myTask.2.md 作成 → Executor通知
    ↓
Executor: /task-cycle run → 改善 → review.myTask.2.md 作成 → Reviewer通知
    ↓
（繰り返し）
    ↓
ユーザー: ptm done → アーカイブ
\`\`\`
`;

    console.log(guide);
}
