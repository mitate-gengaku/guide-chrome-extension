/**
 * 画面右下のガイドパネル。エンジンの状態を表示し、ボタン操作をエンジンに伝えるだけ。
 * Shadow DOM の中に描画するので、業務システムの CSS とは干渉しない。
 */
(() => {
  const G = (globalThis.GuideExt ??= {});

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  G.mountPanel = function mountPanel(engine, { title, maxVisibleTours = 2 }) {
    const host = document.createElement('guide-ext-panel');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <link rel="stylesheet" href="${chrome.runtime.getURL('styles/panel.css')}">
      <div class="gx-root" data-testid="guide-panel">
        <div class="gx-toast" role="status" hidden></div>
        <div class="gx-main"></div>
      </div>
      <div class="gx-dialog-layer"></div>`;
    document.body.appendChild(host);

    const main = shadow.querySelector('.gx-main');
    const toastEl = shadow.querySelector('.gx-toast');
    const dialogLayer = shadow.querySelector('.gx-dialog-layer');
    let open = false;
    let dialogOpen = false; // 全件表示ダイアログ
    let filterText = ''; // ダイアログの検索欄の内容
    let lastStatus = null;
    let lastToastAt = 0;
    let toastTimer;

    // ボタンはすべて data-action で判別する（パネルとダイアログの両方をまとめて受け取る）
    shadow.addEventListener('click', (e) => {
      // ダイアログの外側（暗い部分）をクリックしたら閉じる
      if (e.target.classList?.contains('gx-dialog-backdrop')) {
        closeDialog();
        return;
      }
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const { action, tourId } = btn.dataset;
      if (action === 'open') open = true;
      else if (action === 'close') open = false;
      else if (action === 'show-all') dialogOpen = true;
      else if (action === 'close-dialog') return closeDialog();
      else if (action === 'start') {
        dialogOpen = false;
        engine.start(tourId);
      }
      else if (action === 'abort') engine.abort();
      else if (action === 'retry') engine.retry();
      else if (action === 'skip') engine.skip();
      else if (action === 'reset') engine.resetCompletion(tourId);
      render();
      if (action === 'show-all') shadow.querySelector('.gx-dialog-search')?.focus();
    });

    // 検索欄：描き直さずに、一致しないガイドを隠すだけ（入力中にカーソルが外れないように）
    shadow.addEventListener('input', (e) => {
      if (!e.target.classList?.contains('gx-dialog-search')) return;
      filterText = e.target.value;
      applyFilter();
    });

    // Esc キーでダイアログを閉じる
    window.addEventListener(
      'keydown',
      (e) => {
        if (dialogOpen && e.key === 'Escape') {
          e.stopPropagation();
          closeDialog();
        }
      },
      true,
    );

    function closeDialog() {
      dialogOpen = false;
      filterText = '';
      render();
      main.querySelector('[data-action="show-all"]')?.focus();
    }

    function applyFilter() {
      const q = filterText.trim().toLowerCase();
      let shown = 0;
      for (const li of dialogLayer.querySelectorAll('.gx-item')) {
        const hit = !q || li.dataset.search.includes(q);
        li.hidden = !hit;
        if (hit) shown++;
      }
      const empty = dialogLayer.querySelector('.gx-dialog-empty');
      if (empty) empty.hidden = shown > 0;
      const count = dialogLayer.querySelector('.gx-dialog-count');
      if (count) count.textContent = q ? `${shown} 件 / 全 ${engine.getState().availableTours.length} 件` : `全 ${shown} 件`;
    }

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

      // 描き直すとスクロール位置が先頭に戻るので、覚えておいて復元する
      const scrollTop = main.querySelector('.gx-list')?.scrollTop ?? 0;
      main.innerHTML = open ? renderCard(s) : renderLauncher(s);
      limitListHeight(scrollTop);

      // ダイアログは一覧を出せる状態（ツアー未実行）のときだけ
      if (s.tour || !['idle', 'completed'].includes(s.status)) dialogOpen = false;
      const dialogScroll = dialogLayer.querySelector('.gx-dialog-body')?.scrollTop ?? 0;
      dialogLayer.innerHTML = dialogOpen ? renderDialog(s) : '';
      if (dialogOpen) {
        dialogLayer.querySelector('.gx-dialog-body').scrollTop = dialogScroll;
        const search = dialogLayer.querySelector('.gx-dialog-search');
        search.value = filterText;
        applyFilter();
      }
    }

    /** 全件表示ダイアログ */
    function renderDialog(s) {
      const items = s.availableTours.map((t) => renderItem(t, s)).join('');
      return `<div class="gx-dialog-backdrop">
        <section class="gx-dialog" role="dialog" aria-modal="true" aria-label="ガイド一覧">
          <header class="gx-dialog-header">
            <div class="gx-dialog-heading">
              <span class="gx-dialog-title">${esc(title)}　ガイド一覧</span>
              <span class="gx-dialog-count"></span>
            </div>
            <button class="gx-icon-btn gx-dialog-close" data-action="close-dialog" aria-label="一覧を閉じる">×</button>
          </header>
          <div class="gx-dialog-toolbar">
            <input class="gx-dialog-search" type="search" placeholder="ガイドを検索（タイトル・説明）" aria-label="ガイドを検索">
          </div>
          <div class="gx-dialog-body">
            <ul class="gx-dialog-list">${items}</ul>
            <p class="gx-muted gx-dialog-empty" hidden>一致するガイドがありません。</p>
          </div>
        </section>
      </div>`;
    }

    /**
     * ガイド一覧の高さを maxVisibleTours 件分までにし、超える分はスクロールにする。
     * 説明文の有無で1件ごとの高さが違うため、実際に表示された高さを測って決める。
     */
    function limitListHeight(scrollTop) {
      const list = main.querySelector('.gx-list');
      if (!list) return;
      const items = list.children;
      if (items.length <= maxVisibleTours) return;
      // スクロールバーの幅で折り返しが変わらないよう、先にスクロール用の見た目にしてから測る
      list.classList.add('gx-list-scroll');
      const first = items[0].getBoundingClientRect();
      const last = items[maxVisibleTours - 1].getBoundingClientRect();
      list.style.maxHeight = `${Math.ceil(last.bottom - first.top)}px`;
      list.scrollTop = scrollTop;
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
        body += `<details class="gx-load-errors"><summary>読み込めなかったツアーがあります（${s.loadErrors.length}件）</summary>
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
        ${['waiting-page', 'other-site'].includes(status) ? `<p class="gx-info">${esc(message)}</p>` : ''}
        ${status === 'element-missing' ? `<p class="gx-alert">${esc(message)}</p>` : ''}
        <div class="gx-actions">
          ${status === 'element-missing' ? '<button class="gx-btn" data-action="retry">再試行</button><button class="gx-btn" data-action="skip">スキップ</button>' : ''}
          <button class="gx-btn gx-btn-ghost" data-action="abort">ガイドを中断</button>
        </div>`;
    }

    /** ガイドが1つもないときの表示 */
    function renderNoTours(s) {
      let html = `<p class="gx-muted">このサイトにはガイドが設定されていません。</p>`;
      if (s.loadedTours.length === 0 && s.loadErrors.length === 0) {
        html += `<p class="gx-diag">ガイドが1件も読み込まれていません。<code>site/config.js</code> の <code>tourFiles</code> を確認してください。</p>`;
      } else if (s.loadedTours.length > 0) {
        const urls = [...new Set(s.loadedTours.flatMap((t) => t.match))];
        html += `<div class="gx-diag">
          <p>ガイドが設定されているのは下記のURLです。</p>
          <ul class="gx-url-list">${urls.map((u) => `<li><code>${esc(u)}</code></li>`).join('')}</ul></div>`;
      }
      return html;
    }

    /** 開始画面の表示用文字列（例: /cgi-bin/main.exe?screen=menu） */
    function startLabel(t) {
      const q = t.startQuery ? '?' + Object.entries(t.startQuery).map(([k, v]) => `${k}=${v}`).join('&') : '';
      return `${t.startPage ?? ''}${q}`;
    }

    /** ガイド1件分（パネルの一覧とダイアログで共通） */
    function renderItem(t, s) {
      const startable = G.matchPage(t.startPage, t.startQuery, new URL(location.href));
      const search = `${t.title} ${t.description ?? ''}`.toLowerCase();
      return `<li class="gx-item" data-search="${esc(search)}">
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
              ${startable ? '' : `<p class="gx-item-hint">開始画面（${esc(startLabel(t))}）で開始できます</p>`}
            </div>
            <button class="gx-btn gx-btn-primary" data-action="start" data-tour-id="${esc(t.id)}" ${startable ? '' : 'disabled'}>開始</button>
          </li>`;
    }

    function renderList(s) {
      if (s.availableTours.length === 0) return renderNoTours(s);
      const items = s.availableTours.map((t) => renderItem(t, s)).join('');
      const more =
        s.availableTours.length > maxVisibleTours
          ? `<div class="gx-list-footer">
               <span class="gx-list-count">全 ${s.availableTours.length} 件</span>
               <button class="gx-btn gx-btn-small" data-action="show-all">すべて表示</button>
             </div>`
          : '';
      return `<ul class="gx-list">${items}</ul>${more}`;
    }

    engine.subscribe(render);
    render();
    return () => host.remove();
  };
})();
