/**
 * 「操作待ちステップ」の完了条件を監視する。戻り値の関数を呼ぶと監視を解除する。
 * navigate 型はページ遷移を伴うため、ここではなくエンジン側（URL 監視）で扱う。
 */
(() => {
  const G = (globalThis.GuideExt ??= {});

  G.watchAdvance = function watchAdvance(advance, element, onSatisfied, guard) {
    const disposers = [];
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      onSatisfied();
    };
    const listen = (type, fn) => {
      // キャプチャで受けることで、ページ側が伝播を止めてもイベントを見逃さない
      window.addEventListener(type, fn, true);
      disposers.push(() => window.removeEventListener(type, fn, true));
    };
    const within = (t, el) => !!el && t instanceof Node && (el === t || el.contains(t));
    const clickTarget = () => (advance.type === 'click' && advance.selector ? document.querySelector(advance.selector) : element);

    switch (advance.type) {
      case 'click':
        listen('click', (e) => {
          if (within(e.target, clickTarget())) fire();
        });
        break;
      case 'input': {
        const re = advance.pattern ? new RegExp(advance.pattern) : null;
        const min = advance.minLength ?? 1;
        listen('input', (e) => {
          if (!within(e.target, element)) return;
          const value = e.target.value ?? '';
          if (value.length >= min && (!re || re.test(value))) fire();
        });
        break;
      }
      case 'key':
        listen('keydown', (e) => {
          if (!e.isComposing && e.key === advance.key && within(e.target, element)) fire();
        });
        break;
    }

    // 練習モードでブロックされた操作も「やってみた」とみなしてステップを進める
    if (guard) {
      disposers.push(
        guard.onBlocked((b) => {
          if (advance.type === 'click' && b.action === 'click') {
            const t = clickTarget();
            if (within(b.element, t) || within(t, b.element)) fire();
          }
          if (advance.type === 'key' && b.action === `key:${advance.key}`) fire();
        }),
      );
    }

    return () => disposers.forEach((d) => d());
  };
})();
