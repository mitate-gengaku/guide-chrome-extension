# 新人研修（Chrome 拡張機能）

業務Webシステムの画面の上に、操作手順のガイドを重ねて表示する Chrome 拡張機能です。
**ビルド不要**：このフォルダをそのまま Chrome に読み込めば動きます（Driver.jsをコピペしてます）。

| 機能                 | 内容                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| ガイド付きツアー     | JSON で書いた手順に沿って、画面の要素をハイライトしながら案内する                    |
| 操作待ちステップ     | 「次へ」ボタンではなく、入力・クリック・キー操作・画面遷移が実際に行われたら次へ進む |
| 練習モード           | 登録・送信などの操作を無効にする。本番環境でも安全に練習できる                       |
| ページをまたいだ再開 | 画面が切り替わっても、ツアーの続きから再開する                                       |

デモとして、Google 検索のツアーを2本入れています。

---

## 入れ方

1. このフォルダを `git clone`（または zip を展開）する
2. Chrome で `chrome://extensions` を開く
3. 右上の「デベロッパーモード」をオンにする
4. 「パッケージ化されていない拡張機能を読み込む」で、**このフォルダ（manifest.json があるフォルダ）** を選ぶ
5. <https://www.google.com/> を開くと、右下に「操作ガイド」ボタンが出る

## 更新したとき

ファイルを編集した、または `git pull` したら、`chrome://extensions` でこの拡張機能の **再読み込みボタン（↻）** を押し、対象のページも再読み込みします。
パネルの見出しにバージョン（`manifest.json` の `version`）が出るので、最新版になったかを確認できます。

> 会社の Chrome がポリシーでデベロッパーモードを禁止している場合は、この方法では読み込めません。

## 完了記録について

ツアーを最後まで終えると、一覧に「完了済み」と表示されます。
この記録は拡張機能専用の保存領域（`chrome.storage.local`）にツアーの `id` で保存されるため、**閲覧履歴の削除では消えません**。

- **ツアーごとに消す**：一覧の「完了済み」の横にある「記録を消す」を押す
- **すべて消す**：拡張機能を削除して入れ直す（再読み込み ↻ では消えません）
- ツアーの `id` を変えると、別のツアーとして未完了の扱いになります

---

## ファイル構成

```bash
manifest.json            拡張機能の設定（対象 URL・読み込むファイル）
background.js            ツアー定義（JSON）の読み込み担当
site/                    ★ サイト固有の部分（社内システムに差し替えるときに変更する場所）
├── config.js            パネルの見出し・待ち時間・読み込むツアーの一覧
└── tours/*.json         ツアー定義
content/                 共通の仕組み（基本的に変更不要）
├── url-match.js         URL・パスの照合（* と ? が使える）
├── schema.js            ツアー定義の検証（書き方の説明もこのファイルの先頭にある）
├── element-resolver.js  画面要素の探索（セレクタ → 予備セレクタ → テキストの順に探す）
├── practice-guard.js    練習モードでの操作のブロック
├── advance-watcher.js   操作待ちステップの完了条件の監視
├── progress-store.js    進捗の保存（ページ遷移をまたいで続きから再開するため）
├── tour-repository.js   ツアーの取得と検証
├── highlighter.js       ハイライトと吹き出しの表示（Driver.js）
├── tour-engine.js       ステップの進行・ページ遷移の追従・練習モードの管理
├── url-watcher.js       URL の変化の検知
├── panel.js             右下のパネル
└── main.js              起動処理（部品を組み立てるだけ）
styles/                  パネルと吹き出しの見た目
lib/driver.js/           ハイライト表示ライブラリ Driver.js v1.14.0（MIT ライセンス、無改変）
```

`content/` のファイルは `manifest.json` に書いた順番で読み込まれ、`GuideExt` という共通の入れ物を通じて機能を受け渡しています。
ファイルを追加したときは、`manifest.json` の `"js"` にも追記してください。

---

## 社内システムへの差し替え手順

### 1. 対象 URL を変える（`manifest.json`）

`"matches"` が **2か所**（`content_scripts` と `web_accessible_resources`）あるので、両方を書き換えます。

```json
"matches": ["https://erp.example.co.jp/*"]
```

### 2. 設定を変える（`site/config.js`）

```js
globalThis.GUIDE_SITE_CONFIG = {
  panelTitle: '受発注システム ガイド',
  elementTimeoutMs: 15000,       // 表示が遅い画面では長めにする
  tourFiles: [
    'site/tours/01-order-entry.json',
    'site/tours/02-order-search.json',
  ],
  remoteToursUrl: null,
};
```

### 3. ツアーを書く（`site/tours/*.json`）

