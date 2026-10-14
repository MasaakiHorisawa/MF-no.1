/**
 * 記事 → X投稿案の作成と、投稿案の再チェック
 */

/** 「記事」シートで選択した行から、X投稿案を作って「X投稿」シートに追加する */
function generatePostsFromSelection() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const articles = ss.getActiveSheet();
  if (articles.getName() !== APP.SHEETS.ARTICLES) {
    ui.alert(`「${APP.SHEETS.ARTICLES}」シートで、投稿案を作りたい記事の行を選択してから実行してください。`);
    return;
  }
  const rows = selectedDataRows_(articles);
  if (!rows.length) {
    ui.alert('記事の行（2行目以降）を選択してください。');
    return;
  }
  if (rows.length > APP.MAX_ARTICLES_PER_RUN) {
    ui.alert(`一度に処理できるのは${APP.MAX_ARTICLES_PER_RUN}記事までです。選択を減らしてください。`);
    return;
  }

  const settings = getSettings_();
  const errors = [];
  let created = 0;
  rows.forEach(row => {
    try {
      ss.toast(`${row}行目の記事の投稿案を作成中…`, 'X投稿案', 60);
      created += generatePostsForArticleRow_(articles, row, settings);
    } catch (e) {
      errors.push(`${row}行目：${e.message}`);
    }
  });

  const message = [`${created}件の投稿案を「${APP.SHEETS.POSTS}」シートに追加しました。`];
  if (errors.length) message.push('', '次の記事は作成できませんでした：', ...errors);
  ui.alert(message.join('\n'));
}

/**
 * 「記事」シートの1行から投稿案を作り、「X投稿」シートに追加する（メニューと毎朝の自動処理で共用）
 * @return {number} 追加した件数
 */
function generatePostsForArticleRow_(articles, row, settings) {
  const aCols = requireColumns_(articles, ARTICLE_COLS);
  const posts = getSheetOrThrow_(APP.SHEETS.POSTS);
  const pCols = requireColumns_(posts, POST_COLS);
  const count = Math.min(Math.max(parseInt(settings['1記事あたりの案数'], 10) || 3, 1), 5);

  const values = articles.getRange(row, 1, 1, articles.getLastColumn()).getValues()[0];
  const article = {
    id: String(values[aCols['記事ID']] || '').trim(),
    title: String(values[aCols['タイトル']] || '').trim(),
    url: String(values[aCols['URL']] || '').trim(),
    type: String(values[aCols['種別']] || '').trim(),
    price: String(values[aCols['価格']] || '').trim(),
    body: String(values[aCols['本文・要点']] || '').trim(),
  };
  if (!article.title || !article.body) throw new Error('タイトルと「本文・要点」を入力してください');
  // RSS で取り込んだ本文も入るので、AI に送る前に調べる
  guardPromptInput_(`${article.title}\n${article.body}`, `記事「${article.title}」`, settings);
  if (!article.id) {
    article.id = nextArticleId_(articles);
    articles.getRange(row, aCols['記事ID'] + 1).setValue(article.id);
  }

  const result = callClaudeJson_({
    model: settings['モデル'],
    effort: settings['effort'],
    system: buildSystemPrompt_(settings),
    user: buildUserPrompt_(article, count),
    schema: buildPostsSchema_(),
  });
  const newRows = (result.posts || []).map((p, i) => buildPostRow_(p, article, i, settings, pCols));
  if (newRows.length) {
    posts.getRange(posts.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }
  articles.getRange(row, aCols['投稿案作成日時'] + 1).setValue(formatNow_());
  return newRows.length;
}

/** Claude の回答1件を「X投稿」シートの1行に変換する */
function buildPostRow_(post, article, index, settings, pCols) {
  const link = post.include_link && article.url ? article.url : '';
  const check = checkPost_(post.text, link, settings['NGワード']);
  const stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyMMddHHmmss');
  return buildRowByName_(pCols, {
    '投稿ID': `P${stamp}-${index + 1}`,
    '記事ID': article.id,
    '柱': post.pillar,
    '型': post.post_type,
    '本文': post.text,
    'リンク': link,
    '文字数(X換算)': check.weight,
    'チェック': check.result,
    'ステータス': '案',
    'メモ': post.intent,
    '作成日時': formatNow_(),
  });
}

/** 「X投稿」シートで選択した行の文字数・チェックを計算し直す */
function recheckSelectedPosts() {
  const posts = SpreadsheetApp.getActiveSheet();
  if (posts.getName() !== APP.SHEETS.POSTS) {
    SpreadsheetApp.getUi().alert(`「${APP.SHEETS.POSTS}」シートで行を選択してから実行してください。`);
    return;
  }
  const settings = getSettings_();
  selectedDataRows_(posts).forEach(row => recheckPostRow_(posts, row, settings));
}

function recheckPostRow_(posts, row, settings) {
  const cols = headerMap_(posts);
  const body = posts.getRange(row, cols['本文'] + 1).getValue();
  const link = posts.getRange(row, cols['リンク'] + 1).getValue();
  const check = checkPost_(body, link, settings['NGワード']);
  posts.getRange(row, cols['文字数(X換算)'] + 1).setValue(check.weight);
  posts.getRange(row, cols['チェック'] + 1).setValue(check.result);
}

/** 本文やリンクを手で直したら、自動で文字数とチェックを更新する（シンプルトリガー） */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== APP.SHEETS.POSTS) return;
  const cols = headerMap_(sheet);
  const first = e.range.getColumn();
  const last = first + e.range.getNumColumns() - 1;
  const watched = [cols['本文'] + 1, cols['リンク'] + 1];
  if (!watched.some(c => c >= first && c <= last)) return;
  const settings = getSettings_();
  const end = e.range.getRow() + e.range.getNumRows() - 1;
  for (let row = Math.max(e.range.getRow(), 2); row <= end; row++) recheckPostRow_(sheet, row, settings);
}
