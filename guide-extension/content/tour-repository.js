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
    const sourceOf = new Map(); // ツアーID → 読み込んだファイル（重複の検出用）
    for (const { source, data } of res?.sources ?? []) {
      try {
        const tour = G.parseTour(data, source);
        // 同じ ID のツアーが2つあると、開始するツアーや完了記録が混ざるため、後から読んだ方を外す
        if (sourceOf.has(tour.id)) {
          errors.push(
            `ツアーIDが重複しています (${source}):\n  - id "${tour.id}" は ${sourceOf.get(tour.id)} でも使われています。別の id にしてください`,
          );
          continue;
        }
        sourceOf.set(tour.id, source);
        tours.push(tour);
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
