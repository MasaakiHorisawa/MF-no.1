/**
 * note × X 投稿管理ツール（1ファイル版）
 *
 * このファイルは tools/bundle.js で gas/*.gs から自動生成しています。直接編集せず、gas/ を直してから作り直してください。
 * Apps Script には、このファイル（コード.gs）と appsscript.json の2つだけを置きます（記事作成画面のHTMLも埋め込み済み）。
 * ほかの .gs ファイルが残っていると「すでに宣言されています」というエラーになるので削除してください。
 */
// ===== Config.gs ======================================================

/**
 * note × X 投稿管理ツール：設定
 *
 * シート名・列名・選択肢をここにまとめています。
 * 運用中に変えたい値（モデル、文体、NGワードなど）はコードではなく「設定」シートで変更してください。
 */

const APP = {
  SHEETS: {
    SETTINGS: '設定',
    ARTICLES: '記事',
    POSTS: 'X投稿',
    IDEAS: 'ネタ帳',
  },
  API_URL: 'https://api.anthropic.com/v1/messages',
  API_VERSION: '2023-06-01',
  // 安全性の判定で回答が拒否されたとき、別モデルで自動的に再実行させるための指定
  FALLBACK_BETA: 'server-side-fallback-2026-07-01',
  FALLBACK_MODELS: ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'],
  PROP_API_KEY: 'ANTHROPIC_API_KEY',
  X_MAX_WEIGHT: 280, // X の上限（全角140字＝280）
  X_URL_WEIGHT: 23, // X ではURLは長さに関係なく23としてカウントされる
  MAX_ARTICLES_PER_RUN: 5, // 1回の実行で処理する記事数の上限（GASの6分制限対策）
  MAX_CODE_CHARS: 40000, // ネタ帳に貼るコードの上限（長すぎるとAIの応答が時間切れになる）
};

// 列は「列名」で探すので、シート上で列の順番を入れ替えても動きます
const ARTICLE_COLS = ['記事ID', 'タイトル', 'URL', '公開日', '種別', '価格', '本文・要点', '投稿案作成日時', 'メモ'];

const POST_COLS = [
  '投稿ID', '記事ID', '柱', '型', '本文', 'リンク', '文字数(X換算)', 'チェック',
  'ステータス', '予定日時', '投稿URL', 'インプレッション', 'いいね', 'リンククリック', 'メモ', '作成日時',
];

// ネタ帳：記事作成画面で貼ったGASと、分析・下書きの記録
const IDEA_COLS = ['ネタID', '記事のイメージ', 'コード', '種別', '価格', 'チェック', 'ステータス', '記事ID', '下書きURL', '作成日時', '分析結果'];
const IDEA_STATUSES = ['未着手', '分析済', '下書き作成済', '公開済', '見送り'];

const STATUSES = ['案', '推敲済', '予約済', '投稿済', '見送り'];
const PILLARS = ['GAS実例', 'AI検証', '制度・季節', '人柄'];
const POST_TYPES = ['告知', 'Tips', '検証結果', '問いかけ', '日常'];
const ARTICLE_TYPES = ['無料', '有料', '有料（無料コードあり）'];

// 「設定」シートの初期値：[項目, 値, 説明]
const DEFAULT_SETTINGS = [
  ['モデル', 'claude-opus-5-5', 'Claude のモデルID'],
  ['effort', 'low', 'low / medium / high。短い投稿文なら low で十分'],
  ['1記事あたりの案数', '3', '1〜5程度'],
  ['発信者プロフィール', '税理士事務所で会計監査をしている20代。GASとAIで経理の手作業を減らす仕組みを作り、noteで配布している。', 'AIに渡す自己紹介'],
  ['文体', 'です・ます調を基本に、自分の体験として具体的に書く。誇張しない。絵文字は0〜1個。', 'AIに渡す文体の指示'],
  ['ハッシュタグ方針', '0〜1個。使う場合は #GAS か #経理 のみ。', 'AIに渡す指示'],
  ['NGワード', '絶対,必ず,100%,誰でも稼げる,節税できます,脱税,神ツール', 'カンマ区切り。含まれるとチェック欄に警告'],
  ['週あたり目標投稿数', '4', 'リマインドの判定に使用'],
  ['リマインド送信先', '', '空欄なら実行ユーザーのメールアドレス'],
  ['noteのRSS', '', '例：https://note.com/あなたのID/rss 。毎朝ここから新着記事を取り込む'],
  ['新着記事の投稿案を自動作成', 'する', 'する / しない。毎朝の自動処理で、取り込んだ記事のX投稿案も作る'],
  ['effort（記事）', 'low', '記事下書きの作成に使う effort。medium は丁寧だが時間切れになりやすい'],
  ['記事のお手本（任意）', '', '過去の記事本文を1本貼ると、下書きの文体をそれに寄せる'],
  ['サポート方針（有料記事）', [
    '- 対応する内容：記事のとおりに設定しても動かない場合の不具合対応と、導入時のエラー解決（購入から30日以内）',
    '- 対応しない内容：ご自身の業務に合わせた改造・機能追加（別途有償でご相談ください）、税務・会計の個別のご相談',
    '- 窓口：この記事のコメント欄、またはnoteの「クリエイターへのお問い合わせ」',
    '- 回答の目安：3営業日以内（本業があるため、すぐのお返事はできません）',
    '- Google側の仕様変更で動かなくなった場合は、記事とコードを更新してお知らせします',
    '- ご利用は自己責任でお願いします。必ずテスト用のシートで動作を確認してから、実際のデータでお使いください',
  ].join('\n'), '有料記事の下書きの最後に「サポートについて」としてそのまま入る。1行1項目'],
];

// ===== Sheets.gs ======================================================

/**
 * シート操作の共通処理と初期設定
 */

/** 3つのシートを作成し、見出し・入力規則・初期設定値を入れる（何度実行しても既存データは消えません） */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const settings = ensureSheet_(ss, APP.SHEETS.SETTINGS, ['項目', '値', '説明']);
  const existing = settings.getRange(1, 1, Math.max(settings.getLastRow(), 1), 1).getValues().map(r => r[0]);
  DEFAULT_SETTINGS.forEach(row => {
    if (!existing.includes(row[0])) settings.appendRow(row);
  });
  settings.setColumnWidth(1, 160).setColumnWidth(2, 420).setColumnWidth(3, 320);
  settings.getRange('B:B').setWrap(true);

  const articles = ensureSheet_(ss, APP.SHEETS.ARTICLES, ARTICLE_COLS);
  setListValidation_(articles, '種別', ARTICLE_TYPES);
  setColumnWidthByName_(articles, 'タイトル', 280);
  setColumnWidthByName_(articles, '本文・要点', 420);

  const posts = ensureSheet_(ss, APP.SHEETS.POSTS, POST_COLS);
  setListValidation_(posts, '柱', PILLARS);
  setListValidation_(posts, '型', POST_TYPES);
  setListValidation_(posts, 'ステータス', STATUSES);
  setColumnWidthByName_(posts, '本文', 420);
  setColumnWidthByName_(posts, 'チェック', 220);
  const cols = headerMap_(posts);
  posts.getRange(2, cols['予定日時'] + 1, posts.getMaxRows() - 1, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build())
    .setNumberFormat('yyyy/mm/dd hh:mm');
  posts.getRange(2, cols['本文'] + 1, posts.getMaxRows() - 1, 1).setWrap(true);

  ensureIdeasSheet_(ss);

  SpreadsheetApp.getUi().alert(
    '初期設定が完了しました。\n' +
    '1. メニュー「APIキーを設定」を実行してください。\n' +
    '2. 「設定」シートの「noteのRSS」に https://note.com/あなたのID/rss を入れると、公開済み記事を自動で取り込めます。'
  );
}

