/**
 * ===== サイト固有の設定 =====
 * 社内の業務システムに差し替えるときは、このファイルと site/tours/*.json、
 * そして manifest.json の "matches"（2か所）を変更する。
 *
 * このファイルは content script と background の両方から読み込まれる。
 */
globalThis.GUIDE_SITE_CONFIG = {
  /** パネルの見出し */
  panelTitle: '新人研修',

  /** パネルのガイド一覧で、スクロールせずに表示する件数。これを超えるとスクロールになる */
  panelMaxVisibleTours: 2,

  /** 対象要素が現れるまで待つ最大時間（ミリ秒）。表示が遅い業務システムでは長めにする */
  elementTimeoutMs: 8000,

  /**
   * 読み込むツアー定義（拡張機能フォルダからの相対パス）。
   * ツアーを追加したら、ここにファイル名を追記する。一覧はこの順に並ぶ。
   */
  tourFiles: [
    'site/tours/01-google-search-basic.json',
    'site/tours/02-google-search-practice.json',
    'site/tours/03-wikipedia-search.json',
    'site/tours/04-wikipedia-history.json',
    'site/tours/05-wikipedia-random.json',
    'site/tours/06-wikipedia-diff.json',
  ],

  /**
   * （任意）社内サーバーからツアーを読み込む場合の URL。
   * JSON 配列を返す URL を指定すると、tourFiles に加えてこちらも読み込む。
   * 指定する場合は manifest.json に "host_permissions": ["https://そのサーバー/*"] を追加する。
   */
  remoteToursUrl: null,
};
