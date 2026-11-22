/**
 * glob 形式の URL / パス照合。
 *   *  … "/" を含む任意の文字列
 *   ?  … 任意の1文字
 * 例: "https://www.google.com/*", "/search*", "/orders/?/edit"
 */
(() => {
  const G = (globalThis.GuideExt ??= {});

  function globToRegExp(glob) {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  }

  G.matchGlob = (glob, value) => globToRegExp(glob).test(value);
  G.matchAny = (globs, value) => globs.some((g) => G.matchGlob(g, value));
  /**
   * URL の「?」以降（クエリ）の判定。指定したすべてのキーが一致すれば true。
   * 値は glob で比較する（"*" なら「そのキーがあれば何でもよい」）。
   * 例: { "screen": "order" } は main.exe?screen=order&id=5 に一致する
   */
  G.matchQuery = (query, url) =>
    Object.entries(query).every(([key, pattern]) => {
      const actual = url.searchParams.get(key);
      return actual !== null && G.matchGlob(pattern, actual);
    });

  /** パス（glob）とクエリの両方で画面を判定する。省略した方は条件にしない */
  G.matchPage = (path, query, url) =>
    (!path || G.matchGlob(path, url.pathname)) && (!query || G.matchQuery(query, url));

  /** URL からクエリ・ハッシュを除いた比較用文字列 */
  G.urlWithoutQuery = (url) => `${url.origin}${url.pathname}`;
})();
