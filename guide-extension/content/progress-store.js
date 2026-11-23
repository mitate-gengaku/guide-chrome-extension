/**
 * ツアーの進捗（どのツアーの何ステップ目か）を chrome.storage に保存する。
 * ページ遷移をまたいでツアーを続けるために必要。
 * 将来、進捗を集計したい場合は、ここで社内サーバーにも送るようにする。
 */
(() => {
  const G = (globalThis.GuideExt ??= {});
  const KEY_ACTIVE = 'guide.activeTour';
  const KEY_DONE = 'guide.completedTours';
  const area = chrome.storage.local;

  G.progressStore = {
    /** @returns {Promise<{tourId: string, stepIndex: number, startedAt: number} | null>} */
    async load() {
      const r = await area.get(KEY_ACTIVE);
      return r[KEY_ACTIVE] ?? null;
    },
    /** 進捗・完了記録が（ほかのタブも含めて）変わったときに呼ばれる関数を登録する */
    onChange(cb) {
      area.onChanged.addListener((changes) => {
        if (KEY_ACTIVE in changes || KEY_DONE in changes) cb();
      });
    },
    async save(progress) {
      await area.set({ [KEY_ACTIVE]: progress });
    },
    async clear() {
      await area.remove(KEY_ACTIVE);
    },
    async markCompleted(tourId) {
      const done = new Set(await this.completedTourIds());
      done.add(tourId);
      await area.set({ [KEY_DONE]: [...done] });
    },
    /** 指定したツアーの完了記録を消す（ツアーを未完了の状態に戻す） */
    async unmarkCompleted(tourId) {
      const done = (await this.completedTourIds()).filter((id) => id !== tourId);
      await area.set({ [KEY_DONE]: done });
    },
    async completedTourIds() {
      const r = await area.get(KEY_DONE);
      return r[KEY_DONE] ?? [];
    },
  };
})();