/** 「ネタ帳」シートを用意する（記事作成画面からも呼ぶので、初期設定を忘れていても作られる） */
function ensureIdeasSheet_(ss) {
  const ideas = ensureSheet_(ss || SpreadsheetApp.getActiveSpreadsheet(), APP.SHEETS.IDEAS, IDEA_COLS);
  setListValidation_(ideas, '種別', ARTICLE_TYPES);
  setListValidation_(ideas, 'ステータス', IDEA_STATUSES);
  setColumnWidthByName_(ideas, '記事のイメージ', 240);
  setColumnWidthByName_(ideas, 'コード', 300);
  setColumnWidthByName_(ideas, 'チェック', 260);
  // コードと分析結果は長いので、折り返さず1行の高さのまま表示する
  const cols = headerMap_(ideas);
  ['コード', '分析結果'].forEach(name => {
    ideas.getRange(2, cols[name] + 1, ideas.getMaxRows() - 1, 1)
      .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setVerticalAlignment('top');
  });
  return ideas;
}

/** シートがなければ作成し、1行目に見出しを入れる。既存シートは足りない列だけ右端に追加する */
function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    headers.filter(h => !current.includes(h)).forEach(h => {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
    });
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#f1f3f4');
  return sheet;
}

/** 見出し名 → 列番号（0始まり）の対応表 */
function headerMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const map = {};
  headers.forEach((h, i) => { if (h !== '') map[h] = i; });
  return map;
}

/** 必要な列がそろっているか確認し、対応表を返す */
function requireColumns_(sheet, names) {
  const map = headerMap_(sheet);
  const missing = names.filter(n => map[n] === undefined);
  if (missing.length) {
    throw new Error(`「${sheet.getName()}」シートに列がありません：${missing.join('、')}。メニュー「初期設定」を実行してください。`);
  }
  return map;
}

function getSheetOrThrow_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(`「${name}」シートがありません。メニュー「初期設定」を実行してください。`);
  return sheet;
}

function setListValidation_(sheet, colName, values) {
  const col = headerMap_(sheet)[colName];
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
  sheet.getRange(2, col + 1, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
}

function setColumnWidthByName_(sheet, colName, width) {
  sheet.setColumnWidth(headerMap_(sheet)[colName] + 1, width);
}

/** 「設定」シートを {項目: 値} の形で読む。未入力の項目は初期値で補う */
function getSettings_() {
  const settings = {};
  DEFAULT_SETTINGS.forEach(([key, value]) => { settings[key] = value; });
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APP.SHEETS.SETTINGS);
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(([key, value]) => {
      if (key !== '' && value !== '') settings[key] = String(value).trim();
    });
  }
  return settings;
}

/** 選択中のセルが含まれる行番号（見出し行を除く）を昇順で返す。複数範囲の選択にも対応 */
function selectedDataRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const rows = new Set();
  const rangeList = sheet.getActiveRangeList();
  if (!rangeList) return [];
  rangeList.getRanges().forEach(r => {
    const end = Math.min(r.getRow() + r.getNumRows() - 1, lastRow);
    for (let row = Math.max(r.getRow(), 2); row <= end; row++) rows.add(row);
  });
  return Array.from(rows).sort((a, b) => a - b);
}

/** {列名: 値} から、シートの列の並びどおりの1行分の配列を作る（列は requireColumns_ で確認済みの前提） */
function buildRowByName_(cols, values) {
  const row = new Array(Math.max(...Object.values(cols)) + 1).fill('');
  Object.keys(values).forEach(name => { row[cols[name]] = values[name]; });
  return row;
}

/** シートの末尾に1行追加し、その行番号を返す */
function appendRowByName_(sheet, cols, values) {
  const row = buildRowByName_(cols, values);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  return sheet.getLastRow();
}

/** 記事IDを「A1, A2, …」の連番で振る（行を消しても重複しないよう、既存の最大値＋1にする） */
function nextArticleId_(articles) {
  const col = requireColumns_(articles, ['記事ID'])['記事ID'];
  let max = 0;
  if (articles.getLastRow() > 1) {
    articles.getRange(2, col + 1, articles.getLastRow() - 1, 1).getValues().forEach(([id]) => {
      const m = String(id).match(/^A(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    });
  }
  return `A${max + 1}`;
}

function formatNow_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
}

// ===== Menu.gs ========================================================

/**
 * スプレッドシートを開いたときに専用メニューを追加する
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('note×X')
    .addItem('① 初期設定（シート作成）', 'setupSheets')
    .addItem('② APIキーを設定', 'promptApiKey')
    .addSeparator()
    .addItem('GASから記事を作る（分析・価格診断・下書き）', 'openArticleDialog')
    .addItem('noteの新着記事を取り込む', 'importNoteArticles')
    .addSeparator()
    .addItem('記事：選択した記事からX投稿案を作成', 'generatePostsFromSelection')
    .addItem('X投稿：選択した投稿を再チェック', 'recheckSelectedPosts')
    .addSeparator()
    .addItem('今週の投稿予定を確認', 'showWeeklyStatus')
    .addItem('毎朝の自動処理を有効にする', 'enableDailyJobs')
    .addItem('毎朝の自動処理を停止する', 'disableDailyJobs')
    .addToUi();
}

// ===== Claude.gs ======================================================

/**
 * Claude API の呼び出し
 *
 * GAS には公式SDKがないため、UrlFetchApp で HTTP リクエストを直接送ります。
 * APIキーはコードやシートに書かず、スクリプトプロパティに保存します。
 */

/** メニューから APIキーを登録する */
function promptApiKey() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(
    'Claude APIキーの設定',
    'Anthropic Console で発行したAPIキー（sk-ant- で始まる文字列）を貼り付けてください。\n' +
    'キーはあなた本人だけが読める場所に保存され、シートや共同編集者には表示されません。',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const key = res.getResponseText().trim();
  if (!key.startsWith('sk-ant-')) {
    ui.alert('APIキーの形式が正しくないようです。sk-ant- で始まる文字列を貼り付けてください。');
    return;
  }
  PropertiesService.getUserProperties().setProperty(APP.PROP_API_KEY, key);
  PropertiesService.getScriptProperties().deleteProperty(APP.PROP_API_KEY); // 旧版の保存場所に残っていれば消す
  ui.alert('APIキーを保存しました。');
}

/**
 * APIキーを読む。キーは実行ユーザー本人だけが読める場所（ユーザープロパティ）に保存する。
 * スクリプトプロパティはスプレッドシートの編集者なら誰でも見られるため使わない（旧版で保存されていれば移す）
 */
function getApiKey_() {
  const userProps = PropertiesService.getUserProperties();
  let key = userProps.getProperty(APP.PROP_API_KEY);
  if (!key) {
    const scriptProps = PropertiesService.getScriptProperties();
    key = scriptProps.getProperty(APP.PROP_API_KEY);
    if (key) {
      userProps.setProperty(APP.PROP_API_KEY, key);
      scriptProps.deleteProperty(APP.PROP_API_KEY);
    }
  }
  return key;
}

/**
 * Claude に JSON 形式で回答させる
 * @param {{model: string, effort: string, system: string, user: string, schema: Object, maxTokens?: number}} opts
 * @return {Object} schema に沿ってパースした結果
 */
function callClaudeJson_(opts) {
  const apiKey = getApiKey_();
  if (!apiKey) throw new Error('APIキーが未設定です。メニュー「APIキーを設定」から登録してください。');

  const request = buildClaudeRequest_(opts, apiKey);
  const response = fetchWithRetry_(request);
  return parseClaudeJson_(response.getResponseCode(), response.getContentText());
}

/** UrlFetchApp に渡すリクエストを組み立てる（テストしやすいよう分離） */
function buildClaudeRequest_(opts, apiKey) {
  const payload = {
    model: opts.model,
    max_tokens: opts.maxTokens || 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: opts.effort,
      format: { type: 'json_schema', schema: opts.schema },
    },
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  };
  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': APP.API_VERSION,
  };
  if (APP.FALLBACK_MODELS.includes(opts.model)) {
    payload.fallbacks = 'default';
    headers['anthropic-beta'] = APP.FALLBACK_BETA;
  }
  return {
    url: APP.API_URL,
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
}

