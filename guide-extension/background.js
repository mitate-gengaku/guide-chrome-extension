/**
 * ツアー定義の読み込み担当。
 * content script からの依頼を受けて、拡張機能フォルダ内の JSON（と、設定されていれば社内サーバー）を読む。
 * （拡張機能内のファイルを content script から直接読むには公開設定が必要なため、ここで代行する）
 */
importScripts('site/config.js');

async function loadTourSources() {
  const config = globalThis.GUIDE_SITE_CONFIG;
  const sources = [];
  const errors = [];

  for (const path of config.tourFiles) {
    try {
      const res = await fetch(chrome.runtime.getURL(path), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sources.push({ source: path, data: await res.json() });
    } catch (e) {
      const reason =
        e instanceof SyntaxError
          ? `JSON の書き方に誤りがあります（${e.message}）`
          : 'ファイルが見つかりません。site/config.js の tourFiles のファイル名と、実際のファイル名・場所が一致しているか確認してください';
      errors.push(`${path} を読み込めません: ${reason}`);
    }
  }

  if (config.remoteToursUrl) {
    try {
      const res = await fetch(config.remoteToursUrl, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      if (!Array.isArray(list)) throw new Error('応答が配列ではありません');
      list.forEach((data, i) => sources.push({ source: `${config.remoteToursUrl}[${i}]`, data }));
    } catch (e) {
      errors.push(`社内サーバーのツアーを読み込めません: ${e.message}`);
    }
  }

  return { sources, errors };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'guide:loadTours') {
    loadTourSources().then(sendResponse);
    return true; // 非同期で応答する
  }
  return false;
});
