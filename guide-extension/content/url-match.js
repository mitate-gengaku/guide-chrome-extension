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
  /** URL からクエリ・ハッシュを除いた比較用文字列 */
  G.urlWithoutQuery = (url) => `${url.origin}${url.pathname}`;
})();
