# コマンドリファレンス

`plsr-task`（短縮形: `ptm`）の全コマンドの説明です。

## コマンド一覧

| コマンド | エイリアス | 説明 |
|---------|-----------|------|
| `create [taskName]` | - | タスクを作成する |
| `cycle` | - | plan/reviewサイクルを進める |
| `list` | `ls`, `status` | タスク一覧とサイクル状態を表示する |
| `stash` | - | 実行中タスクをわきにどける |
| `pop` | - | stashされたタスクを復元する |
| `done` | - | 実行中タスクを完了する |
| `guide` | - | AIエージェント向けセットアップガイドを表示する |

---

## create

```bash
ptm create [taskName]   # taskName省略時は "task"
```

`plan.<taskName>.1.md` を作成します。

- **実行中タスクがない場合**: タスクディレクトリ直下に作成され、すぐに着手できる状態になります。
- **実行中タスクがある場合**: 実行中タスクを邪魔しないよう、`stash/<taskName>/` に作成されます。着手するときは `ptm pop -t <taskName>` で取り出してください（このとき実行中タスクは自動でstashされ入れ替わります）。

エラーになるケース:
- 同名のタスクが実行中（`already in progress`）
- 作成先に同名のplanファイルが既に存在（`already exists`）

plan雛形は設定でカスタマイズできます（[configuration.md](configuration.md) 参照）。

## cycle

```bash
ptm cycle
```

最後に更新されたタスクファイルからタスクを特定し、plan/reviewサイクルを1段階進めます。

- 最新planに対応するreviewがない → `review.<taskName>.<N>.md` を作成
- plan数とreview数が揃っている → `plan.<taskName>.<N+1>.md` を作成

生成されるファイルには、過去サイクルのファイルへの参照と記入指示が含まれます。

## list

```bash
ptm list           # 人間向けカラー表示
ptm ls             # エイリアス
ptm status         # エイリアス
ptm list --json    # AIエージェント向けJSON出力
ptm list --all     # doneアーカイブのタスク名まで表示
```

実行中タスク・stash・doneアーカイブの一覧とサイクル状態を表示します。

```
Tasks in: tasks

Active (1):
  ● taskA   cycle 2   next: run      (plan:2 review:1)

Stash (1):
  ○ taskB   cycle 1   next: review   (plan:1 review:1)

Done (1 archives, 1 tasks):
  done.2026-07-16   1 task(s)
```

`next` の意味:

| 表示 | 意味 |
|------|------|
| `next: run` | 最新のplanが未実行（対応するreviewがない）。実行してください |
| `next: review` | reviewファイルが作成済み。レビュー所見を記入してください |

`--json` の出力例:

```json
{
  "taskDir": "tasks",
  "active": [
    { "taskName": "taskA", "cycle": 2, "nextAction": "run", "planCount": 2, "reviewCount": 1 }
  ],
  "stash": [],
  "done": [
    { "date": "2026-07-16", "count": 1 }
  ]
}
```

- タスクディレクトリが存在しない場合もエラーにならず、空の結果を返します（AIがcreate前の状態確認に使えるように）。
- `--json --all` を併用すると、doneの各エントリに `taskNames` 配列が含まれます。
- plan/reviewファイルを1つも持たない壊れたstashディレクトリは一覧から除外され、人間向け表示でのみ `(invalid stash: <name>)` と警告されます。

## stash

```bash
ptm stash
```

実行中の全タスクを `stash/<taskName>/` に退避します。

## pop

```bash
ptm pop                    # リスト選択で復元するタスクを選ぶ
ptm pop -t <taskName>      # タスク名を指定して復元（非対話・スクリプト向け）
```

stashされたタスクをタスクディレクトリに復元します。

- タスク名を指定しない場合、stashが1件だけでも**必ずリスト選択**を挟みます（誤popの防止）。CIやスクリプトから使う場合は `-t` を指定してください。
- 復元時に実行中タスクがある場合、そのタスクは自動でstashに退避されます（pop対象自身は除外され、既存stashは上書きされません）。

## done

```bash
ptm done
```

実行中の全タスクを `done.<yyyy-MM-dd>/<taskName>/` にアーカイブします。

## guide

```bash
ptm guide             # セットアップガイドを表示
ptm guide --install   # task-cycleスキルを ~/.claude/skills/task-cycle/ にインストール
```

AIエージェント（Claude Code等）と連携するためのセットアップガイドを表示します。詳細はガイド出力を参照してください。
