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

  const ideas = ensureSheet_(ss, APP.SHEETS.IDEAS, IDEA_COLS);
  setListValidation_(ideas, 'ステータス', IDEA_STATUSES);
  setColumnWidthByName_(ideas, 'ひとこと', 240);
  setColumnWidthByName_(ideas, 'コード', 360);
  setColumnWidthByName_(ideas, 'チェック', 280);
  // コードは折り返さず、1行の高さのまま表示する
  const ideaCols = headerMap_(ideas);
  ideas.getRange(2, ideaCols['コード'] + 1, ideas.getMaxRows() - 1, 1)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setVerticalAlignment('top');

  SpreadsheetApp.getUi().alert(
    '初期設定が完了しました。\n' +
    '1. メニュー「APIキーを設定」を実行してください。\n' +
    '2. 「設定」シートの「noteのRSS」に https://note.com/あなたのID/rss を入れると、公開済み記事を自動で取り込めます。'
  );
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
