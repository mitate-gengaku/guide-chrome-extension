/**
 * 起動処理。部品を組み立ててエンジンとパネルを動かすだけで、ロジックは各ファイルにある。
 * （manifest.json の content_scripts で、このファイルが最後に読み込まれる）
 */
(async () => {
  const G = globalThis.GuideExt;
  const config = globalThis.GUIDE_SITE_CONFIG;

  const engine = new G.TourEngine({
    store: G.progressStore,
    highlighter: G.highlighter,
    guard: new G.PracticeGuard(),
    elementTimeoutMs: config.elementTimeoutMs,
    report: (e) => {
      // 今はコンソール出力のみ。将来は社内サーバーに送り、セレクタの劣化検知や進捗集計に使う
      (e.type === 'element-missing' ? console.warn : console.info)('[guide]', e);
    },
  });

  G.mountPanel(engine, {
    title: config.panelTitle,
    maxVisibleTours: config.panelMaxVisibleTours ?? 2,
  });
  const sync = (options) => engine.sync(options).catch((e) => console.warn('[guide] 進捗を同期できませんでした', e));
  G.watchUrl(() => engine.onUrlChange());

  try {
    const { tours, errors } = await G.loadTours();
    // init が終わるまで sync は何もしないので、先に登録しておく
    G.progressStore.onChange(() => sync());
    document.addEventListener('visibilitychange', () => sync());
    // 「戻る」でメモリから復元されたページでは、このファイルは再実行されない（bfcache）
    window.addEventListener('pageshow', (e) => e.persisted && sync({ force: true }));
    await engine.init(tours, errors);
    await sync(); // init の途中で起きた変化を取り込む
  } catch (e) {
    engine.fail(`ガイドを読み込めませんでした: ${e.message}`);
  }
})();