/** 混雑（429）やサーバーエラー（5xx）のときだけ、間隔を空けて最大3回まで試す */
function fetchWithRetry_(request) {
  const maxAttempts = 3;
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = UrlFetchApp.fetch(request.url, request);
    } catch (e) {
      // GAS の通信は約60秒で打ち切られる。再試行しても同じなので、対処方法を伝えて止める
      if (/timeout|timed out|タイムアウト/i.test(e.message)) {
        throw new Error('AIの応答が時間切れ（約60秒）になりました。もう一度実行するか、「設定」シートの effort を low にする、またはモデルを claude-sonnet-5-5 に変えると速くなります。');
      }
      throw e;
    }
    const code = response.getResponseCode();
    const retryable = code === 429 || code >= 500;
    if (!retryable || attempt >= maxAttempts) return response;
    const retryAfter = Number(response.getHeaders()['retry-after'] || response.getHeaders()['Retry-After']);
    const waitSec = retryAfter > 0 ? Math.min(retryAfter, 30) : Math.pow(2, attempt);
    Utilities.sleep(waitSec * 1000);
  }
}

/** API のレスポンスを確認して JSON を取り出す */
function parseClaudeJson_(code, bodyText) {
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (e) {
    throw new Error(`Claude API から想定外の応答がありました（HTTP ${code}）`);
  }
  if (code !== 200) {
    const message = body.error && body.error.message ? body.error.message : bodyText;
    if (code === 401) throw new Error('APIキーが無効です。メニュー「APIキーを設定」で登録し直してください。');
    if (code === 429) throw new Error('APIの利用上限に達しました。時間をおいて再実行してください。');
    throw new Error(`Claude API エラー（HTTP ${code}）：${message}`);
  }
  if (body.stop_reason === 'refusal') {
    const category = body.stop_details && body.stop_details.category ? `（${body.stop_details.category}）` : '';
    throw new Error(`Claude が回答を見送りました${category}。記事の本文・要点の書き方を見直してください。`);
  }
  if (body.stop_reason === 'max_tokens') {
    throw new Error('回答が途中で切れました。1記事あたりの案数を減らして再実行してください。');
  }
  const text = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (body.usage) {
    console.log(`Claude usage: input=${body.usage.input_tokens}, output=${body.usage.output_tokens}, model=${body.model}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Claude の回答をJSONとして読み取れませんでした。もう一度実行してください。');
  }
}

// ===== Prompts.gs =====================================================

/**
 * Claude に渡す指示文（プロンプト）と回答の形式
 *
 * 文体やNGワードなど運用で変える部分は「設定」シートから読み込みます。
 * ここには「変えない方針」だけを書いています。
 */

function buildSystemPrompt_(settings) {
  return [
    'あなたは、noteで業務効率化ツールを販売している個人の発信を手伝う編集者です。',
    'noteの記事をもとに、X（旧Twitter）に投稿する日本語の文案を作ります。',
    '',
    '## 発信者',
    settings['発信者プロフィール'],
    '',
    '## 文体',
    settings['文体'],
    `ハッシュタグ：${settings['ハッシュタグ方針']}`,
    '',
    '## 守ること',
    '- 1投稿の本文は全角140字以内。include_link を true にする投稿は、URLが末尾に自動で付くので本文を全角120字以内にする。',
    '- 本文にURLを書かない。記事へのリンクが必要な投稿は include_link を true にする。',
    '- 記事に書かれていない事実や数字を作らない。時間短縮などの数字は記事にあるものだけを使う。',
    '- 個別の税務相談に応じるような表現や、税額・節税効果を断定する表現は使わない。発信者は税理士ではない。',
    '- 顧問先や勤務先を特定できる情報は書かない。',
    '- 「絶対」「必ず」などの誇張や、不安をあおる表現は使わない。',
    '- リンク付きの告知は多くても1本にする。ほかの投稿は、記事を読まなくても役に立つ内容（手順のコツ、よくある失敗、問いかけなど）にする。',
    '- 投稿どうしで切り口と書き出しを変える。',
    '',
    '## 分類',
    `pillar（発信の柱）：${PILLARS.join(' / ')}`,
    `post_type（型）：${POST_TYPES.join(' / ')}`,
    'intent には、その投稿で読者に何をしてほしいかを1文で書く。',
  ].join('\n');
}

function buildUserPrompt_(article, count) {
  return [
    `次のnote記事をもとに、X投稿案を${count}本作ってください。`,
    '',
    `タイトル：${article.title}`,
    `種別：${article.type || '未記入'}${article.price ? `（${article.price}円）` : ''}`,
    `リンク：${article.url ? 'あり' : 'なし（include_link は false にする）'}`,
    '',
    '## 記事の本文・要点',
    article.body,
  ].join('\n');
}

/** 回答の形式（JSON Schema）。この形以外の回答はAPI側で生成されない */
function buildPostsSchema_() {
  return {
    type: 'object',
    properties: {
      posts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pillar: { type: 'string', enum: PILLARS },
            post_type: { type: 'string', enum: POST_TYPES },
            text: { type: 'string' },
            include_link: { type: 'boolean' },
            intent: { type: 'string' },
          },
          required: ['pillar', 'post_type', 'text', 'include_link', 'intent'],
          additionalProperties: false,
        },
      },
    },
    required: ['posts'],
    additionalProperties: false,
  };
}

// ===== ArticlePrompts.gs ==============================================

/**
 * 記事づくり（GASを貼る → 仕組みの分析・価格診断 → 下書き）で Claude に渡す指示と回答の形式
 *
 * GAS の通信は1回約60秒で打ち切られるため、「分析 → 無料エリア → 有料エリア」に分けて呼びます。
 */

// 価格の目安。AIはこの表と既存記事の価格帯をもとに価格を診断する
const PRICE_GUIDE = [
  '- 無料：数十行の単機能、または集客のための入口記事。フォローや有料記事への導線が目的',
  '- 480〜980円：単機能で、慣れた人なら30分ほどで自作できる。毎月数分の作業を省く',
  '- 1,480〜1,980円：実務の手順を丸ごと置き換える。エラー処理や設定項目があり、導入手順の解説が必要',
  '- 2,480〜2,980円：複数シートやトリガー、外部サービスとの連携があり、自作すると数日かかる。サポート1回付き',
  '- 4,980円以上：事務所内で共有できる版、複数ツールのセット、テンプレートシート付きなど',
].join('\n');

function buildArticleSystemPrompt_(settings) {
  const sample = settings['記事のお手本（任意）'];
  return [
    'あなたは、noteで業務効率化のGASツールを販売している個人の、記事づくりと価格設定を手伝う編集者です。',
    '発信者が過去に作ったGASコードを読み、仕組みを理解したうえで、ツールを紹介・販売するnote記事を作ります。',
    '',
    '## 発信者',
    settings['発信者プロフィール'],
    '',
    '## 文体',
    settings['文体'],
    '',
    '## 守ること',
    '- 書いてよい事実は、コードと発信者のメモから読み取れることだけ。コードにない機能を書かない。',
    '- 作業時間・件数・削減効果など、コードから分からない数字は作らず【要確認：〇〇】と書く。発信者があとで埋める。',
    '- 個別の税務相談に応じる表現や、税額・節税効果を断定する表現は使わない。発信者は税理士ではない。',
    '- 顧問先・勤務先を特定できる情報は書かない。例に出す会社名は「サンプル株式会社」などにする。',
    '- 誇張や、不安をあおる表現は使わない。',
    '- 本文は Markdown で書く（見出し「## 」「### 」、箇条書き「- 」、手順「1. 」、コードは ``` で囲む）。',
    '',
    '## 記事の型',
    '悩みのチェックリスト → Before/After（手作業の手順と所要時間 → ツール導入後）→ 全体の流れ → コード → つまずきやすいポイント →（有料記事なら）有料エリアの見出しと中身。',
    '',
    '## 価格の目安',
    PRICE_GUIDE,
    sample ? `\n## 文体のお手本（書き方・語り口だけを寄せる。内容は真似しない）\n${sample}` : '',
  ].join('\n');
}

/** 入力内容（コード・イメージ・種別・価格）をプロンプト用にまとめる */
function buildIdeaBlock_(idea) {
  const wish = [];
  wish.push(`記事の種別：${idea.type && idea.type !== 'おまかせ' ? idea.type : 'おまかせ（提案してほしい）'}`);
  wish.push(`価格：${idea.price ? `${idea.price}円で考えている（妥当か評価してほしい）` : '未定（提案してほしい）'}`);
  return [
    '## 発信者の希望',
    ...wish,
    '',
    '## 記事のイメージ（発信者のメモ）',
    idea.image || '（なし）',
    '',
    '## コード',
    '```javascript',
    idea.code,
    '```',
  ].join('\n');
}

function buildArticleAnalyzePrompt_(idea) {
  return [
    'このGASコードを読み、次をまとめてください。',
    '1. 仕組みの理解：何をするツールか、処理の流れ、主な関数の役割、使う前に必要な準備（シート構成・権限・トリガーなど）',
    '2. 記事の設計：想定読者、悩み、Before/After、タイトル案、無料で見せる範囲と有料で提供する範囲',
    '3. 価格の診断：「価格の目安」をもとに、おすすめの種別と価格、価格の幅、その理由を具体的に。発信者が価格を指定している場合は price.assessment で妥当か評価する。価値を上げて高く売るための工夫も挙げる',
    '記事のイメージが書かれていれば、切り口や強調点はそれに合わせる。',
    '',
    buildIdeaBlock_(idea),
  ].join('\n');
}

function buildArticleAnalyzeSchema_() {
  const str = { type: 'string' };
  const int = { type: 'integer' };
  const list = { type: 'array', items: { type: 'string' } };
  const obj = props => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });
  return obj({
    mechanism_summary: str,
    flow: list,
    functions: { type: 'array', items: obj({ name: str, role: str }) },
    required_setup: list,
    target_reader: str,
    pains: list,
    before_steps: list,
    after_summary: str,
    title: str,
    title_alternatives: list,
    recommended_type: { type: 'string', enum: ARTICLE_TYPES },
    type_reason: str,
    price: obj({
      recommended: int,
      low: int,
      high: int,
      reasons: list,
      assessment: str,
      value_up_ideas: list,
    }),
    free_scope: str,
    paid_scope: str,
    config_items: list,
    pitfalls: list,
  });
}

