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
  - 対象URL（`laws` / `elaws` の `/law/*`）判定
- 初期化時バッジ:
  - `highlightLevel` 保存値を反映したバッジ表示
  - legacy `decoratorEnabled=false` から `OFF` 表示への移行
  - `storage.get` が `null` / 非オブジェクトでも既定値にフォールバック
- `setBadgeForTab`:
  - 対象URL（有効レベル）表示
  - 対象URL（`OFF`）表示
  - 対象外URLでバッジ非表示
  - 同一状態連続更新時のスキップ
  - `setPopup` / `setBadgeText` / `setBadgeBackgroundColor` の同期例外と非同期例外の取り扱い
  - `No tab with id` とそれ以外のエラーを分けた処理
- ショートカット:
  - `toggle-decorator` でのレベル循環
  - storage 保存値更新（`highlightLevel` / `decoratorEnabled`）
- storage変更反映:
  - `highlightLevel` 変更反映
  - legacy `decoratorEnabled` 変更反映
  - 関係ないキー変更や `local` 以外の area を無視
- タブ/メッセージ連動:
  - `runtime.onInstalled` の install / update の分岐
  - `runtime.onStartup` での全タブ再評価
  - `tabs.onActivated` と `windows.onFocusChanged` でのアクティブタブ再評価
  - `tabs.onUpdated`（loading -> complete）で再描画
  - `tabs.onUpdated` の URL 更新で content 再同期メッセージ送信（対象/非対象の両方、同一URL重複送信は抑止）
  - `tabs.onUpdated` の URL 更新で e-Gov ドメイン外には再同期メッセージを送信しない
  - 受信者なしエラー時に同一URLの再同期を再試行できること
  - `runtime.onMessage`（content ready）で送信元タブ更新
  - `tabs.onRemoved` 後にキャッシュが残らないこと
- 耐障害性:
  - 閉じたタブに対する action API の `No tab with id` Promise reject を無視して未処理例外を回避
  - `No tab with id` 以外の Promise reject は `console.error` で処理
  - action API の非同期失敗確定前でも同一状態更新を再試行できることを検証
  - 同期 throw の `No tab with id` でもキャッシュ不整合が残らないことを検証
  - 不正な `highlightLevel` に対する既定値フォールバックとレベル循環を検証

### `content.test.js`

以下を網羅しています。

- 基本ハイライト分割:
  - 括弧部分のみ `span.egov-highlight` 化
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
  - `body` 直下まで辿った場合はクロスノード処理しないこと
- ノード収集条件:
  - `script/style` 除外
  - 既存 `.egov-highlight` 内除外
- 互換/安定化:
  - `getStoredHighlightLevel` の legacy マッピング
  - `storage.get` が `null` / 非オブジェクトでも既定値で初期化継続
  - `removeHighlightInRoot` 後の `normalize()` 実行（同一親は1回、複数親は親ごと）
  - `isDecoratorEnabled` の既定有効扱い
  - 非対象URLで `setHighlightLevel` が DOM を変更しないこと
  - `normalizeHighlightLevel` の範囲外値処理
  - `applyColorChanges` の局所反映
- ライフサイクルとイベント:
  - 初期化時の `MutationObserver` 開始条件
  - 対象外 URL への遷移時に observer を停止すること
  - `history.pushState` / `replaceState` による URL 変化イベント発火
  - `runtime.onMessage` の `egov-force-sync` で再同期すること
  - `storage.onChanged` の `highlightLevel` / legacy `decoratorEnabled` / 色変更の反映
  - `notifyContentReady` が runtime 不在や送信例外でも落ちないこと
- ハイライト適用ユーティリティ:
  - 空文字入力時の fragment 生成
  - テキストノード無しや括弧無しコンテナで安全に終了すること
  - 単一ノードと非クロスノード経路で括弧を置換すること
  - 既存 highlight を外して再適用すること
  - 開始直前に無効化された場合に observer 開始後処理を中断すること

現在の単体テスト件数は 91 件です（`npm test`）。

### `options.test.js`

以下を網羅しています。

- `loadSettings`:
  - 保存済み背景色/文字色の入力反映
  - `storage.get` が `null` / 非オブジェクトでもデフォルト色へフォールバック
- `saveSettings`:
  - storage保存
  - 保存ステータス表示とクリア
- `DOMContentLoaded` 後イベント:
  - submit で現在入力値保存
  - reset でデフォルト色保存

## Residual Gaps

単体テストとしては主要ロジックを網羅していますが、次は未カバーです。

- 実ブラウザ上の統合挙動（実DOM/CSSでの最終描画）
- 同一ドキュメント遷移（検索結果↔法令詳細）時の URL 監視と有効/無効切替の統合挙動
- ネイティブカラーピッカーUIのOS/ブラウザ差
- 大規模ページでの体感性能や描画ちらつき

必要なら別途 E2E / 手動確認チェックリストで補完します。

## Run

```bash
npm test
```

```bash
npm run check
```

```bash
npm run coverage
```
