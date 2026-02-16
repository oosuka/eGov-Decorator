# e-Gov Decorator

e-Gov 法令ページ内の全角括弧 `（...）` をハイライト表示する Chromium 系ブラウザ拡張です。  
対応ブラウザは Chrome / Microsoft Edge です。

- 対象URL:
  - `https://laws.e-gov.go.jp/*`
  - `https://elaws.e-gov.go.jp/*`

## 主な機能

1. 対象ページ内の全角括弧 `（...）` をハイライト表示
2. ショートカットで ON/OFF 切り替え（既定: Windows `Ctrl+Shift+X` / macOS `Command+Shift+X`）
3. 拡張アイコンのバッジで状態表示
4. 対象ページで拡張アイコンクリック時に色設定ポップアップを表示

## バッジ表示仕様

- 対象ページかつ ON: `ON`（赤背景）
- 対象ページかつ OFF: `OFF`（緑背景）
- 対象外ページ: 表示なし

補足:
- バッジが見えない場合は、ツールバーで拡張をピン留めしてください。

## 使い方

### 1. インストール（Chrome）

1. `chrome://extensions` を開く
2. 右上の「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このリポジトリのフォルダを選択

### 2. インストール（Edge）

1. `edge://extensions` を開く
2. 左メニューの「開発者モード」を ON
3. 「展開して読み込み」をクリック
4. このリポジトリのフォルダを選択

更新時は拡張機能一覧で「更新」または対象拡張の再読み込みを実行してください。

### 3. 色設定（ポップアップ）

1. ツールバーの `e-Gov Decorator` アイコンをクリック
2. 背景色・文字色を選択して「保存」
3. 「デフォルトに戻す」で既定値に戻す

右クリックメニューの「オプション」は使用しない構成です。
対象外ページではアイコンをクリックしてもポップアップは開きません。

### 4. ON/OFF 切り替え

- 既定ショートカット:
  - Windows / Linux: `Ctrl+Shift+X`
  - macOS: `Command+Shift+X`
- キー変更:
  - Chrome: `chrome://extensions/shortcuts`
  - Edge: `edge://extensions/shortcuts`
- 既存インストール環境では、ショートカット割り当てが自動で切り替わらない場合があります。その場合はショートカット設定画面で一度手動設定してください。

ショートカットが効かない場合:

1. `chrome://extensions/shortcuts` または `edge://extensions/shortcuts` で割り当てを確認
2. 既定値に戻らない場合は拡張を一度削除して再インストール

## 設定の保存と反映

- 保存先は `chrome.storage.local`
- 保存項目:
  - `decoratorEnabled`（ON/OFF）
  - `highlightBgColor`
  - `highlightTextColor`
- `storage` の変更検知で全タブへ状態を反映
- タブ切り替え・URL変更・起動時にバッジ状態を再評価

## 既定値

- 背景色: `#e6e6e6`
- 文字色: `#ffffff`
- 初回インストール時 ON

## 確認チェック（Windows Chrome / Edge）

1. ツールバーで `e-Gov Decorator` をピン留め
2. `https://laws.e-gov.go.jp/` または `https://elaws.e-gov.go.jp/` を開く
3. 全角括弧 `（...）` がハイライトされることを確認
4. バッジが `ON`（赤）で表示されることを確認
5. Windowsは `Ctrl+Shift+X`、macOSは `Command+Shift+X` で OFF にし、バッジが `OFF`（緑）になることを確認
6. 対象外ページでバッジが消えることを確認
7. ポップアップで色変更し、即時反映されることを確認
8. 再読み込み後も ON/OFF と色設定が維持されることを確認

## 実装メモ

- `background.js`: ショートカット処理、バッジ更新、タブ/ウィンドウイベント監視
- `content.js`: ハイライト適用、DOM 変化追従（`MutationObserver`）
- `popup.html` + `options.js` + `options.css`: 色設定 UI

## セキュリティ

- 本拡張は外部サーバーへの送信機能（API連携、アップロード、Webhook等）を実装していません。
- 保存データは `chrome.storage.local` 内の設定値（ON/OFF、色設定）のみです。
- 権限は `storage` と `tabs` のみを使用し、対象外のサイトには動作しません。
- 処理内容は対象URL上の表示装飾（ハイライト）に限定され、業務データの収集や外部転送は行いません。
