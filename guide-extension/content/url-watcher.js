/**
 * URL の変化を検知する。画面を再読み込みしない遷移（SPA）にも対応するため、定期的に確認する。
 */
(() => {
  const G = (globalThis.GuideExt ??= {});

  G.watchUrl = function watchUrl(onChange, intervalMs = 400) {
    let last = location.href;
    const check = () => {
      if (location.href !== last) {
        last = location.href;
        onChange(new URL(last));
      }
    };
    const timer = setInterval(check, intervalMs);
    window.addEventListener('popstate', check);
    window.addEventListener('hashchange', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('popstate', check);
      window.removeEventListener('hashchange', check);
    };
  };
})();
