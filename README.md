# Pulsar Task Master (plsr-taskmaster)
AIとのタスク対話を行うためのライブラリです。

詳細なドキュメント:
- [コマンドリファレンス](docs/commands.md)
- [設定ガイド](docs/configuration.md)
- [変更履歴](CHANGELOG.md)

# Install

## グローバルインストール（推奨）
```bash
npm install -g plsr-taskmaster
```

## ローカルインストール
```bash
npm i plsr-taskmaster
```

# Usage
タスクフォルダはデフォルトで`tasks`です。変更したい場合はpackage.json内に`plsr-task`プロパティを作成してください。こんな感じです。

```json
...
    "plsr-task" : {
        "task-dir" : "tasks",
        "template" : "templates/plan-template.md"
    }
```

## planテンプレートのカスタマイズ
`template`にテンプレートファイルのパス（package.jsonからの相対または絶対）を指定すると、`create`時のplan雛形を差し替えられます。未指定の場合は内蔵デフォルトが使われます。

テンプレート内では以下のプレースホルダが使えます。

| プレースホルダ | 置換内容 |
|---------------|---------|
| `{{taskName}}` | タスク名 |
| `{{date}}` | 作成日（yyyy-MM-dd） |

未知のプレースホルダはそのまま残ります。テンプレートファイルが存在しない・読めない・空の場合は警告を表示し、内蔵デフォルトにフォールバックします（createは失敗しません）。

## コマンド一覧

| 正式コマンド | エイリアス | 説明 |
|-------------|-----------|------|
| `plsr-task` | `ptm` | 短縮形で利用可能 |

コマンドラインからの利用は以下のように実施します。
```bash
# タスクを作成する(実行中があればわきにどける)
npx plsr-task create <タスク名(default="task")>
# または短縮形
npx ptm create <タスク名>

# タスクのplan/reviewサイクルを作成する
npx ptm cycle

# タスク一覧とサイクル状態を表示する（ls / status でも可）
npx ptm list
# AIエージェント向けJSON出力
npx ptm list --json
# doneアーカイブのタスク名まで表示
npx ptm list --all

# 実行中タスクをわきにどける
npx ptm stash

# stashされたタスクを復元する
npx ptm pop

# 実行中タスクを完了する
npx ptm done
```

`create` / `cycle` / `pop` は、対象ファイルのフルパスをクリップボードへコピーします。そのままAIへ貼り付けて指示できます（`pop` は復元したタスクの最新ファイル）。

# 概念
3つのファイルから構成されています。

## planファイル
- 指示を行うファイルで、タスクの内容が記述されています。
- ファイル名は`plan.[タスク名].[サイクル数].md`となります。
    - ex) plan.create-project.1.md

AIはタスクファイルを読んで、作業し、作業内容のレポートを同一のファイルへ書き込みます。

reviewファイルの後続で作成された場合は、レビューの結果を受けて改善する指示が書き込まれています。

## reviewファイル
- レビューを行うファイルで、レビューの内容が記述されています。
- ファイル名は`review.[タスク名].[サイクル数].md`となります。
    - ex) review.create-project.1.md

このファイルはplanファイルの後続`サイクル`で作成されます。planファイルを指し示していて、AIまたはユーザーはplanファイルの結果をレビューします。

## サイクル
AIの指示はplan/reviewサイクルを繰り返すことで実施されます。

---
# 開発者向け情報

## ビルド
```bash
# 開発中ビルド
npm run dev

# 本番ビルド
npm run build
```

## グローバルインストール検証

グローバルインストールが正しく動作するかを検証するスクリプトを用意しています：

```bash
node scripts/global-install-test.js
```

このスクリプトは以下を自動で行います：
1. `npm pack`でパッケージを生成
2. グローバルインストール
3. 全コマンドの動作テスト（create/cycle/stash/pop/done）
4. アンインストールとクリーンアップ

---
# トラブルシューティング

## グローバルインストール時のPATHエラー

```
'plsr-task' is not recognized as an internal or external command
```

**原因**: npmのグローバルbinディレクトリがPATHに含まれていない

**解決方法**:
```bash
# グローバルbinディレクトリを確認
npm config get prefix

# 表示されたパスをPATHに追加（Windowsは直下、Linux/macOSはbin配下）
```

## 権限エラー（Linux/macOS）

```
EACCES: permission denied
```

**解決方法**:
```bash
# オプション1: sudoを使用
sudo npm install -g plsr-taskmaster

# オプション2: npmのprefixを変更（推奨）
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
# ~/.bashrc または ~/.zshrc に追加:
# export PATH=~/.npm-global/bin:$PATH
```

## 古いキャッシュの問題

```bash
# npmキャッシュをクリア
npm cache clean --force

# 再インストール
npm uninstall -g plsr-taskmaster
npm install -g plsr-taskmaster

```

