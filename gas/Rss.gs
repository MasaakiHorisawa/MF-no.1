/**
 * noteの新着記事を、公式RSSから「記事」シートに取り込む
 *
 * RSS は note が公式に提供している仕組みで、公開済み記事の一覧を読むだけです（ログイン・投稿はしません）。
 * ネタ帳から作った下書きと同じタイトルの記事が公開されていれば、その行にURLを紐づけます。
 */

/** メニューから実行 */
function importNoteArticles() {
  const ui = SpreadsheetApp.getUi();
  const settings = getSettings_();
  if (!settings['noteのRSS']) {
    ui.alert('「設定」シートの「noteのRSS」に https://note.com/あなたのID/rss を入れてください。');
    return;
  }
  const result = importNoteArticles_(settings);
  ui.alert(
    `新しく追加：${result.added.length}件\n下書きにURLを紐づけ：${result.linked.length}件` +
    (result.postsCreated ? `\nX投稿案を作成：${result.postsCreated}件` : '') +
    (result.errors.length ? `\n\n${result.errors.join('\n')}` : '')
  );
}

/**
 * @return {{added: string[], linked: string[], postsCreated: number, errors: string[]}}
 */
function importNoteArticles_(settings) {
  const rssUrl = resolveNoteRssUrl_(settings['noteのRSS']);
  const res = UrlFetchApp.fetch(rssUrl, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error(`noteのRSSを読み込めませんでした（HTTP ${res.getResponseCode()}）。「設定」シートのURLを確認してください。`);
  }
  const text = res.getContentText();
  if (!/<rss[\s>]/.test(text)) {
    throw new Error(`${rssUrl} はRSSではないようです。「設定」シートの「noteのRSS」を https://note.com/あなたのID/rss の形にしてください。`);
  }
  const items = parseRssItems_(text);

  const articles = getSheetOrThrow_(APP.SHEETS.ARTICLES);
  const cols = requireColumns_(articles, ARTICLE_COLS);
  const width = Math.max(...Object.values(cols)) + 1;
  const data = articles.getLastRow() > 1
    ? articles.getRange(2, 1, articles.getLastRow() - 1, width).getValues()
    : [];
  const knownUrls = new Set(data.map(r => normalizeNoteUrl_(r[cols['URL']])).filter(Boolean));
  const result = { added: [], linked: [], postsCreated: 0, errors: [] };
  const touchedRows = [];

  // 古い記事から順に処理する（記事IDが公開順になるように）
  items.slice().reverse().forEach(item => {
    if (knownUrls.has(normalizeNoteUrl_(item.url))) return;
    knownUrls.add(normalizeNoteUrl_(item.url));

    const draftIndex = data.findIndex(r => !r[cols['URL']] && normalizeTitle_(r[cols['タイトル']]) === normalizeTitle_(item.title));
    if (draftIndex >= 0) {
      const row = draftIndex + 2;
      articles.getRange(row, cols['URL'] + 1).setValue(item.url);
      if (!data[draftIndex][cols['公開日']]) articles.getRange(row, cols['公開日'] + 1).setValue(item.date);
      data[draftIndex][cols['URL']] = item.url;
      markIdeaPublished_(data[draftIndex][cols['記事ID']]);
      result.linked.push(item.title);
      touchedRows.push(row);
      return;
    }

    const row = appendRowByName_(articles, cols, {
      '記事ID': nextArticleId_(articles),
      'タイトル': item.title,
      'URL': item.url,
      '公開日': item.date,
      '本文・要点': item.summary,
      'メモ': 'RSSから自動取り込み（本文・要点は記事の冒頭のみ。必要なら無料部分を貼り足す）',
    });
    result.added.push(item.title);
    touchedRows.push(row);
  });

  // 取り込んだ記事のX投稿案もまとめて作る（「設定」で「しない」にすれば止まる）
  if (settings['新着記事の投稿案を自動作成'] === 'する') {
    touchedRows.forEach(row => {
      const done = articles.getRange(row, cols['投稿案作成日時'] + 1).getValue();
      const body = articles.getRange(row, cols['本文・要点'] + 1).getValue();
      if (done || !body) return;
      try {
        result.postsCreated += generatePostsForArticleRow_(articles, row, settings);
      } catch (e) {
        result.errors.push(`${row}行目の投稿案：${e.message}`);
      }
    });
  }
  return result;
}

/** プロフィールURL（https://note.com/ID）が入っていても、RSSのURL（…/rss）に直す */
function resolveNoteRssUrl_(url) {
  const trimmed = String(url || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  return /^https:\/\/note\.com\/[^/]+$/.test(trimmed) ? `${trimmed}/rss` : trimmed;
}

/** RSS（XML）から記事の一覧を取り出す */
function parseRssItems_(xml) {
  const channel = XmlService.parse(escapeBareAmpersands_(xml)).getRootElement().getChild('channel');
  if (!channel) return [];
  return channel.getChildren('item').map(item => ({
    title: (item.getChildText('title') || '').trim(),
    url: (item.getChildText('link') || '').trim(),
    date: item.getChildText('pubDate') ? new Date(item.getChildText('pubDate')) : '',
    summary: htmlToPlainText_(item.getChildText('description') || ''),
  })).filter(i => i.title && i.url);
}

/**
 * note の RSS には、画像URLの「?fit=bounds&format=jpeg」のように & がそのまま入っていることがあり、
 * GAS の XmlService はそれをエラーにする。正しい記号（&amp; など）以外の & を &amp; に直してから読む
 */
function escapeBareAmpersands_(xml) {
  return String(xml).replace(/&(?!(?:[A-Za-z][A-Za-z0-9]*|#\d+|#x[0-9A-Fa-f]+);)/g, '&amp;');
}

function htmlToPlainText_(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h\d|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** URLの末尾や ?以降の違いで別記事と判定しないように整える */
function normalizeNoteUrl_(url) {
  return String(url || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
}

/** タイトル比較用：空白と全角/半角の違いを無視する */
function normalizeTitle_(title) {
  return String(title || '').normalize('NFKC').replace(/\s+/g, '');
}

/** ネタ帳の該当行を「公開済」にする */
function markIdeaPublished_(articleId) {
  if (!articleId) return;
  const ideas = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APP.SHEETS.IDEAS);
  if (!ideas || ideas.getLastRow() < 2) return;
  const cols = headerMap_(ideas);
  if (cols['記事ID'] === undefined || cols['ステータス'] === undefined) return;
  ideas.getRange(2, cols['記事ID'] + 1, ideas.getLastRow() - 1, 1).getValues().forEach(([id], i) => {
    if (id === articleId) ideas.getRange(i + 2, cols['ステータス'] + 1).setValue('公開済');
  });
}
