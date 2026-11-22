/**
 * 操作の直後に「画面遷移が始まったか」を調べる。
 *
 * クリックで次のステップへ進んだとき、そのクリックでページが切り替わるなら、
 * 次のステップは新しい画面で表示するべきで、古い画面に出してはいけない。
 * そこで、操作の直後に短時間だけ遷移の開始を待ち、結果を返す。
 *
 *   'leaving'       … 別のページへの遷移が始まった（新しい画面で続きを表示する）
 *   'same-document' … ページを読み込み直さない遷移（SPA）。URL の変化で再判定される
 *   'none'          … 遷移は起きなかった（タブ切り替えなど、同じ画面での操作）
 */
(() => {
  const G = (globalThis.GuideExt ??= {});

  G.waitForNavigationStart = function waitForNavigationStart(graceMs) {
    return new Promise((resolve) => {
      const cleanups = [];
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        cleanups.forEach((c) => c());
        resolve(result);
      };
      const on = (target, type, fn) => {
        target.addEventListener(type, fn, true);
        cleanups.push(() => target.removeEventListener(type, fn, true));
      };

      // Navigation API（Chrome 102+）：リンク・フォーム送信・location の変更をすべて遷移開始の時点で通知する
      if (globalThis.navigation) {
        on(globalThis.navigation, 'navigate', (e) => finish(e.destination?.sameDocument ? 'same-document' : 'leaving'));
      }
      // 念のための補助（Navigation API で拾えない遷移向け）
      on(window, 'beforeunload', () => finish('leaving'));
      on(window, 'pagehide', () => finish('leaving'));

      const timer = setTimeout(() => finish('none'), graceMs);
      cleanups.push(() => clearTimeout(timer));
    });
  };
})();
