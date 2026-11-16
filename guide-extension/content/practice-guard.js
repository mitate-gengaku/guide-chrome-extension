/**
 * 練習モード：指定した操作（登録ボタンのクリック、フォーム送信、Enter キーなど）を
 * ページ側のスクリプトより先に横取りして無効化する。
 * window のキャプチャ段階で最初に受け取るため、業務システム側の処理には届かない。
 */
(() => {
  const G = (globalThis.GuideExt ??= {});

  G.PracticeGuard = class PracticeGuard {
    #rules = [];
    #listeners = new Set();
    #attached = false;

    enable(rules) {
      this.#rules = rules;
      if (!this.#attached && rules.length > 0) {
        window.addEventListener('click', this.#onClick, true);
        window.addEventListener('submit', this.#onSubmit, true);
        window.addEventListener('keydown', this.#onKeyDown, true);
        this.#attached = true;
      }
    }

    disable() {
      this.#rules = [];
      if (this.#attached) {
        window.removeEventListener('click', this.#onClick, true);
        window.removeEventListener('submit', this.#onSubmit, true);
        window.removeEventListener('keydown', this.#onKeyDown, true);
        this.#attached = false;
      }
    }

    /** ブロックしたときに呼ばれる関数を登録する。戻り値を呼ぶと解除 */
    onBlocked(cb) {
      this.#listeners.add(cb);
      return () => this.#listeners.delete(cb);
    }

    #match(target, action) {
      if (!(target instanceof Element)) return null;
      for (const rule of this.#rules) {
        if (!rule.events.includes(action)) continue;
        const el = target.closest(rule.selector);
        if (el) return { rule, element: el };
      }
      return null;
    }

    #block(e, action) {
      const hit = this.#match(e.target, action);
      if (!hit) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      for (const cb of this.#listeners) cb({ ...hit, action });
    }

    #onClick = (e) => this.#block(e, 'click');
    #onSubmit = (e) => this.#block(e, 'submit');
    #onKeyDown = (e) => {
      if (e.isComposing) return; // IME 変換確定の Enter はブロックしない（日本語入力対策）
      this.#block(e, `key:${e.key}`);
    };
  };
})();
