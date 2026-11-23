/**
 * ツアー定義（JSON）の検証。
 * 読み込み時にここで形式をチェックし、間違いがあれば「どのファイルのどの項目か」をエラーにする。
 * 正しい定義には省略可能な項目の既定値を補って返す。
 *
 * ── ツアー定義の形式 ──────────────────────────────
 * {
 *   id, title, description?,
 *   match: ["https://…/*"],          // ツアーを有効にする URL（glob）
 *   startPage?: "/path",              // 開始できる画面のパス（glob）
 *   startQuery?: { key: "値" },       // 開始できる画面のクエリ（URL の ? 以降）
 *   mode?: "guide" | "practice",      // 既定: guide
 *   blockRules?: [{ selector, events: ["click"|"submit"|"key:Enter"…], message }],
 *   steps: [{
 *     id, title, content,
 *     page?: "/path*",                // このステップを表示する画面のパス（glob）
 *     pageQuery?: { key: "値" },      // このステップを表示する画面のクエリ（例: { "screen": "order" }）
 *     target?: { selector?, fallbacks?: [..], text?, textFallback? },   // selector と text の少なくとも一方
 *              // selector + text →「selector に一致し、text を含む要素」（例: "button" + "Log in"）
 *     advance?: { type: "next" }                        // 既定
 *             | { type: "click", selector? }
 *             | { type: "input", minLength?, pattern? }
 *             | { type: "key", key }
 *             | { type: "navigate", path?, query? },     // path と query の少なくとも一方
 *     skipIf?: { page?, query?, exists? },   // 書いた条件をすべて満たしていたら、このステップを飛ばす
 *              // exists: 要素のセレクタ、または { selector?, text?, fallbacks? }
 *     side?: "top" | "right" | "bottom" | "left"
 *   }]
 * }
 */
