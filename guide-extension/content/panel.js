/**
 * 画面右下のガイドパネル。エンジンの状態を表示し、ボタン操作をエンジンに伝えるだけ。
 * Shadow DOM の中に描画するので、業務システムの CSS とは干渉しない。
 */
(() => {
  const G = (globalThis.GuideExt ??= {});

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  G.mountPanel = function mountPanel(engine, { title }) {
    const host = document.createElement('guide-ext-panel');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <link rel="stylesheet" href="${chrome.runtime.getURL('styles/panel.css')}">
      <div class="gx-root" data-testid="guide-panel">
        <div class="gx-toast" role="status" hidden></div>
        <div class="gx-main"></div>
      </div>`;
    document.body.appendChild(host);

    const main = shadow.querySelector('.gx-main');
    const toastEl = shadow.querySelector('.gx-toast');
    let open = false;
    let lastStatus = null;
    let lastToastAt = 0;
    let toastTimer;

    // ボタンはすべて data-action で判別する（イベント委譲）
    main.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const { action, tourId } = btn.dataset;
      if (action === 'open') open = true;
      else if (action === 'close') open = false;
      else if (action === 'start') engine.start(tourId);
      else if (action === 'abort') engine.abort();
      else if (action === 'retry') engine.retry();
      else if (action === 'skip') engine.skip();
      else if (action === 'reset') engine.resetCompletion(tourId);
      render();
    });

    function render() {
      const s = engine.getState();

      // 利用者の対応が必要な状態になったら自動で開く
      if (s.status !== lastStatus && ['element-missing', 'waiting-page', 'completed', 'error'].includes(s.status)) open = true;
      lastStatus = s.status;

      if (s.toast && s.toast.at !== lastToastAt) {
        lastToastAt = s.toast.at;
        toastEl.textContent = s.toast.message;
        toastEl.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => (toastEl.hidden = true), 4000);
      }

      main.innerHTML = open ? renderCard(s) : renderLauncher(s);
    }

    function renderLauncher(s) {
      const label = s.tour ? `${s.tour.title}（${s.stepIndex + 1}/${s.tour.steps.length}）` : title;
      return `<button class="gx-launcher" data-action="open" aria-label="${esc(title)}を開く">
        <span class="gx-launcher-icon" aria-hidden="true">?</span>${esc(label)}</button>`;
    }

    function renderCard(s) {
      let body = '';
      if (s.status === 'loading') body = `<p class="gx-muted">読み込み中…</p>`;
      else if (s.status === 'error') body = `<p class="gx-alert">${esc(s.message)}</p>`;
      else if (s.tour) body = renderActive(s);
      else body = (s.status === 'completed' ? `<p class="gx-success">${esc(s.message)}</p>` : '') + renderList(s);

      if (s.loadErrors.length) {
        // 使えるガイドが1つもないときは、原因を探しやすいよう最初から開いておく
        const openAttr = s.availableTours.length === 0 ? ' open' : '';
        body += `<details class="gx-load-errors"${openAttr}><summary>読み込めなかったツアーがあります（${s.loadErrors.length}件）</summary>
          <pre>${esc(s.loadErrors.join('\n\n'))}</pre></details>`;
      }

      return `<section class="gx-card" aria-label="${esc(title)}">
        <header class="gx-header">
          <span class="gx-title">${esc(title)}</span>
          <button class="gx-icon-btn" data-action="close" aria-label="パネルを閉じる">×</button>
        </header>
        <div class="gx-body">${body}</div>
      </section>`;
    }

    function renderActive(s) {
      const { tour, stepIndex, status, message } = s;
      const total = tour.steps.length;
      const step = tour.steps[stepIndex];
      return `<div class="gx-row">
          <span class="gx-tour-name">${esc(tour.title)}</span>
          ${tour.mode === 'practice' ? '<span class="gx-badge gx-badge-practice">練習モード</span>' : ''}
        </div>
        <div class="gx-progress"><div class="gx-progress-bar" style="width:${((stepIndex + 1) / total) * 100}%"></div></div>
        <p class="gx-step">${stepIndex + 1} / ${total}　${esc(step?.title)}</p>
        ${status === 'waiting-page' ? `<p class="gx-info">${esc(message)}</p>` : ''}
        ${status === 'element-missing' ? `<p class="gx-alert">${esc(message)}</p>` : ''}
        <div class="gx-actions">
          ${status === 'element-missing' ? '<button class="gx-btn" data-action="retry">再試行</button><button class="gx-btn" data-action="skip">スキップ</button>' : ''}
          <button class="gx-btn gx-btn-ghost" data-action="abort">ガイドを中断</button>
        </div>`;
    }

    /** ガイドが1つもないとき、なぜ使えないのかを表示する */
    function renderNoTours(s) {
      const here = G.urlWithoutQuery(new URL(location.href));
      let html = `<p class="gx-muted">この画面で使えるガイドはありません。</p>`;
      if (s.loadedTours.length === 0 && s.loadErrors.length === 0) {
        html += `<p class="gx-diag">ツアーが1件も読み込まれていません。<code>site/config.js</code> の <code>tourFiles</code> にファイル名が書かれているか確認してください。</p>`;
      } else if (s.loadedTours.length > 0) {
        const rows = s.loadedTours
          .map((t) => `<li><b>${esc(t.title)}</b><br><code>${t.match.map(esc).join('<br>')}</code></li>`)
          .join('');
        html += `<div class="gx-diag">
          <p>読み込んだツアーは ${s.loadedTours.length} 件ありますが、この画面のURLに一致する <code>match</code> がありません。</p>
          <p>この画面のURL：<br><code>${esc(here)}</code></p>
          <ul>${rows}</ul></div>`;
      }
      return html;
    }

    function renderList(s) {
      if (s.availableTours.length === 0) return renderNoTours(s);
      const items = s.availableTours
        .map((t) => {
          const startable = !t.startPage || G.matchGlob(t.startPage, location.pathname);
          return `<li class="gx-item">
            <div class="gx-item-main">
              <div class="gx-row">
                <span class="gx-item-title">${esc(t.title)}</span>
                ${t.mode === 'practice' ? '<span class="gx-badge gx-badge-practice">練習</span>' : ''}
                ${
                  s.completedTourIds.includes(t.id)
                    ? `<span class="gx-badge gx-badge-done">完了済み</span>
                       <button class="gx-link-btn" data-action="reset" data-tour-id="${esc(t.id)}" title="このツアーを未完了に戻します">記録を消す</button>`
                    : ''
                }
              </div>
              ${t.description ? `<p class="gx-item-desc">${esc(t.description)}</p>` : ''}
              ${startable ? '' : `<p class="gx-item-hint">開始画面（${esc(t.startPage)}）で開始できます</p>`}
            </div>
            <button class="gx-btn gx-btn-primary" data-action="start" data-tour-id="${esc(t.id)}" ${startable ? '' : 'disabled'}>開始</button>
          </li>`;
        })
        .join('');
      return `<ul class="gx-list">${items}</ul>`;
    }

    engine.subscribe(render);
    render();
    return () => host.remove();
  };
})();
