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
  const html = HtmlService.createHtmlOutput(articleDialogHtml_()).setWidth(960).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'GASから記事を作る');
}

/** 画面のHTML。1ファイル版（dist/コード.gs）には埋め込み済みなので、HTMLファイルを別に作らなくてよい */
function articleDialogHtml_() {
  if (typeof ARTICLE_DIALOG_HTML !== 'undefined') return ARTICLE_DIALOG_HTML;
  try {
    return HtmlService.createHtmlOutputFromFile('ArticleDialog').getContent();
  } catch (e) {
    throw new Error('記事作成画面のHTMLが見つかりません。最新の「コード.gs」（1ファイル版）に入れ替えてください。');
  }
}

/** 画面を開いたとき：ネタ帳で行を選んでいれば、その内容を入れた状態で始める */
function articleDialogInit() {
  const settings = getSettings_();
  const result = { types: ARTICLE_TYPES, prefill: null, hasApiKey: !!getApiKey_() };
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

  // フォルダID・メールアドレス・会社名などは、送る前にダミーへ置き換える（シートにも置き換え後の内容だけを残す）
  const maskedCode = maskSensitive_(idea.code);
  const maskedImage = maskSensitive_(idea.image);
  idea.code = maskedCode.text;
  idea.image = maskedImage.text;
  const replacements = maskedCode.replacements.concat(maskedImage.replacements);

  const ideas = ensureIdeasSheet_();
  const row = saveIdeaRow_(ideas, input.row, {
    '記事のイメージ': idea.image,
    'コード': idea.code,
    '種別': idea.type === 'おまかせ' ? '' : idea.type,
    '価格': idea.price,
    'チェック': describeReplacements_(replacements),
  });

  const settings = getSettings_();
  const plan = callClaudeJson_({
    model: settings['モデル'],
    effort: settings['effort（記事）'] || 'low',
    system: buildArticleSystemPrompt_(settings),
    user: buildArticleAnalyzePrompt_(idea),
    schema: buildArticleAnalyzeSchema_(),
    maxTokens: 12000,
  });
  saveIdeaRow_(ideas, row, { 'ステータス': '分析済', '分析結果': JSON.stringify(plan) });
  return { row: row, plan: plan, code: idea.code, image: idea.image, replacements: replacements };
}

/**
 * 段階2：本文を1エリアずつ書く
 * @param {{section: 'free'|'paid', code: string, image: string, type: string, price: number, plan: Object}} input
 */
function articleWriteSection(input) {
  // 画面でコードやイメージを書き換えた場合に備えて、書く前にもう一度置き換える
  const idea = {
    code: maskSensitive_(input.code).text,
    image: maskSensitive_(input.image).text,
    type: input.type,
    price: normalizePrice_(input.price),
  };

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
    support: getSettings_()['サポート方針（有料記事）'],
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
  appendRowByName_(articles, cols, {
    '記事ID': id,
    'タイトル': meta.title,
    '種別': meta.type,
    '価格': meta.price,
    '本文・要点': freeMarkdown,
    'メモ': `下書き：${docUrl}`,
  });
  return id;
}
