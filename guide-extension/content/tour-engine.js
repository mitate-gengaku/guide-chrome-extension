/**
 * ツアーエンジン：ステップの進行・ページ遷移の追従・練習モードを管理する。
 * パネル（panel.js）は subscribe() で状態を受け取って描画するだけで、進行のロジックはここに集約する。
 *
 * 状態（status）:
 *   loading / idle（未実行）/ running（表示中）/ waiting-page（次のステップは別の画面）
 *   element-missing（対象が見つからない）/ transition（操作の直後、画面遷移を待っている）
 *   completed（完了直後）/ error（読み込み失敗）
 */
(() => {
  const G = (globalThis.GuideExt ??= {});

  /** クリック・キー操作のあと、画面遷移が始まるかを待つ時間（ミリ秒） */
  const NAV_GRACE_MS = 400;
  /** 遷移が始まったのにページが切り替わらなかった場合（取り消し等）に、元の画面で表示し直すまでの時間 */
  const LEAVE_FALLBACK_MS = 5000;

  const INSTRUCTIONS = {
    click: () => 'クリックすると次に進みます',
    input: () => '入力すると次に進みます',
    key: (a) => `${a.key} キーを押すと次に進みます`,
    navigate: () => '画面が切り替わると次に進みます',
  };

  G.TourEngine = class TourEngine {
    #state = {
      status: 'loading',
      availableTours: [],
      completedTourIds: [],
      tour: null,
      stepIndex: 0,
      message: null, // パネルに出す説明（待機理由・エラー内容など）
      toast: null, // 一時的な通知 { message, at }
      loadErrors: [],
      loadedTours: [], // 読み込めたすべてのツアー（この画面で使えない理由の表示用）
    };
    #listeners = new Set();
    #allTours = [];
    #startedAt = 0;
    #stepCtrl = null;
    #stepDisposers = [];

    /**
     * @param {{ store, highlighter, guard, elementTimeoutMs: number, report?: Function }} deps
     */
    constructor(deps) {
      this.deps = deps;
      deps.guard.onBlocked(({ rule }) => {
        deps.highlighter.notify(rule.message);
        this.#patch({ toast: { message: rule.message, at: Date.now() } });
      });
    }

    getState = () => this.#state;
    subscribe = (fn) => {
      this.#listeners.add(fn);
      return () => this.#listeners.delete(fn);
    };

    // ---- 公開操作 ----

    async init(tours, loadErrors = []) {
      this.#allTours = tours;
      const [progress, completed] = await Promise.all([this.deps.store.load(), this.deps.store.completedTourIds()]);
      this.#patch({ availableTours: G.toursForUrl(tours, this.#url()), completedTourIds: completed, loadErrors, loadedTours: tours });

      const tour = progress && tours.find((t) => t.id === progress.tourId);
      if (tour) {
        this.#startedAt = progress.startedAt;
        this.#patch({ tour, stepIndex: progress.stepIndex });
        await this.#evaluate();
      } else {
        if (progress) await this.deps.store.clear(); // 定義が消えたツアーの進捗は破棄
        this.#patch({ status: 'idle' });
      }
    }

    fail(message) {
      this.#patch({ status: 'error', message });
    }

    async start(tourId) {
      const tour = this.#allTours.find((t) => t.id === tourId);
      if (!tour) return;
      this.#startedAt = Date.now();
      this.#patch({ tour, stepIndex: 0, message: null });
      await this.#persist();
      await this.#evaluate();
    }

    next = () => this.#goTo(this.#state.stepIndex + 1);
    previous = () => (this.#state.stepIndex > 0 ? this.#goTo(this.#state.stepIndex - 1) : undefined);
    skip = () => this.next();
    retry = () => this.#evaluate();

    abort = async () => {
      this.#teardownStep();
      this.deps.guard.disable();
      await this.deps.store.clear();
      this.#patch({ status: 'idle', tour: null, stepIndex: 0, message: null });
    };

    /** ツアーの完了記録を消す */
    resetCompletion = async (tourId) => {
      await this.deps.store.unmarkCompleted(tourId);
      this.#patch({ completedTourIds: await this.deps.store.completedTourIds() });
    };

    /**
     * 操作待ちステップの条件を満たしたときの処理。
     * クリックやキー操作は画面遷移を起こすことがあるため、次のステップをすぐには表示しない。
     * 進捗だけ先に保存し、遷移が始まったら新しい画面に任せ、始まらなければこの画面で表示する。
     */
    #advanceFromAction = async (advanceType) => {
      if (advanceType !== 'click' && advanceType !== 'key') return this.next();
      const { tour, stepIndex } = this.#state;
      if (!tour) return;
      const nextIndex = stepIndex + 1;

      this.#teardownStep(); // 古い吹き出しはすぐ消す
      if (nextIndex >= tour.steps.length) return this.#complete(tour);

      // ページが切り替わっても続きから表示できるよう、遷移が始まる前に進捗を保存する
      this.#patch({ stepIndex: nextIndex, status: 'transition', message: null });
      const saved = this.#persist();
      const nav = await G.waitForNavigationStart(NAV_GRACE_MS);
      await saved;

      const stillHere = () => this.#state.tour?.id === tour.id && this.#state.stepIndex === nextIndex;
      if (!stillHere()) return; // 待っている間に中断・別の操作があった

      if (nav === 'leaving') {
        // 通常は新しい画面が開いてこのページは消える。消えなかったとき（遷移の取り消しなど）だけ、ここで表示する
        await new Promise((r) => setTimeout(r, LEAVE_FALLBACK_MS));
        if (!stillHere() || this.#state.status !== 'transition') return;
      }
      await this.#evaluate();
    };

    /** URL が変わったとき（通常の遷移・SPA の遷移の両方）に呼ぶ */
    async onUrlChange() {
      this.#patch({ availableTours: G.toursForUrl(this.#allTours, this.#url()) });
      if (this.#state.tour) await this.#evaluate();
    }

    // ---- 内部処理 ----

    #url() {
      return new URL(location.href);
    }

    /** ステップを表示する画面か（page と pageQuery の両方で判定） */
    #pageMatches(step) {
      return !step || G.matchPage(step.page, step.pageQuery, this.#url());
    }

    /** 画面遷移待ちのステップで、すでに遷移先にいるか */
    #alreadyNavigated(step) {
      return step?.advance.type === 'navigate' && G.matchPage(step.advance.path, step.advance.query, this.#url());
    }

    /** skipIf の条件（書かれたものすべて）を満たしているか */
    #shouldSkip(step) {
      const cond = step?.skipIf;
      if (!cond) return false;
      if ((cond.page || cond.query) && !G.matchPage(cond.page, cond.query, this.#url())) return false;
      if (cond.exists && !G.resolveTarget(cond.exists)) return false;
      return true;
    }

    async #goTo(index) {
      const { tour } = this.#state;
      if (!tour) return;
      if (index >= tour.steps.length) return this.#complete(tour);
      this.#patch({ stepIndex: index, message: null });
      await this.#persist();
      await this.#evaluate();
    }

    async #complete(tour) {
      this.#teardownStep();
      this.deps.guard.disable();
      await this.deps.store.clear();
      await this.deps.store.markCompleted(tour.id);
      this.deps.report?.({ type: 'tour-completed', tourId: tour.id, durationMs: Date.now() - this.#startedAt });
      this.#patch({
        status: 'completed',
        tour: null,
        stepIndex: 0,
        completedTourIds: await this.deps.store.completedTourIds(),
        message: `「${tour.title}」を完了しました`,
      });
    }

    #persist() {
      const { tour, stepIndex } = this.#state;
      return tour ? this.deps.store.save({ tourId: tour.id, stepIndex, startedAt: this.#startedAt }) : Promise.resolve();
    }

    /** 現在のステップをこの画面で表示できるかを判断し、表示 or 待機する */
    async #evaluate() {
      const { tour, stepIndex } = this.#state;
      if (!tour) return;
      const step = tour.steps[stepIndex];
      if (!step) return this.#complete(tour);

      if (tour.mode === 'practice') this.deps.guard.enable(tour.blockRules);

      // 画面遷移待ちのステップで、すでに遷移先にいれば完了扱い
      if (this.#alreadyNavigated(step)) {
        return this.#goTo(stepIndex + 1);
      }

      // skipIf の条件を満たしていれば（もう済んでいる操作なら）飛ばす
      if (this.#shouldSkip(step)) {
        this.deps.report?.({ type: 'step-skipped', tourId: tour.id, stepId: step.id });
        return this.#goTo(stepIndex + 1);
      }

      if (!this.#pageMatches(step)) {
        this.#teardownStep();
        this.#patch({
          status: 'waiting-page',
          message: `次のステップ「${step.title}」は別の画面で表示されます。該当の画面に移動してください。`,
        });
        return;
      }

      await this.#runStep(tour, stepIndex, step);
    }

    async #runStep(tour, index, step) {
      this.#teardownStep();
      const ctrl = new AbortController();
      this.#stepCtrl = ctrl;
      this.#patch({ status: 'running', message: null });

      let element;
      if (step.target) {
        const found = await G.waitForTarget(step.target, { timeoutMs: this.deps.elementTimeoutMs, signal: ctrl.signal });
        if (ctrl.signal.aborted) return; // 待っている間に別のステップへ移った
        if (!found) {
          this.deps.report?.({ type: 'element-missing', tourId: tour.id, stepId: step.id, url: location.href });
          this.deps.highlighter.hide();
          this.#patch({
            status: 'element-missing',
            message: `「${step.title}」の対象が画面上に見つかりません。画面の表示を確認して「再試行」するか、このステップをスキップしてください。`,
          });
          return;
        }
        if (found.matchedBy !== 'selector') {
          this.deps.report?.({ type: 'fallback-used', tourId: tour.id, stepId: step.id, matchedBy: found.matchedBy });
        }
        element = found.element;
      }

      const prev = tour.steps[index - 1];
      const waitsForAction = step.advance.type !== 'next';
      let current = element; // 今ハイライトしている要素（作り直されたら差し替える）

      const request = {
        title: step.title,
        description: step.content,
        side: step.side,
        progressText: `${index + 1} / ${tour.steps.length}`,
        showNext: !waitsForAction,
        // 前のステップが別画面・遷移待ち・飛ばす条件を満たしている場合は、戻ってもすぐ進んでしまうので戻れない
        showPrevious: !!prev && prev.advance.type !== 'navigate' && this.#pageMatches(prev) && !this.#shouldSkip(prev),
        nextLabel: index === tour.steps.length - 1 ? '完了' : '次へ',
        instruction: waitsForAction ? INSTRUCTIONS[step.advance.type](step.advance) : undefined,
        onNext: () => this.next(),
        onPrevious: () => this.previous(),
        onClose: () => this.abort(),
      };
      this.deps.highlighter.show({ ...request, element: current });

      // 画面側のスクリプトが対象の要素を作り直すことがある（例: クリックすると入力欄が新しい部品に置き換わる）。
      // 元の要素がページから消えたら探し直し、ハイライトと操作の判定を新しい要素に移す。
      let shown = current; // ハイライト中の要素
      const refresh = () => {
        if (step.target && !current?.isConnected) {
          const found = G.resolveTarget(step.target);
          if (found) current = found.element;
        }
        return current;
      };
      if (step.target) {
        const timer = setInterval(() => {
          refresh();
          if (current !== shown) {
            shown = current;
            this.deps.highlighter.show({ ...request, element: current });
          }
        }, 300);
        this.#stepDisposers.push(() => clearInterval(timer));
      }

      // 操作の判定は、イベントが起きた時点の要素で行う（作り直された直後の入力も取りこぼさない）
      this.#stepDisposers.push(
        G.watchAdvance(step.advance, refresh, () => this.#advanceFromAction(step.advance.type), this.deps.guard),
      );
    }

    #teardownStep() {
      this.#stepCtrl?.abort();
      this.#stepCtrl = null;
      this.#stepDisposers.forEach((d) => d());
      this.#stepDisposers = [];
      this.deps.highlighter.hide();
    }

    #patch(p) {
      this.#state = { ...this.#state, ...p };
      this.#listeners.forEach((l) => l());
    }
  };
})();
