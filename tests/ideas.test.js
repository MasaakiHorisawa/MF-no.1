/**
 * ネタ帳（記事の下書き）・送信前チェック・RSS取り込みのテスト
 * run-tests.js が GAS のコードと同じ環境に読み込んで実行します（test / assert / fetchQueue などはそちらで用意）。
 */
test('通信の時間切れは再試行せず、対処方法を伝える', () => {
  sleeps.length = 0;
  fetchQueue.push({ throw: 'Exception: Timeout: https://api.anthropic.com/v1/messages' });
  assert.throws(() => fetchWithRetry_({ url: 'u' }), /時間切れ（約60秒）.*claude-sonnet-5-5/);
  assert.strictEqual(fetchQueue.length, 0);
  assert.strictEqual(sleeps.length, 0);
});

test('送信前チェック：個人情報・ID・キー・法人名を見つける', () => {
  const code = [
    "const SHEET_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdEF';",
    "GmailApp.sendEmail('yamada@client-corp.co.jp', '件名', '本文');",
    "const key = 'sk-ant-api03-abcdefghijklmnopqrstu';",
    "const folder = 'https://drive.google.com/drive/folders/1xYzAbCdEfGhIjKlMnOpQrSt';",
    "// 担当：山田商事株式会社 03-1234-9876",
  ].join('\n');
  const labels = findSensitive_(code).map(f => f.label);
  ['ファイル・フォルダIDらしき文字列', 'メールアドレス', 'APIキー・トークン', 'GoogleドライブのURL', '法人名', '電話番号']
    .forEach(l => assert.ok(labels.includes(l), l + ' が検出されていない: ' + labels.join(',')));
  assert.match(describeSensitive_(findSensitive_(code)), /^送信前に置き換えてください：/);
});

test('送信前チェック：ダミーや一般的なコードは止めない', () => {
  const code = [
    "const CONFIG = { SHEET_ID: 'YOUR_SHEET_ID', TO: 'test@example.com' };",
    "const company = 'サンプル株式会社';",
    "const name = row[0].replace('株式会社', '');",
    "const model = 'claude-opus-5-5';",
    "sheet.getRange('A1:B10').setValues(values);",
  ].join('\n');
  assert.strictEqual(findSensitive_(code).length, 0, JSON.stringify(findSensitive_(code)));
});

test('Markdown を Google ドキュメント取り込み用の HTML にする', () => {
  const html = markdownToHtml_([
    '# タイトル', '', '導入です。', '2行目', '', '## こんな人におすすめ', '- 毎月コピペ', '- 転記ミス',
    '1. 拡張機能を開く', '2. 貼り付ける', '', '```javascript', 'if (a < b && c) { x = "y"; }', '```', '---', '> 注意', '**太字**と`code`',
  ].join('\n'));
  assert.match(html, /<h1>タイトル<\/h1>/);
  assert.match(html, /<p>導入です。<br>2行目<\/p>/);
  assert.match(html, /<ul>\n<li>毎月コピペ<\/li>\n<li>転記ミス<\/li>\n<\/ul>/);
  assert.match(html, /<ol>\n<li>拡張機能を開く<\/li>/);
  assert.match(html, /<pre[^>]*>if \(a &lt; b &amp;&amp; c\) \{ x = &quot;y&quot;; \}<\/pre>/);
  assert.match(html, /<hr>/);
  assert.match(html, /<blockquote>注意<\/blockquote>/);
  assert.match(html, /<b>太字<\/b>と<code>code<\/code>/);
});

test('記事の構成スキーマと下書きの組み立て', () => {
  const schema = buildArticlePlanSchema_();
  assert.strictEqual(schema.additionalProperties, false);
  assert.strictEqual(schema.required.length, Object.keys(schema.properties).length);
  const plan = { title: '出納帳の翌月シートを自動作成', title_alternatives: ['案2'], price_suggestion: '1,480円', price_reason: '理由' };
  const md = assembleDraftMarkdown_(plan, '無料の本文', '【ここに完全版コードを貼る】');
  assert.match(md, /価格案：1,480円/);
  assert.match(md, /# 出納帳の翌月シートを自動作成\n\n無料の本文\n\n---\n\n## ▼▼▼ ここから有料エリア ▼▼▼\n\n【ここに完全版コードを貼る】/);
});

test('記事用プロンプトにコード・メモ・お手本・守ることが入る', () => {
  const settings = {};
  DEFAULT_SETTINGS.forEach(([k, v]) => { settings[k] = v; });
  assert.doesNotMatch(buildArticleSystemPrompt_(settings), /文体のお手本/);
  settings['記事のお手本（任意）'] = 'お手本の本文';
  const system = buildArticleSystemPrompt_(settings);
  assert.match(system, /お手本の本文/);
  assert.match(system, /【要確認：〇〇】/);
  assert.match(system, /税理士ではない/);
  const idea = { memo: '出納帳の翌月準備', code: 'function createNextMonthSheet() {}' };
  assert.match(buildArticlePlanPrompt_(idea), /出納帳の翌月準備[\s\S]*```javascript\nfunction createNextMonthSheet\(\) \{\}\n```/);
  assert.match(buildArticleFreePrompt_(idea, { title: 'T' }), /そのまま抜き出す[\s\S]*"title": "T"/);
  assert.match(buildArticlePaidPrompt_(idea, { title: 'T' }), /【ここに完全版コードを貼る】/);
});

test('RSS の本文冒頭をテキストにし、URLとタイトルの表記ゆれを吸収する', () => {
  assert.strictEqual(htmlToPlainText_('<p>毎月の&amp;出納帳<br>2行目</p><h2>見出し</h2>'), '毎月の&出納帳\n2行目\n見出し');
  assert.strictEqual(normalizeNoteUrl_('https://note.com/a/n/n123/?from=rss'), 'https://note.com/a/n/n123');
  assert.strictEqual(normalizeTitle_('毎月の現金出納帳、ＧＡＳ 配布'), normalizeTitle_('毎月の現金出納帳、GAS配布'));
});
