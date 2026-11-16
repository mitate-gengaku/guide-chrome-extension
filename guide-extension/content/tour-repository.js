/**
 * ツアー定義の取得。読み込み自体は background.js が行い、ここで検証する。
 * 定義に間違いがあるツアーは、そのツアーだけ除外してエラーとして返す（ほかのツアーは動く）。
 */
(() => {
  const G = (globalThis.GuideExt ??= {});

  G.loadTours = async function loadTours() {
    const res = await chrome.runtime.sendMessage({ type: 'guide:loadTours' });
    const errors = [...(res?.errors ?? [])];
    const tours = [];
    for (const { source, data } of res?.sources ?? []) {
      try {
        tours.push(G.parseTour(data, source));
      } catch (e) {
        errors.push(e.message);
      }
    }
    errors.forEach((e) => console.error('[guide]', e));
    return { tours, errors };
  };

  /** 現在の URL で使えるツアーに絞り込む */
  G.toursForUrl = (tours, url) => tours.filter((t) => G.matchAny(t.match, G.urlWithoutQuery(url)));
})();
