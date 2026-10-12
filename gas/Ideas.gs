/**
 * ネタ帳：過去のGASを貼ると、note記事の下書き（Googleドキュメント）を作る
 *
 * 流れ：送信前チェック → 構成 → 無料エリア → 有料エリア → ドキュメント作成 → 「記事」シートに登録
 */

/** 「ネタ帳」シートで選択した1行から、記事の下書きを作る */
function generateArticleFromIdea() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ideas = ss.getActiveSheet();
  if (ideas.getName() !== APP.SHEETS.IDEAS) {
    ui.alert(`「${APP.SHEETS.IDEAS}」シートで、記事にしたいコードの行を選択してから実行してください。`);
    return;
  }
  const rows = selectedDataRows_(ideas);
  if (rows.length !== 1) {
    ui.alert('記事にするネタを1行だけ選択してください（1回の実行で1記事ずつ作ります）。');
    return;
  }
  const row = rows[0];
  const cols = requireColumns_(ideas, IDEA_COLS);
  const values = ideas.getRange(row, 1, 1, ideas.getLastColumn()).getValues()[0];
  const idea = {
    memo: String(values[cols['ひとこと']] || '').trim(),
    code: String(values[cols['コード']] || '').trim(),
  };
  const setCell = (name, value) => ideas.getRange(row, cols[name] + 1).setValue(value);

  if (!idea.code) {
    ui.alert('「コード」列に過去のGASを貼り付けてください。');
    return;
  }
  if (idea.code.length > APP.MAX_CODE_CHARS) {
    ui.alert(`コードが長すぎます（${idea.code.length}字）。記事にしたい部分だけ、${APP.MAX_CODE_CHARS}字以内で貼ってください。`);
    return;
  }
  const sensitive = findSensitive_(idea.code + '\n' + idea.memo);
  if (sensitive.length) {
    setCell('チェック', describeSensitive_(sensitive));
    ui.alert(
      '外部に送るべきでない情報が含まれている可能性があるため、送信を止めました。\n\n' +
      sensitive.map(f => `・${f.label}：${f.sample}`).join('\n') +
      '\n\n「サンプル株式会社」「test@example.com」「YOUR_SHEET_ID」などに置き換えてから、もう一度実行してください。'
    );
    return;
  }
  if (!values[cols['ネタID']]) setCell('ネタID', `N${row - 1}`);
  setCell('チェック', 'OK');

  const settings = getSettings_();
  const base = {
    model: settings['モデル'],
    effort: settings['effort（記事）'] || 'low',
    system: buildArticleSystemPrompt_(settings),
  };

  try {
    ss.toast('1/4 記事の構成を考えています…', '記事の下書き', 90);
    const plan = callClaudeJson_(Object.assign({}, base, {
      user: buildArticlePlanPrompt_(idea), schema: buildArticlePlanSchema_(), maxTokens: 8000,
    }));

    ss.toast('2/4 無料エリアを書いています…', '記事の下書き', 90);
    const free = callClaudeJson_(Object.assign({}, base, {
      user: buildArticleFreePrompt_(idea, plan), schema: buildMarkdownSchema_(), maxTokens: 12000,
    }));

    ss.toast('3/4 有料エリアを書いています…', '記事の下書き', 90);
    const paid = callClaudeJson_(Object.assign({}, base, {
      user: buildArticlePaidPrompt_(idea, plan), schema: buildMarkdownSchema_(), maxTokens: 12000,
    }));

    ss.toast('4/4 ドキュメントを作成しています…', '記事の下書き', 30);
    const docUrl = createDraftDoc_(`【下書き】${plan.title}`, assembleDraftMarkdown_(plan, free.markdown, paid.markdown));
    const articleId = registerDraftArticle_(plan, free.markdown, docUrl);

    setCell('ステータス', '下書き作成済');
    setCell('記事ID', articleId);
    setCell('下書きURL', docUrl);
    setCell('作成日時', formatNow_());
    ui.alert(
      `下書きを作成しました。\n${docUrl}\n\n` +
      '1. ドキュメントの【要確認】を埋めて推敲する\n' +
      '2. 【ここに完全版コードを貼る】に完全版のコードを貼る\n' +
      '3. noteに貼り付けて公開する\n' +
      '公開後は、毎朝の自動処理（またはメニュー「noteの新着記事を取り込む」）でURLが自動で紐づきます。'
    );
  } catch (e) {
    setCell('チェック', `作成できませんでした：${e.message}`);
    ui.alert(`下書きを作成できませんでした。\n${e.message}`);
  }
}

/** 下書きを「記事」シートに登録する（URLは公開後にRSSで自動入力） */
function registerDraftArticle_(plan, freeMarkdown, docUrl) {
  const articles = getSheetOrThrow_(APP.SHEETS.ARTICLES);
  const cols = requireColumns_(articles, ARTICLE_COLS);
  const id = nextArticleId_(articles);
  const width = Math.max(...Object.values(cols)) + 1;
  const row = new Array(width).fill('');
  row[cols['記事ID']] = id;
  row[cols['タイトル']] = plan.title;
  row[cols['種別']] = '有料';
  row[cols['本文・要点']] = freeMarkdown;
  row[cols['メモ']] = `下書き：${docUrl}\n価格案：${plan.price_suggestion}`;
  articles.getRange(articles.getLastRow() + 1, 1, 1, width).setValues([row]);
  return id;
}
