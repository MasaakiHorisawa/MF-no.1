/**
 * 記事作成画面（HTML）：GASを貼る → 仕組みの分析と価格診断 → 記事の下書き
 *
 * 画面（ArticleDialog.html）から google.script.run で1段階ずつ呼びます。
 * 1回の呼び出しで Claude を1回だけ使うので、GAS の通信の時間制限（約60秒）に収まります。
 * 入力と結果は「ネタ帳」シートに記録します。
 */

/** メニューから記事作成画面を開く */
function openArticleDialog() {
  ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(), APP.SHEETS.ARTICLES, ARTICLE_COLS);
  ensureIdeasSheet_();
  const html = HtmlService.createHtmlOutputFromFile('ArticleDialog').setWidth(960).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'GASから記事を作る');
}

/** 画面を開いたとき：ネタ帳で行を選んでいれば、その内容を入れた状態で始める */
function articleDialogInit() {
  const settings = getSettings_();
  const result = { types: ARTICLE_TYPES, prefill: null, hasApiKey: !!PropertiesService.getScriptProperties().getProperty(APP.PROP_API_KEY) };
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== APP.SHEETS.IDEAS) return result;
  const rows = selectedDataRows_(sheet);
  if (rows.length !== 1) return result;
  const cols = headerMap_(sheet);
  const v = sheet.getRange(rows[0], 1, 1, sheet.getLastColumn()).getValues()[0];
  const get = name => (cols[name] === undefined ? '' : v[cols[name]]);
  if (!get('コード')) return result;
  let plan = null;
  try { plan = get('分析結果') ? JSON.parse(get('分析結果')) : null; } catch (e) { plan = null; }
  result.prefill = {
    row: rows[0],
    code: String(get('コード')),
    image: String(get('記事のイメージ') || get('ひとこと') || ''),
    type: String(get('種別') || 'おまかせ'),
    price: normalizePrice_(get('価格')),
    plan: plan,
  };
  return result;
}

/**
 * 段階1：送信前チェック → 仕組みの分析・記事設計・価格診断
 * @param {{row?: number, code: string, image: string, type: string, price: string|number}} input
 */
function articleAnalyze(input) {
  const idea = {
    code: String(input.code || '').trim(),
    image: String(input.image || '').trim(),
    type: input.type || 'おまかせ',
    price: normalizePrice_(input.price),
  };
  if (!idea.code) throw new Error('GASのコードを貼り付けてください。');
  if (idea.code.length > APP.MAX_CODE_CHARS) {
    throw new Error(`コードが長すぎます（${idea.code.length}字）。記事にしたい部分だけ、${APP.MAX_CODE_CHARS}字以内で貼ってください。`);
  }

  const ideas = ensureIdeasSheet_();
  const row = saveIdeaRow_(ideas, input.row, {
    '記事のイメージ': idea.image,
    'コード': idea.code,
    '種別': idea.type === 'おまかせ' ? '' : idea.type,
    '価格': idea.price,
  });

  const sensitive = findSensitive_(idea.code + '\n' + idea.image);
  if (sensitive.length) {
    saveIdeaRow_(ideas, row, { 'チェック': describeSensitive_(sensitive) });
    return { row: row, sensitive: sensitive };
  }

  const settings = getSettings_();
  const plan = callClaudeJson_({
    model: settings['モデル'],
    effort: settings['effort（記事）'] || 'low',
    system: buildArticleSystemPrompt_(settings),
    user: buildArticleAnalyzePrompt_(idea),
    schema: buildArticleAnalyzeSchema_(),
    maxTokens: 12000,
  });
  saveIdeaRow_(ideas, row, { 'チェック': 'OK', 'ステータス': '分析済', '分析結果': JSON.stringify(plan) });
  return { row: row, plan: plan };
}

/**
 * 段階2：本文を1エリアずつ書く
 * @param {{section: 'free'|'paid', code: string, image: string, type: string, price: number, plan: Object}} input
 */
function articleWriteSection(input) {
  const idea = { code: input.code, image: input.image, type: input.type, price: normalizePrice_(input.price) };
  // 書く前にもう一度チェック（画面でコードを書き換えた場合に備える）
  const sensitive = findSensitive_(idea.code + '\n' + idea.image);
  if (sensitive.length) throw new Error(describeSensitive_(sensitive));

  const settings = getSettings_();
  const prompt = input.section === 'paid'
    ? buildArticlePaidPrompt_(idea, input.plan)
    : buildArticleFreePrompt_(idea, input.plan, input.type);
  const result = callClaudeJson_({
    model: settings['モデル'],
    effort: settings['effort（記事）'] || 'low',
    system: buildArticleSystemPrompt_(settings),
    user: prompt,
    schema: buildMarkdownSchema_(),
    maxTokens: 12000,
  });
  return result.markdown;
}

/**
 * 段階3：Googleドキュメントを作り、「記事」「ネタ帳」シートに記録する
 * @param {{row: number, title: string, type: string, price: number, plan: Object, freeMd: string, paidMd: string}} input
 */
function articleFinish(input) {
  const meta = {
    title: String(input.title || input.plan.title).trim(),
    titleAlternatives: (input.plan.title_alternatives || []).filter(t => t !== input.title),
    type: input.type,
    price: input.type === '無料' ? '' : normalizePrice_(input.price),
  };
  const docUrl = createDraftDoc_(`【下書き】${meta.title}`, assembleDraftMarkdown_(meta, input.freeMd, input.paidMd));
  const articleId = registerDraftArticle_(meta, input.freeMd, docUrl);
  saveIdeaRow_(ensureIdeasSheet_(), input.row, {
    '種別': meta.type,
    '価格': meta.price,
    'ステータス': '下書き作成済',
    '記事ID': articleId,
    '下書きURL': docUrl,
    '作成日時': formatNow_(),
  });
  return { docUrl: docUrl, articleId: articleId };
}

/** ネタ帳の行を更新する。row がなければ新しい行を追加し、その行番号を返す */
function saveIdeaRow_(ideas, row, values) {
  const cols = requireColumns_(ideas, IDEA_COLS);
  if (!row) {
    row = ideas.getLastRow() + 1;
    ideas.getRange(row, cols['ネタID'] + 1).setValue(`N${row - 1}`);
    ideas.getRange(row, cols['ステータス'] + 1).setValue('未着手');
  }
  Object.keys(values).forEach(name => {
    ideas.getRange(row, cols[name] + 1).setValue(values[name]);
  });
  return row;
}

/** 下書きを「記事」シートに登録する（URLは公開後にRSSで自動入力） */
function registerDraftArticle_(meta, freeMarkdown, docUrl) {
  const articles = getSheetOrThrow_(APP.SHEETS.ARTICLES);
  const cols = requireColumns_(articles, ARTICLE_COLS);
  const id = nextArticleId_(articles);
  const width = Math.max(...Object.values(cols)) + 1;
  const row = new Array(width).fill('');
  row[cols['記事ID']] = id;
  row[cols['タイトル']] = meta.title;
  row[cols['種別']] = meta.type;
  row[cols['価格']] = meta.price;
  row[cols['本文・要点']] = freeMarkdown;
  row[cols['メモ']] = `下書き：${docUrl}`;
  articles.getRange(articles.getLastRow() + 1, 1, 1, width).setValues([row]);
  return id;
}
