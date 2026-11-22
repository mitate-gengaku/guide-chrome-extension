/**
 * 画面のハイライトと吹き出しの表示（Driver.js を使用）。
 * ステップの進行はエンジンが管理し、ここは「1ステップ分の表示」だけを担当する。
 * 別のライブラリに替える場合は、show / notify / hide の3つを同じ形で実装すればよい。
 */
(() => {
  const G = (globalThis.GuideExt ??= {});
  const createDriver = globalThis.driver.js.driver;

  let drv = null;

  G.highlighter = {
    /**
     * @param {{ element?: Element, title: string, description: string, side?: string,
     *   progressText: string, showNext: boolean, showPrevious: boolean, nextLabel: string,
     *   instruction?: string, onNext: Function, onPrevious: Function, onClose: Function }} req
     */
    show(req) {
      this.hide();
      drv = createDriver({
        animate: true,
        allowKeyboardControl: false, // 矢印キーで操作待ちステップを飛ばさないよう無効化
        overlayClickBehavior: 'none', // 暗い部分をクリックしてもガイドを閉じない
        // 吹き出しにフォーカスを移さない。移すと、フォーカスが外れたら閉じるメニュー（ドロップダウン）が
        // 吹き出しの表示と同時に閉じてしまい、利用者が操作できなくなるため
        focus: 'none',
        allowClose: true,
        stagePadding: 6,
        stageRadius: 6,
        popoverClass: 'guide-ext-popover',
      });

      const buttons = ['close'];
      if (req.showPrevious) buttons.push('previous');
      if (req.showNext) buttons.push('next');

      drv.highlight({
        element: req.element,
        disableActiveInteraction: false, // ハイライトした要素は操作できるままにする
        popover: {
          title: req.title,
          description: req.description,
          side: req.side,
          showButtons: buttons,
          showProgress: true,
          progressText: req.progressText,
          nextBtnText: req.nextLabel,
          doneBtnText: req.nextLabel,
          prevBtnText: '戻る',
          closeBtnLabel: 'ガイドを閉じる',
          instruction: req.instruction,
          onNextClick: () => req.onNext(),
          onDoneClick: () => req.onNext(),
          onPrevClick: () => req.onPrevious(),
          onCloseClick: () => req.onClose(),
        },
      });
    },

    /** 吹き出しに一時的なメッセージを出す（練習モードでブロックしたときなど） */
    notify(message) {
      drv?.nudge(message);
    },

    hide() {
      if (drv) {
        const d = drv;
        drv = null;
        d.destroy();
      }
    },
  };
})();