/** 無料記事の本文、または有料記事の無料エリア */
function buildArticleFreePrompt_(idea, plan, type) {
  const isFree = type === '無料';
  return [
    isFree
      ? '次の分析をもとに、無料のnote記事の本文を書いてください。'
      : '次の分析をもとに、note記事の「無料エリア」の本文を書いてください。',
    '- 記事タイトルは書かず、導入の段落から始める。',
    isFree
      ? '- コード全文は書き写さず、その位置に「【ここにコード全文を貼る】」と書く。導入手順と、設定を変える箇所の説明は本文に含める。'
      : type === '有料（無料コードあり）'
        ? '- 無料で見せるコードは、下のコードから free_scope の部分をそのまま抜き出す（書き換えたり、新しい処理を足したりしない）。'
        : '- コードは冒頭の数行だけを、下のコードからそのまま抜き出して見せる。',
    isFree
      ? '- 最後に、ほかの記事やフォローにつながる一言で締める。'
      : '- 最後は「## ここから先は有料」の見出しで、有料エリアで手に入るものを箇条書きで紹介して終える。',
    `- コードを除いて${isFree ? '2,500〜3,500' : '2,000〜3,000'}字。`,
    '',
    '## 分析',
    JSON.stringify(plan, null, 2),
    '',
    buildIdeaBlock_(idea),
  ].join('\n');
}

function buildArticlePaidPrompt_(idea, plan) {
  return [
    '次の分析をもとに、note記事の「有料エリア」の本文を書いてください。',
    '- 完全版のコードは書き写さず、その位置に「【ここに完全版コードを貼る】」とだけ書く。',
    '- 含める見出し：導入手順（required_setup にあるものだけ）／設定項目の説明／処理の解説（関数名を出して要所だけ）／よくあるエラーと対処／自分の業務に合わせて変える方法。',
    '- サポートの範囲や問い合わせ先は書かない（あとで定型文を自動で付ける）。',
    '- 1,500〜2,500字。',
    '',
    '## 分析',
    JSON.stringify(plan, null, 2),
    '',
    buildIdeaBlock_(idea),
  ].join('\n');
}

function buildMarkdownSchema_() {
  return {
    type: 'object',
    properties: { markdown: { type: 'string' } },
    required: ['markdown'],
    additionalProperties: false,
  };
}

/** 下書きドキュメントの本文を組み立てる（無料記事は有料エリアなし） */
function assembleDraftMarkdown_(meta, freeMd, paidMd) {
  const header = [
    '> 【下書き】AIが作成しました。【要確認】の箇所を埋め、内容を確認してから公開してください。',
    `> 種別：${meta.type}` + (meta.type === '無料' ? '' : ` ／ 価格：${formatYen_(meta.price)}（noteの公開設定で入力）`),
    `> タイトル案：${[meta.title].concat(meta.titleAlternatives || []).join(' ／ ')}`,
    '',
    `# ${meta.title}`,
    '',
    freeMd.trim(),
  ];
  if (meta.type !== '無料' && paidMd) {
    header.push('', '---', '', '## ▼▼▼ ここから有料エリア ▼▼▼', '', paidMd.trim());
    // サポートの約束は記事ごとにぶれないよう、AIに書かせず「設定」シートの文面をそのまま入れる
    if (meta.support) header.push('', '## サポートについて', '', String(meta.support).trim());
  }
  return header.join('\n');
}

/** 「1,980円」「１９８０」などを数値に。読めなければ空文字 */
function normalizePrice_(value) {
  const digits = String(value === undefined || value === null ? '' : value).normalize('NFKC').replace(/[^\d]/g, '');
  return digits ? Number(digits) : '';
}

function formatYen_(price) {
  return price === '' || price === undefined || price === null ? '未定' : `${String(Number(price)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}円`;
}

// ===== Checks.gs ======================================================

/**
 * 投稿文のチェック（文字数・NGワードなど）
 *
 * ここの関数はスプレッドシートを使わないので、Node.js で単体テストできます（tests/ を参照）。
 */

/**
 * X の文字数カウント（全角は2、半角は1、URLは一律23）
 * 絵文字の結合文字などは実際より多めに数えるため、ここで280以内なら投稿できます。
 */
