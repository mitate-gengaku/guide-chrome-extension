/**
 * ツアー定義の target から実際の画面要素を探す。
 * システム改修で第一候補のセレクタが壊れても、予備セレクタやテキストで見つけられるようにしている。
 */
(() => {
  const G = (globalThis.GuideExt ??= {});

  /** 画面に見えている要素か（同じ name の隠し要素がある画面への対策） */
  function isVisible(el) {
    if (typeof el.checkVisibility === 'function') return el.checkVisibility({ checkVisibilityCSS: true });
    const style = getComputedStyle(el);
    return !el.hidden && style.display !== 'none' && style.visibility !== 'hidden';
  }

  const TEXT_CANDIDATES = 'button, a, [role="button"], input[type="submit"], input[type="button"], label, h1, h2, h3, th, td, span';

  /** 要素の表示テキスト（ボタンの value や aria-label も含む） */
  function textOf(el) {
    return `${el.textContent ?? ''} ${el.value ?? ''} ${el.getAttribute('aria-label') ?? ''}`;
  }

  /**
   * selector に一致する要素のうち、見えていて（text 指定時は）その文字を含む最初の要素を返す。
   * 例: selector "button" + text "Log in" →「Log in」と書かれたボタン
   */
  function find(selector, text) {
    let nodes;
    try {
      nodes = document.querySelectorAll(selector);
    } catch {
      console.warn(`[guide] 不正なセレクタ: ${selector}`);
      return null;
    }
    for (const n of nodes) {
      if ((!text || textOf(n).includes(text)) && isVisible(n)) return n;
    }
    return null;
  }

  /**
   * 探す順番:
   *   1. selector（text があれば、その文字を含むものに絞る）
   *   2. fallbacks（同上）
   *   3. text だけで、ボタン・リンクなどから探す
   *      （selector がないとき、または textFallback: true のときだけ。短い文字は無関係な要素に一致しやすいため）
   * @param {{ allowFallback?: boolean }} options false なら、selector があるときは 1 だけで探す
   * @returns {{ element: Element, matchedBy: 'selector'|'fallback'|'text' } | null}
   */
  G.resolveTarget = function resolveTarget(target, { allowFallback = true } = {}) {
    const { selector, fallbacks = [], text, textFallback = false } = target;
    if (selector) {
      const el = find(selector, text);
      if (el) return { element: el, matchedBy: 'selector' };
    }
    if (selector && !allowFallback) return null;
    for (const fb of fallbacks) {
      const el = find(fb, text);
      if (el) return { element: el, matchedBy: 'fallback' };
    }
    if (text && (!selector || textFallback)) {
      const el = find(TEXT_CANDIDATES, text);
      // selector を書かずに text だけで指定した場合は、これが本来の探し方
      if (el) return { element: el, matchedBy: selector ? 'text' : 'selector' };
    }
    return null;
  };

  /** selector だけで探す時間。描画が遅れているだけのときに、予備で別の要素を選ばないようにする */
  G.FALLBACK_DELAY_MS = 1500;

  /** 要素が現れるまで待つ（遅れて描画される画面への対策）。見つからなければ null */
  G.waitForTarget = function waitForTarget(target, { timeoutMs, signal }) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const fallbackAfter = Math.min(G.FALLBACK_DELAY_MS, timeoutMs / 2);
      const resolveNow = () => G.resolveTarget(target, { allowFallback: Date.now() - startedAt >= fallbackAfter });
      const now = resolveNow();
      if (now) return resolve(now);

      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        observer.disconnect();
        clearTimeout(timer);
        clearInterval(poll);
        signal?.removeEventListener('abort', onAbort);
        resolve(r);
      };
      const check = () => {
        const r = resolveNow();
        if (r) finish(r);
      };
      const onAbort = () => finish(null);

      const observer = new MutationObserver(check);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      // CSS だけの表示切り替えは MutationObserver で拾えないことがあるため定期確認も併用
      const poll = setInterval(check, 300);
      const timer = setTimeout(() => finish(null), timeoutMs);
      signal?.addEventListener('abort', onAbort);
    });
  };
})();