(() => {
  const G = (globalThis.GuideExt ??= {});

  const ADVANCE_TYPES = ['next', 'click', 'input', 'key', 'navigate'];
  const SIDES = ['top', 'right', 'bottom', 'left'];

  G.parseTour = function parseTour(raw, source = 'unknown') {
    const errors = [];
    const err = (path, msg) => errors.push(`  - ${path}: ${msg}`);
    const isStr = (v) => typeof v === 'string' && v.length > 0;
    const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const strArray = (v) => Array.isArray(v) && v.length > 0 && v.every(isStr);
    /** { "キー": "値" } の形か */
    const checkQuery = (v, path) => {
      if (v === undefined) return;
      if (!isObj(v) || Object.keys(v).length === 0 || !Object.values(v).every((x) => typeof x === 'string'))
        err(path, '{ "キー": "値" } の形で指定してください（例: { "screen": "order" }）');
    };
    /** 要素の指定（target / skipIf.exists）の形か */
    const checkTarget = (v, path) => {
      if (!isObj(v) || (!isStr(v.selector) && !isStr(v.text)))
        return err(path, 'selector か text の少なくとも一方を指定してください');
      if (v.selector !== undefined && !isStr(v.selector)) err(`${path}.selector`, '文字列で指定してください');
      if (v.text !== undefined && !isStr(v.text)) err(`${path}.text`, '文字列で指定してください');
      if (v.textFallback !== undefined && typeof v.textFallback !== 'boolean')
        err(`${path}.textFallback`, 'true か false で指定してください');
      if (v.fallbacks !== undefined && !strArray(v.fallbacks)) err(`${path}.fallbacks`, '文字列の配列で指定してください');
    };

    if (!isObj(raw)) throw new Error(`ツアー定義が不正です (${source}): オブジェクトではありません`);
    if (!isStr(raw.id)) err('id', '文字列で指定してください');
    if (!isStr(raw.title)) err('title', '文字列で指定してください');
    if (!strArray(raw.match)) err('match', 'URL を1つ以上の配列で指定してください');
    if (raw.mode !== undefined && !['guide', 'practice'].includes(raw.mode)) err('mode', '"guide" か "practice" を指定してください');
    if (raw.startPage !== undefined && !isStr(raw.startPage)) err('startPage', '文字列で指定してください');
    checkQuery(raw.startQuery, 'startQuery');

    const blockRules = raw.blockRules ?? [];
    if (!Array.isArray(blockRules)) err('blockRules', '配列で指定してください');
    else
      blockRules.forEach((r, i) => {
        const p = `blockRules.${i}`;
        if (!isObj(r)) return err(p, 'オブジェクトで指定してください');
        if (!isStr(r.selector)) err(`${p}.selector`, '文字列で指定してください');
        if (!strArray(r.events) || !r.events.every((e) => ['click', 'submit'].includes(e) || /^key:.+$/.test(e)))
          err(`${p}.events`, '"click" / "submit" / "key:Enter" などの配列で指定してください');
        if (!isStr(r.message)) err(`${p}.message`, '文字列で指定してください');
      });

    const ids = new Set();
    if (!Array.isArray(raw.steps) || raw.steps.length === 0) err('steps', 'ステップを1つ以上指定してください');
    const steps = (Array.isArray(raw.steps) ? raw.steps : []).map((s, i) => {
      const p = `steps.${i}`;
      if (!isObj(s)) {
        err(p, 'オブジェクトで指定してください');
        return s;
      }
      if (!isStr(s.id)) err(`${p}.id`, '文字列で指定してください');
      else if (ids.has(s.id)) err(`${p}.id`, `ステップIDが重複しています: ${s.id}`);
      ids.add(s.id);
      if (!isStr(s.title)) err(`${p}.title`, '文字列で指定してください');
      if (!isStr(s.content)) err(`${p}.content`, '文字列で指定してください');
      if (s.page !== undefined && !isStr(s.page)) err(`${p}.page`, '文字列で指定してください');
      if (s.side !== undefined && !SIDES.includes(s.side)) err(`${p}.side`, `${SIDES.join(' / ')} のいずれかを指定してください`);
      checkQuery(s.pageQuery, `${p}.pageQuery`);
      if (s.target !== undefined) checkTarget(s.target, `${p}.target`);
      let skipIf = s.skipIf;
      if (skipIf !== undefined) {
        if (!isObj(skipIf) || (skipIf.page === undefined && skipIf.query === undefined && skipIf.exists === undefined)) {
          err(`${p}.skipIf`, 'page / query / exists の少なくとも1つを指定してください');
        } else {
          if (skipIf.page !== undefined && !isStr(skipIf.page)) err(`${p}.skipIf.page`, '文字列で指定してください');
          checkQuery(skipIf.query, `${p}.skipIf.query`);
          if (typeof skipIf.exists === 'string') skipIf = { ...skipIf, exists: { selector: skipIf.exists } };
          if (skipIf.exists !== undefined) checkTarget(skipIf.exists, `${p}.skipIf.exists`);
        }
      }
      const advance = s.advance ?? { type: 'next' };
      if (!isObj(advance) || !ADVANCE_TYPES.includes(advance.type)) {
        err(`${p}.advance.type`, `${ADVANCE_TYPES.join(' / ')} のいずれかを指定してください`);
      } else {
        if (advance.type === 'key' && !isStr(advance.key)) err(`${p}.advance.key`, 'キー名（例: "Enter"）を指定してください');
        if (advance.type === 'navigate') {
          if (advance.path === undefined && advance.query === undefined)
            err(`${p}.advance`, '遷移先の path か query の少なくとも一方を指定してください');
          if (advance.path !== undefined && !isStr(advance.path)) err(`${p}.advance.path`, '文字列で指定してください');
          checkQuery(advance.query, `${p}.advance.query`);
        }
        if (advance.type === 'input' && advance.pattern !== undefined) {
          try {
            new RegExp(advance.pattern);
          } catch {
            err(`${p}.advance.pattern`, '正規表現が不正です');
          }
        }
      }
      return { ...s, advance, skipIf };
    });

    if (errors.length) throw new Error(`ツアー定義が不正です (${source}):\n${errors.join('\n')}`);
    return { ...raw, mode: raw.mode ?? 'guide', blockRules, steps };
  };
})();