function countXWeight_(text) {
  const urlRe = /https?:\/\/[^\s　]+/g;
  const urls = String(text).match(urlRe) || [];
  let weight = urls.length * APP.X_URL_WEIGHT;
  for (const ch of String(text).replace(urlRe, '')) {
    weight += isHalfWidthForX_(ch.codePointAt(0)) ? 1 : 2;
  }
  return weight;
}

/** X で1文字＝1と数える範囲（英数字・記号・一部の句読点） */
function isHalfWidthForX_(cp) {
  return cp <= 0x10FF ||
    (cp >= 0x2000 && cp <= 0x200D) ||
    (cp >= 0x2010 && cp <= 0x201F) ||
    (cp >= 0x2032 && cp <= 0x2037);
}

/** 実際に投稿される文面（本文＋改行＋リンク） */
function composePostText_(body, link) {
  return link ? `${body}\n${link}` : String(body);
}

/**
 * 投稿1件をチェックする
 * @return {{weight: number, result: string}} result は「OK」または警告をつなげた文字列
 */
function checkPost_(body, link, ngWordsCsv) {
  const warnings = [];
  const text = String(body || '').trim();
  if (!text) return { weight: 0, result: '本文が空です' };

  const weight = countXWeight_(composePostText_(text, link));
  if (weight > APP.X_MAX_WEIGHT) warnings.push(`文字数超過（${weight}/${APP.X_MAX_WEIGHT}）`);

  const ngWords = String(ngWordsCsv || '').split(/[,、]/).map(w => w.trim()).filter(Boolean);
  const hits = ngWords.filter(w => text.includes(w));
  if (hits.length) warnings.push(`NGワード：${hits.join('・')}`);

  if (link && /https?:\/\//.test(text)) warnings.push('本文にもURLがあります（リンク列と重複）');

  const tags = text.match(/[#＃][^\s#＃]+/g) || [];
  if (tags.length > 2) warnings.push(`ハッシュタグが多すぎます（${tags.length}個）`);

  return { weight: weight, result: warnings.length ? warnings.join('／') : 'OK' };
}

// ===== Sanitize.gs ====================================================

/**
 * 送信前チェック：貼り付けたコードに、外部（Claude）へ送るべきでない情報が含まれていないか調べ、自動で置き換える
 *
 * フォルダID・メールアドレス・会社名などを「YOUR_FOLDER_ID_1」「user1@example.com」「サンプル株式会社」のような
 * ダミーに置き換えてから送ります。同じ値は同じダミーに置き換えるので、コードの意味は保たれます。
 * 置き換え後のコードは、そのまま記事に載せても安全な形になります。
 * 「サンプル株式会社」「test@example.com」のような、明らかなダミーは対象外です。
 * 人名など、決まった形のない情報は見つけられないので、貼る前に目でも確認してください。
 */

const LEGAL_FORMS = /株式会社|有限会社|合同会社|税理士法人|医療法人|社会福祉法人/;
const nth_ = n => (n > 1 ? String(n) : '');

// mask：見つかった文字列（hit）と、その種類で何件目か（n）から、置き換え後の文字列を作る
const SENSITIVE_PATTERNS = [
  { label: 'メールアドレス', re: /[\w.+-]+@[\w-]+(\.[\w-]+)+/g, allow: /@example\.(com|jp|org)$|^(test|sample|user|your|foo)[\w.+-]*@/i,
    mask: (hit, n) => `user${n}@example.com` },
  { label: 'APIキー・トークン', re: /sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|ghp_[A-Za-z0-9]{20,}/g,
    mask: (hit, n) => `YOUR_API_KEY${nth_(n)}` },
  { label: 'パスワード・秘密情報', re: /(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"\s]{6,}['"]/gi, allow: /YOUR_/,
    mask: hit => hit.replace(/(['"])[^'"\s]{6,}(['"])$/, '$1YOUR_SECRET$2') },
  { label: 'GoogleドライブのURL', re: /https:\/\/(docs|drive)\.google\.com\/[^\s'"`)]*\/(d|folders)\/[A-Za-z0-9_-]{20,}/g,
    mask: (hit, n) => hit.replace(/\/(d|folders)\/[A-Za-z0-9_-]{20,}$/, (m, kind) => `/${kind}/${kind === 'folders' ? 'YOUR_FOLDER_ID' : 'YOUR_FILE_ID'}_${n}`) },
  { label: 'ファイル・フォルダID', re: /['"`][A-Za-z0-9_-]{25,}['"`]/g,
    mask: (hit, n) => `${hit[0]}YOUR_ID_${n}${hit[hit.length - 1]}` },
  { label: '電話番号', re: /0\d{1,4}-\d{1,4}-\d{3,4}/g, allow: /^0{2,}|0000|1234-5678/,
    mask: () => '03-0000-0000' },
  { label: 'マイナンバー・法人番号', re: /(?<![\d.])\d{12,13}(?![\d.])/g, allow: /^0+$/,
    mask: hit => '0'.repeat(hit.length) },
  { label: '口座番号', re: /(普通|当座|口座(番号)?)\s*[:：]?\s*\d{7}/g, allow: /0000000/,
    mask: hit => hit.replace(/\d{7}$/, '0000000') },
  { label: '郵便番号', re: /〒\s*\d{3}-?\d{4}|(?<![\d-])\d{3}-\d{4}(?![\d-])/g, allow: /000-0000|123-4567/,
    mask: hit => (hit.startsWith('〒') ? '〒000-0000' : '000-0000') },
  { label: '住所', re: /(北海道|東京都|京都府|大阪府|[^\s'"`、。]{2,3}県)[^\s'"`、。]{1,8}?[市区町村郡]/g, allow: /サンプル|テスト|〇〇|○○|例/,
    mask: () => '〇〇県〇〇市' },
  { label: '会社名', re: /(株式会社|有限会社|合同会社|税理士法人|医療法人|社会福祉法人)[^\s'"`、。,）)]{1,12}|[^\s'"`、。,（(]{1,12}(株式会社|有限会社|合同会社|税理士法人|医療法人)/g, allow: /サンプル|テスト|〇〇|○○|ＡＢＣ|ABC|XYZ|例|架空|ダミー/,
    mask: (hit, n) => {
      const form = hit.match(LEGAL_FORMS)[0];
      return hit.startsWith(form) ? `${form}サンプル${nth_(n)}` : `サンプル${nth_(n)}${form}`;
    } },
];

/**
 * 外部に送るべきでない情報を探す（置き換えはしない）
 * @return {Array<{label: string, sample: string}>} 見つかった項目（同じ文字列は1回だけ）
 */
function findSensitive_(text) {
  const found = [];
  const seen = new Set();
  SENSITIVE_PATTERNS.forEach(p => {
    (String(text).match(p.re) || []).forEach(hit => {
      if (p.allow && p.allow.test(hit)) return;
      const key = `${p.label}:${hit}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push({ label: p.label, sample: truncate_(hit) });
    });
  });
  return found;
}

/**
 * 見つかった情報をダミーに置き換える
 * @return {{text: string, replacements: Array<{label: string, before: string, after: string}>}}
 */
function maskSensitive_(text) {
  let result = String(text);
  const replacements = [];
  SENSITIVE_PATTERNS.forEach(p => {
    const mapping = new Map(); // 同じ値には同じダミーを使う
    result = result.replace(p.re, hit => {
      if (p.allow && p.allow.test(hit)) return hit;
      if (!mapping.has(hit)) {
        const after = p.mask(hit, mapping.size + 1);
        mapping.set(hit, after);
        replacements.push({ label: p.label, before: truncate_(hit), after: after });
      }
      return mapping.get(hit);
    });
  });
  return { text: result, replacements: replacements };
}

/** チェック列に書く文章 */
function describeReplacements_(replacements) {
  if (!replacements.length) return 'OK';
  const counts = {};
  replacements.forEach(r => { counts[r.label] = (counts[r.label] || 0) + 1; });
  return '自動で置き換え：' + Object.keys(counts).map(l => `${l} ${counts[l]}件`).join('、');
}

function truncate_(text) {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

// ===== Docs.gs ========================================================

/**
 * 記事の下書きを Google ドキュメントとして保存する
 *
 * Markdown を HTML に変換し、Drive API（拡張サービス）で Google ドキュメントに取り込みます。
 * 権限は「このツールが作ったファイルだけ」を扱う drive.file なので、ほかのファイルには触れません。
 */

/** @return {string} 作成したドキュメントのURL */
function createDraftDoc_(title, markdown) {
  if (typeof Drive === 'undefined') {
    throw new Error('Drive API が有効になっていません。Apps Script エディタ左の「サービス」の＋から「Drive API」（v3）を追加してください。');
  }
  const html = markdownToHtml_(markdown);
  const blob = Utilities.newBlob(html, 'text/html', 'draft.html');
  const file = Drive.Files.create({ name: title, mimeType: 'application/vnd.google-apps.document' }, blob);
  return `https://docs.google.com/document/d/${file.id}/edit`;
}

/** 記事で使う範囲の Markdown（見出し・箇条書き・コード・引用・太字）を HTML に変換する */
function markdownToHtml_(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let paragraph = [];
  let list = null; // 'ul' または 'ol'
  let code = null; // コードブロック中の行

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inlineToHtml_).join('<br>')}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  lines.forEach(line => {
    if (code !== null) {
      if (/^```/.test(line)) {
        out.push(`<pre style="font-family:'Courier New',monospace;background:#f5f5f5">${code.map(escapeHtml_).join('\n')}</pre>`);
        code = null;
      } else {
        code.push(line);
      }
      return;
    }
    if (/^```/.test(line)) { flushParagraph(); closeList(); code = []; return; }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*・]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)．]\s+(.*)$/);
    if (heading) {
      flushParagraph(); closeList();
      out.push(`<h${heading[1].length}>${inlineToHtml_(heading[2])}</h${heading[1].length}>`);
    } else if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (list !== type) { closeList(); out.push(`<${type}>`); list = type; }
      out.push(`<li>${inlineToHtml_((bullet || numbered)[1])}</li>`);
    } else if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph(); closeList();
      out.push('<hr>');
    } else if (/^>\s?/.test(line)) {
      flushParagraph(); closeList();
      out.push(`<blockquote>${inlineToHtml_(line.replace(/^>\s?/, ''))}</blockquote>`);
    } else if (line.trim() === '') {
      flushParagraph(); closeList();
    } else {
      closeList();
      paragraph.push(line);
    }
  });
  if (code !== null) out.push(`<pre>${code.map(escapeHtml_).join('\n')}</pre>`);
  flushParagraph();
  closeList();
  return `<html><head><meta charset="UTF-8"></head><body>${out.join('\n')}</body></html>`;
}

function inlineToHtml_(text) {
  return escapeHtml_(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function escapeHtml_(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== Posts.gs =======================================================

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

// ===== Ideas.gs =======================================================

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

// ===== Rss.gs =========================================================

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

// ===== Reminder.gs ====================================================

/**
 * 毎朝の自動処理：noteの新着記事の取り込み ＋ 投稿予定のリマインド
 *
 * 今後7日間に予定している投稿（推敲済・予約済）が目標本数に足りないとき、メールで知らせます。
 */

/** メニューから実行：今週の状況を画面に表示する */
function showWeeklyStatus() {
  SpreadsheetApp.getUi().alert(buildWeeklyStatus_().message);
}

/** 毎朝のトリガーから実行：新着記事を取り込み、知らせることがあるときだけメールを送る */
function dailyJobs() {
  const settings = getSettings_();
  const notes = [];
  if (settings['noteのRSS']) {
    try {
      const r = importNoteArticles_(settings);
      if (r.added.length) notes.push(`noteの新着記事を取り込みました：${r.added.join('、')}`);
      if (r.linked.length) notes.push(`下書きにURLを紐づけました：${r.linked.join('、')}`);
      if (r.postsCreated) notes.push(`X投稿案を${r.postsCreated}件作りました。「X投稿」シートで推敲してください。`);
      notes.push(...r.errors);
    } catch (e) {
      notes.push(`noteの取り込みに失敗しました：${e.message}`);
    }
  }
  const status = buildWeeklyStatus_();
  if (!status.shortage && !notes.length) return;

  const to = settings['リマインド送信先'] || Session.getEffectiveUser().getEmail();
  const subject = status.shortage ? '【X投稿】今週の予定が不足しています' : '【X投稿】新着記事を取り込みました';
  const body = [status.message].concat(notes.length ? ['', ...notes] : [], ['', SpreadsheetApp.getActiveSpreadsheet().getUrl()]).join('\n');
  MailApp.sendEmail(to, subject, body);
}

function buildWeeklyStatus_() {
  const posts = getSheetOrThrow_(APP.SHEETS.POSTS);
  const cols = requireColumns_(posts, ['ステータス', '予定日時']);
  const settings = getSettings_();
  const target = parseInt(settings['週あたり目標投稿数'], 10) || 4;

  const now = new Date();
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  let scheduled = 0;
  let unscheduledReady = 0;
  let drafts = 0;
  if (posts.getLastRow() > 1) {
    posts.getRange(2, 1, posts.getLastRow() - 1, posts.getLastColumn()).getValues().forEach(r => {
      const status = r[cols['ステータス']];
      const date = r[cols['予定日時']];
      if (status === '案') drafts++;
      if (status !== '推敲済' && status !== '予約済') return;
      if (date instanceof Date && date >= now && date <= weekLater) scheduled++;
      else if (!(date instanceof Date)) unscheduledReady++;
    });
  }

  const shortage = Math.max(target - scheduled, 0);
  const lines = [
    `今後7日間の予定：${scheduled}本（目標${target}本）`,
    `推敲済で日時が未定：${unscheduledReady}本`,
    `未推敲の案：${drafts}本`,
  ];
  if (shortage) {
    lines.push('', `あと${shortage}本必要です。` +
      (unscheduledReady + drafts > 0 ? '手持ちの案を推敲して予定日時を入れましょう。' : '記事を選んで投稿案を作成しましょう。'));
  }
  return { shortage: shortage, message: lines.join('\n') };
}

/** 毎朝8時台の自動処理を有効にする（重複して登録しない） */
function enableDailyJobs() {
  removeDailyTriggers_();
  ScriptApp.newTrigger('dailyJobs').timeBased().everyDays(1).atHour(8).create();
  SpreadsheetApp.getUi().alert(
    '毎朝8時台に次の処理を行います。\n' +
    '・noteの新着記事を取り込み、X投稿案を作る（「設定」の「noteのRSS」が入っている場合）\n' +
    '・今後7日間の投稿予定が目標より少なければメールで知らせる'
  );
}

function disableDailyJobs() {
  removeDailyTriggers_();
  SpreadsheetApp.getUi().alert('毎朝の自動処理を停止しました。');
}

function removeDailyTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'dailyJobs')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

// ===== ArticleDialog.html（埋め込み）========================================

const ARTICLE_DIALOG_HTML = "<!DOCTYPE html>\n<html>\n<head>\n<base target=\"_top\">\n<meta charset=\"UTF-8\">\n<style>\n  :root { --ink:#202124; --sub:#5f6368; --line:#dadce0; --bg:#f8f9fa; --accent:#1a73e8; --ok:#188038; --warn:#b3261e; }\n  * { box-sizing: border-box; }\n  body { font-family: \"Hiragino Sans\", \"Noto Sans JP\", Meiryo, sans-serif; color: var(--ink); margin: 0; font-size: 14px; line-height: 1.6; }\n  .wrap { padding: 4px 8px 80px; }\n  .steps { display: flex; gap: 8px; margin-bottom: 16px; }\n  .steps div { flex: 1; padding: 6px 10px; border-radius: 6px; background: var(--bg); color: var(--sub); font-size: 13px; }\n  .steps div.on { background: #e8f0fe; color: var(--accent); font-weight: bold; }\n  h3 { font-size: 15px; margin: 18px 0 6px; }\n  label.hint, .hint { color: var(--sub); font-size: 12px; }\n  textarea, input[type=text], input[type=number], select { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 8px; font-size: 13px; font-family: inherit; }\n  textarea.code { font-family: Consolas, \"Courier New\", monospace; height: 220px; white-space: pre; }\n  textarea.image { height: 90px; }\n  .row { display: flex; gap: 16px; }\n  .row > div { flex: 1; }\n  .types label { display: inline-block; margin: 4px 14px 4px 0; cursor: pointer; }\n  .bar { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-top: 1px solid var(--line); padding: 10px 16px; display: flex; gap: 10px; align-items: center; }\n  button { border: 0; border-radius: 6px; padding: 9px 18px; font-size: 14px; cursor: pointer; }\n  button.primary { background: var(--accent); color: #fff; }\n  button.ghost { background: var(--bg); color: var(--ink); }\n  button:disabled { opacity: .5; cursor: default; }\n  .status { color: var(--sub); font-size: 13px; }\n  .error { background: #fce8e6; color: var(--warn); padding: 10px 12px; border-radius: 6px; margin: 10px 0; white-space: pre-wrap; }\n  .notice { background: #e6f4ea; color: #0d652d; padding: 10px 12px; border-radius: 6px; margin: 10px 0; font-size: 13px; }\n  .notice code { background: #fff; padding: 0 4px; border-radius: 3px; }\n  .card { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin: 10px 0; }\n  .price { display: flex; align-items: baseline; gap: 12px; }\n  .price .big { font-size: 28px; font-weight: bold; color: var(--accent); }\n  ul { margin: 4px 0; padding-left: 20px; }\n  .hidden { display: none; }\n  .done a { font-size: 15px; font-weight: bold; color: var(--accent); }\n  .progress li.now { color: var(--accent); font-weight: bold; }\n  .progress li.ok { color: var(--ok); }\n</style>\n</head>\n<body>\n<div class=\"wrap\">\n  <div class=\"steps\"><div id=\"s1\" class=\"on\">1. GASを貼る</div><div id=\"s2\">2. 分析・価格診断</div><div id=\"s3\">3. 下書き作成</div></div>\n  <div id=\"err\" class=\"error hidden\"></div>\n  <div id=\"notice\" class=\"notice hidden\"></div>\n\n  <!-- 段階1：入力 -->\n  <section id=\"step1\">\n    <h3>GASのコード</h3>\n    <textarea id=\"code\" class=\"code\" placeholder=\"過去に作ったGASをそのまま貼り付けてください。&#10;フォルダID・メールアドレス・会社名などは、送る前に自動でダミー（YOUR_FOLDER_ID_1 など）に置き換えます。\"></textarea>\n\n    <h3>記事のイメージ <span class=\"hint\">（任意・箇条書きでOK）</span></h3>\n    <textarea id=\"image\" class=\"image\" placeholder=\"例）&#10;・小さな事務所の経理担当向け&#10;・月初の作業が3分→数秒になったことを強調&#10;・初心者でも迷わないよう導入手順を丁寧に\"></textarea>\n\n    <div class=\"row\">\n      <div>\n        <h3>記事の種別</h3>\n        <div class=\"types\" id=\"types\"></div>\n      </div>\n      <div>\n        <h3>価格 <span class=\"hint\">（空欄ならAIが提案）</span></h3>\n        <input type=\"text\" id=\"price\" placeholder=\"例）1980\">\n        <div class=\"hint\">決めている価格を入れると、妥当かどうかも診断します。</div>\n      </div>\n    </div>\n  </section>\n\n  <!-- 段階2：分析結果 -->\n  <section id=\"step2\" class=\"hidden\">\n    <div class=\"card\">\n      <h3 style=\"margin-top:0\">このGASの仕組み</h3>\n      <div id=\"summary\"></div>\n      <div class=\"hint\" style=\"margin-top:6px\">処理の流れ</div>\n      <ul id=\"flow\"></ul>\n      <div class=\"hint\">使う前に必要な準備</div>\n      <ul id=\"setup\"></ul>\n    </div>\n\n    <div class=\"card\">\n      <h3 style=\"margin-top:0\">価格診断</h3>\n      <div class=\"price\"><span class=\"big\" id=\"recPrice\"></span><span id=\"range\" class=\"hint\"></span></div>\n      <div id=\"assessment\" style=\"margin:4px 0\"></div>\n      <div class=\"hint\">理由</div>\n      <ul id=\"reasons\"></ul>\n      <div class=\"hint\">もっと高く売るための工夫</div>\n      <ul id=\"valueUp\"></ul>\n      <div class=\"hint\">おすすめの種別：<b id=\"recType\"></b>　<span id=\"typeReason\"></span></div>\n    </div>\n\n    <div class=\"card\">\n      <h3 style=\"margin-top:0\">この内容で作る（自由に変更できます）</h3>\n      <div class=\"hint\">タイトル</div>\n      <select id=\"titleSelect\"></select>\n      <input type=\"text\" id=\"title\" style=\"margin-top:6px\">\n      <div class=\"row\" style=\"margin-top:8px\">\n        <div><div class=\"hint\">種別</div><select id=\"finalType\"></select></div>\n        <div id=\"finalPriceBox\"><div class=\"hint\">価格（円）</div><input type=\"number\" id=\"finalPrice\" min=\"0\" step=\"10\"></div>\n      </div>\n      <div class=\"hint\" style=\"margin-top:8px\">記事のイメージ（追記すると下書きに反映）</div>\n      <textarea id=\"image2\" class=\"image\"></textarea>\n      <div class=\"hint\" style=\"margin-top:6px\">想定読者：<span id=\"reader\"></span></div>\n    </div>\n  </section>\n\n  <!-- 段階3：下書き作成 -->\n  <section id=\"step3\" class=\"hidden\">\n    <h3>下書きを作成しています</h3>\n    <ol class=\"progress\" id=\"progress\"></ol>\n    <div id=\"done\" class=\"done hidden card\">\n      <div>下書きができました👇</div>\n      <a id=\"docLink\" href=\"#\" target=\"_blank\">Googleドキュメントを開く</a>\n      <ol style=\"margin-top:10px\">\n        <li>【要確認】の箇所を埋めて推敲する</li>\n        <li id=\"pasteCode\">【ここに完全版コードを貼る】に完全版のコードを貼る</li>\n        <li>noteに貼り付け、公開設定で種別と価格を入れて公開する</li>\n        <li>公開後は毎朝の自動処理（またはメニュー「noteの新着記事を取り込む」）でURLが紐づき、X投稿案も作られます</li>\n      </ol>\n    </div>\n  </section>\n</div>\n\n<div class=\"bar\">\n  <button class=\"ghost hidden\" id=\"back\" onclick=\"backToInput()\">← 入力に戻る</button>\n  <button class=\"primary\" id=\"next\" onclick=\"analyze()\">仕組みを分析して価格を診断</button>\n  <span class=\"status\" id=\"status\"></span>\n</div>\n\n<script>\n  var state = { row: null, plan: null };\n  var TYPES = [];\n\n  function $(id) { return document.getElementById(id); }\n  function show(id, on) { $(id).classList.toggle('hidden', !on); }\n  function esc(s) { return String(s == null ? '' : s).replace(/[&<>\"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]; }); }\n  function yen(n) { return (n === '' || n == null) ? '未定' : String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',') + '円'; }\n  function list(id, items) { $(id).innerHTML = (items || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join(''); }\n  function setStep(n) { [1, 2, 3].forEach(function (i) { $('s' + i).classList.toggle('on', i === n); show('step' + i, i === n); }); }\n  function busy(on, msg) { $('next').disabled = on; $('back').disabled = on; $('status').textContent = msg || ''; }\n  function error(msg) { $('err').textContent = msg; show('err', !!msg); }\n  function selectedType() { var r = document.querySelector('input[name=type]:checked'); return r ? r.value : 'おまかせ'; }\n  function call(fn, arg) {\n    return new Promise(function (resolve, reject) {\n      google.script.run.withSuccessHandler(resolve).withFailureHandler(function (e) { reject(e && e.message ? e.message : String(e)); })[fn](arg);\n    });\n  }\n\n  function init() {\n    busy(true, '読み込み中…');\n    call('articleDialogInit').then(function (res) {\n      TYPES = res.types;\n      $('types').innerHTML = ['おまかせ'].concat(TYPES).map(function (t, i) {\n        return '<label><input type=\"radio\" name=\"type\" value=\"' + esc(t) + '\"' + (i === 0 ? ' checked' : '') + '> ' + esc(t) + '</label>';\n      }).join('');\n      $('finalType').innerHTML = TYPES.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');\n      if (!res.hasApiKey) error('APIキーが未設定です。画面を閉じて、メニュー「② APIキーを設定」を先に実行してください。');\n      if (res.prefill) {\n        state.row = res.prefill.row;\n        $('code').value = res.prefill.code;\n        $('image').value = res.prefill.image;\n        $('price').value = res.prefill.price;\n        var r = document.querySelector('input[name=type][value=\"' + res.prefill.type + '\"]');\n        if (r) r.checked = true;\n        if (res.prefill.plan) { state.plan = res.prefill.plan; showPlan(); }\n      }\n      busy(false);\n    }).catch(function (e) { busy(false); error(e); });\n  }\n\n  function analyze() {\n    error('');\n    show('notice', false);\n    busy(true, '仕組みを読み解いています…（30秒ほど）');\n    call('articleAnalyze', {\n      row: state.row, code: $('code').value, image: $('image').value, type: selectedType(), price: $('price').value,\n    }).then(function (res) {\n      busy(false);\n      state.row = res.row;\n      // フォルダID・メールアドレス・会社名などはサーバー側でダミーに置き換え済み。画面の入力欄も置き換え後にそろえる\n      $('code').value = res.code;\n      $('image').value = res.image;\n      if (res.replacements && res.replacements.length) {\n        $('notice').innerHTML = '<b>次の情報をダミーに置き換えてから送りました（シートにも置き換え後だけを保存）。</b><ul>' +\n          res.replacements.map(function (r) { return '<li>' + esc(r.label) + '：' + esc(r.before) + ' → <code>' + esc(r.after) + '</code></li>'; }).join('') +\n          '</ul>記事に載るコードもこのダミーになります。人名など、形の決まっていない情報は自動では見つけられないので、目でも確認してください。';\n        show('notice', true);\n      }\n      state.plan = res.plan;\n      showPlan();\n    }).catch(function (e) { busy(false); error(e); });\n  }\n\n  function showPlan() {\n    var p = state.plan;\n    $('summary').textContent = p.mechanism_summary;\n    list('flow', p.flow);\n    list('setup', p.required_setup);\n    $('recPrice').textContent = yen(p.price.recommended);\n    $('range').textContent = '（目安 ' + yen(p.price.low) + '〜' + yen(p.price.high) + '）';\n    $('assessment').textContent = p.price.assessment || '';\n    list('reasons', p.price.reasons);\n    list('valueUp', p.price.value_up_ideas);\n    $('recType').textContent = p.recommended_type;\n    $('typeReason').textContent = p.type_reason;\n    $('reader').textContent = p.target_reader;\n\n    var titles = [p.title].concat(p.title_alternatives || []);\n    $('titleSelect').innerHTML = titles.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('');\n    $('titleSelect').onchange = function () { $('title').value = this.value; };\n    $('title').value = p.title;\n\n    var chosen = selectedType();\n    $('finalType').value = chosen === 'おまかせ' ? p.recommended_type : chosen;\n    var userPrice = $('price').value.replace(/[^\\d０-９]/g, '');\n    $('finalPrice').value = userPrice ? Number(userPrice.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })) : p.price.recommended;\n    $('finalType').onchange = togglePrice;\n    togglePrice();\n    $('image2').value = $('image').value;\n\n    setStep(2);\n    show('back', true);\n    $('next').textContent = 'この内容で下書きを作成';\n    $('next').onclick = writeDraft;\n  }\n\n  function togglePrice() { show('finalPriceBox', $('finalType').value !== '無料'); }\n\n  function backToInput() {\n    error('');\n    setStep(1);\n    show('back', false);\n    $('next').textContent = '仕組みを分析して価格を診断';\n    $('next').onclick = analyze;\n  }\n\n  function writeDraft() {\n    error('');\n    var type = $('finalType').value;\n    var base = { code: $('code').value, image: $('image2').value, type: type, price: $('finalPrice').value, plan: state.plan };\n    var steps = type === '無料'\n      ? [['free', '本文を書いています'], ['finish', 'Googleドキュメントを作成しています']]\n      : [['free', '無料エリアを書いています'], ['paid', '有料エリアを書いています'], ['finish', 'Googleドキュメントを作成しています']];\n    $('progress').innerHTML = steps.map(function (s, i) { return '<li id=\"p' + i + '\">' + s[1] + '</li>'; }).join('');\n    show('done', false);\n    setStep(3);\n    busy(true, '1〜3分ほどかかります。画面を閉じずにお待ちください。');\n\n    var out = {};\n    var chain = Promise.resolve();\n    steps.forEach(function (s, i) {\n      chain = chain.then(function () {\n        $('p' + i).className = 'now';\n        if (s[0] === 'finish') {\n          return call('articleFinish', {\n            row: state.row, title: $('title').value, type: type, price: $('finalPrice').value,\n            plan: state.plan, freeMd: out.free, paidMd: out.paid || '',\n          }).then(function (res) { out.doc = res; });\n        }\n        return call('articleWriteSection', Object.assign({ section: s[0] }, base)).then(function (md) { out[s[0]] = md; });\n      }).then(function () { $('p' + i).className = 'ok'; $('p' + i).textContent += ' ✓'; });\n    });\n    chain.then(function () {\n      busy(false, '');\n      $('docLink').href = out.doc.docUrl;\n      show('pasteCode', type !== '無料');\n      show('done', true);\n      $('next').textContent = '閉じる';\n      $('next').onclick = function () { google.script.host.close(); };\n      show('back', false);\n    }).catch(function (e) {\n      busy(false);\n      error(e + '\\n\\n「この内容で下書きを作成」をもう一度押すと、最初からやり直せます。');\n      setStep(2);\n    });\n  }\n\n  init();\n</script>\n</body>\n</html>\n";