JSON ファイルを置いて、**`site/config.js` の `tourFiles` にファイル名を追記**します（追記しないと読み込まれません）。
ツアーの `match` に書いた URL が、`manifest.json` の `"matches"` にも含まれている必要があります。
書き間違いがあると、パネルに「読み込めなかったツアーがあります」と、どのファイルのどの項目が悪いかが表示されます（ほかのツアーは動き続けます）。

```json
{
  "id": "order-entry",
  "title": "受注登録の基本",
  "description": "得意先を選んで受注を登録するまで",
  "match": ["https://erp.example.co.jp/*"],
  "startPage": "/orders/new",
  "mode": "practice",
  "blockRules": [
    { "selector": "#btn-register", "events": ["click"], "message": "練習モードのため登録されません" }
  ],
  "steps": [
    {
      "id": "customer",
      "page": "/orders/new",
      "target": { "selector": "#customerCode", "fallbacks": ["input[name='customer_cd']"], "text": "得意先" },
      "title": "得意先コードを入力",
      "content": "得意先コード（8桁）を入力します。",
      "advance": { "type": "input", "pattern": "^\\d{8}$" }
    },
    {
      "id": "register",
      "page": "/orders/new",
      "target": { "selector": "#btn-register" },
      "title": "登録する",
      "content": "内容を確認したら「登録」を押します。",
      "advance": { "type": "click" }
    }
  ]
}
```

#### 主な項目

| 項目              | 説明                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ |
| `match`           | ツアーを有効にする URL（`*` は任意の文字列）                                         |
| `startPage`       | 開始できる画面のパス。ほかの画面では「開始」ボタンが押せない                         |
| `mode`            | `guide`（通常）または `practice`（練習モード）                                       |
| `blockRules`      | 練習モードで無効にする操作。`events` は `click` / `submit` / `key:Enter` など        |
| `steps[].page`    | そのステップを表示する画面のパス。**画面ごとに必ず書く**（ページ遷移後の再開に使う） |
| `steps[].target`  | ハイライトする要素（下記）。省略すると画面中央に吹き出しだけを出す                   |
| `steps[].content` | 説明文。`<b>` や `<br>` が使える                                                     |
| `steps[].advance` | 次へ進む条件（下の表）。省略時は `next`                                              |

| `advance.type` | 次へ進むタイミング             | 追加の項目                             |
| -------------- | ------------------------------ | -------------------------------------- |
| `next`         | 吹き出しの「次へ」を押したとき | —                                      |
| `click`        | 対象をクリックしたとき         | `selector`（別の要素で判定したい場合） |
| `input`        | 対象に入力したとき             | `minLength`、`pattern`（正規表現）     |
| `key`          | 対象でキーを押したとき         | `key`（例: `"Enter"`）                 |
| `navigate`     | 画面のパスが一致したとき       | `path`（例: `"/orders/*/done"`）       |

練習モードでブロックされた操作も「操作した」とみなし、次のステップへ進みます。

#### `target` の書き方

| 書き方                                                        | 意味                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `{ "selector": "#login" }`                                    | セレクタに一致する要素                                                 |
| `{ "selector": "button", "text": "Log in" }`                  | セレクタに一致し、**その文字を含む**要素（「Log in」と書かれたボタン） |
| `{ "text": "Log in" }`                                        | その文字を含むボタン・リンクなど                                       |
| `{ "selector": "#login", "fallbacks": ["a[href='/enter']"] }` | 第一候補が見つからなければ予備を試す                                   |

`"selector": "button"` だけだと、画面で**最初に見つかったボタン**になります。ボタンが複数ある画面では `text` を併用してください。

> クリックで次に進めたいステップには `"advance": { "type": "click" }` を書いてください。
> 書かない場合は「次へ」ボタンで進む扱いになり、要素をクリックしても進みません。

### 4. セレクタの選び方（壊れにくくするコツ）

1. `id` や `name` 属性を使う（`#customerCode`、`input[name='customer_cd']`）
2. 次に `data-*` 属性や `aria-label`
3. 見た目用のクラス名は避ける（デザイン変更ですぐ変わる）
4. 自動生成された ID（`ti6dpd`、`ext-gen123` など）は使わない

`fallbacks` と `text` を書いておくと、第一候補が壊れても動き続けます。
予備の手段で見つかったときは、開発者ツールのコンソールに `fallback-used` と出るので、セレクタを直す目安になります。

### 5. （任意）ツアーを社内サーバーから配信する

拡張機能を配り直さずにツアーを更新したい場合は、`site/config.js` の `remoteToursUrl` に、ツアー定義の JSON 配列を返す URL を設定します。
あわせて `manifest.json` に `"host_permissions": ["https://そのサーバー/*"]` を追加してください。

---

## 既知の制限

- iframe の中の要素には未対応です
- ハイライトは `target` で指定した要素そのものに付きます。外枠ごと強調したい場合は親要素のセレクタを指定してください
- デモの Google 用セレクタは、Google 側の変更で動かなくなることがあります
