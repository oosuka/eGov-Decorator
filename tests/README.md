# Tests README

## Role

この `tests/README.md` は、次の2点を目的にします。

1. `tests/` 配下の各テストファイルが何を担保しているかを明確化する
2. 既存テストの網羅範囲と、未カバー領域（残課題）を把握しやすくする

実装詳細ではなく、テスト観点と責務のインデックスとして扱います。

## Scope

- テストランナー: `node --test`
- 対象:
  - `tests/background.test.js`
  - `tests/content.test.js`
  - `tests/options.test.js`

## Coverage Map

### `background.test.js`

以下を網羅しています。

- `isTargetUrl`:
  - 対象URL（`laws` / `elaws`）判定
- 初期化時バッジ:
  - `highlightLevel` 保存値を反映したバッジ表示
  - legacy `decoratorEnabled=false` から `OFF` 表示への移行
- `setBadgeForTab`:
  - 対象URL（有効レベル）表示
  - 対象URL（`OFF`）表示
  - 対象外URLでバッジ非表示
  - 同一状態連続更新時のスキップ
- ショートカット:
  - `toggle-decorator` でのレベル循環
  - storage 保存値更新（`highlightLevel` / `decoratorEnabled`）
- storage変更反映:
  - `highlightLevel` 変更反映
  - legacy `decoratorEnabled` 変更反映
- タブ/メッセージ連動:
  - `tabs.onUpdated`（loading -> complete）で再描画
  - `runtime.onMessage`（content ready）で送信元タブ更新
- 耐障害性:
  - 閉じたタブに対する action API の `No tab with id` Promise reject を無視して未処理例外を回避

### `content.test.js`

以下を網羅しています。

- 基本ハイライト分割:
  - 括弧部分のみ `span.highlight` 化
  - ネスト括弧を1塊として扱う
- レベル別挙動:
  - H2相当（2階層目以降）
  - H3相当（3階層目以降）
  - 深さ1〜5（`minDepth=1..5`）の期待範囲検証
- ノードまたぎ処理:
  - 安全コンテナ内での深さ持ち越し（例: `（` + `<a>...</a>` + `...）`）
  - 安全コンテナが見つからない場合はクロスノード処理を行わないこと
  - 閉じ括弧で深さが戻ること
  - 安全コンテナ内でも未閉じ `（` はハイライトされないこと
  - 未対応の閉じ括弧 `）` はハイライトされないこと
- 安全ガード付きハイブリッド:
  - `table/tr/td/th` 配下でクロスノード持ち越ししないこと
  - table 配下で未閉じ `（` をハイライトしないこと
  - `getCrossNodeContainer` の安全/危険タグ判定
- ノード収集条件:
  - `script/style` 除外
  - 既存 `.highlight` 内除外
- 互換/安定化:
  - `getStoredHighlightLevel` の legacy マッピング
  - `removeHighlightInRoot` 後の `normalize()` 実行（同一親は1回、複数親は親ごと）
  - `isDecoratorEnabled` の既定有効扱い

現在の単体テスト件数は 36 件です（`npm run test`）。

### `options.test.js`

以下を網羅しています。

- `loadSettings`:
  - 保存済み背景色/文字色の入力反映
- `saveSettings`:
  - storage保存
  - 保存ステータス表示とクリア
- `DOMContentLoaded` 後イベント:
  - submit で現在入力値保存
  - reset でデフォルト色保存

## Residual Gaps

単体テストとしては主要ロジックを網羅していますが、次は未カバーです。

- 実ブラウザ上の統合挙動（実DOM/CSSでの最終描画）
- ネイティブカラーピッカーUIのOS/ブラウザ差
- 大規模ページでの体感性能や描画ちらつき

必要なら別途 E2E / 手動確認チェックリストで補完します。

## Run

```bash
npm run test
```

```bash
npm run lint
```
