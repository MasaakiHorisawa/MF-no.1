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

test('分析スキーマ：すべての object が構造化出力の条件を満たす', () => {
  const walk = (node, path) => {
    if (node.type === 'object') {
      assert.strictEqual(node.additionalProperties, false, path);
      assert.strictEqual(JSON.stringify(node.required.slice().sort()), JSON.stringify(Object.keys(node.properties).sort()), path);
      Object.keys(node.properties).forEach(k => walk(node.properties[k], path + '.' + k));
    } else if (node.type === 'array') {
      walk(node.items, path + '[]');
    }
  };
  const schema = buildArticleAnalyzeSchema_();
  walk(schema, 'root');
  assert.strictEqual(schema.properties.price.properties.recommended.type, 'integer');
  assert.strictEqual(JSON.stringify(schema.properties.recommended_type.enum), JSON.stringify(ARTICLE_TYPES));
  walk(buildMarkdownSchema_(), 'markdown');
});

test('下書きの組み立て：有料は有料エリアと価格、無料は有料エリアなし', () => {
  const paid = assembleDraftMarkdown_({ title: '出納帳の翌月シート', titleAlternatives: ['案2'], type: '有料', price: 1980 }, '無料の本文', '【ここに完全版コードを貼る】');
  assert.match(paid, /種別：有料 ／ 価格：1,980円/);
  assert.match(paid, /タイトル案：出納帳の翌月シート ／ 案2/);
  assert.match(paid, /# 出納帳の翌月シート\n\n無料の本文\n\n---\n\n## ▼▼▼ ここから有料エリア ▼▼▼\n\n【ここに完全版コードを貼る】/);
  const free = assembleDraftMarkdown_({ title: 'T', type: '無料', price: '' }, '本文', '');
  assert.match(free, /種別：無料\n/);
  assert.doesNotMatch(free, /有料エリア|価格/);
});

test('価格の入力ゆれを数値にし、円表記にする', () => {
  assert.strictEqual(normalizePrice_('1,980円'), 1980);
  assert.strictEqual(normalizePrice_('１９８０'), 1980);
  assert.strictEqual(normalizePrice_(2980), 2980);
  assert.strictEqual(normalizePrice_(''), '');
  assert.strictEqual(normalizePrice_('未定'), '');
  assert.strictEqual(formatYen_(12800), '12,800円');
  assert.strictEqual(formatYen_(''), '未定');
});

test('記事用プロンプト：イメージ・種別・価格・コード・価格の目安が入る', () => {
  const settings = {};
  DEFAULT_SETTINGS.forEach(([k, v]) => { settings[k] = v; });
  assert.doesNotMatch(buildArticleSystemPrompt_(settings), /文体のお手本/);
  settings['記事のお手本（任意）'] = 'お手本の本文';
  const system = buildArticleSystemPrompt_(settings);
  assert.match(system, /お手本の本文/);
  assert.match(system, /【要確認：〇〇】/);
  assert.match(system, /税理士ではない/);
  assert.match(system, /1,480〜1,980円/);

  const idea = { image: '経理担当向けに導入手順を丁寧に', code: 'function createNextMonthSheet() {}', type: 'おまかせ', price: '' };
  const analyze = buildArticleAnalyzePrompt_(idea);
  assert.match(analyze, /おまかせ（提案してほしい）/);
  assert.match(analyze, /未定（提案してほしい）/);
  assert.match(analyze, /経理担当向けに導入手順を丁寧に[\s\S]*```javascript\nfunction createNextMonthSheet\(\) \{\}\n```/);
  assert.match(buildArticleAnalyzePrompt_(Object.assign({}, idea, { type: '有料', price: 1980 })), /記事の種別：有料[\s\S]*1980円で考えている（妥当か評価してほしい）/);

  assert.match(buildArticleFreePrompt_(idea, { title: 'T' }, '無料'), /無料のnote記事の本文[\s\S]*【ここにコード全文を貼る】/);
  assert.match(buildArticleFreePrompt_(idea, { title: 'T' }, '有料（無料コードあり）'), /「無料エリア」[\s\S]*free_scope の部分をそのまま抜き出す[\s\S]*## ここから先は有料/);
  assert.match(buildArticleFreePrompt_(idea, { title: 'T' }, '有料'), /冒頭の数行だけ/);
  assert.match(buildArticlePaidPrompt_(idea, { title: 'T' }), /【ここに完全版コードを貼る】[\s\S]*"title": "T"/);
});

test('RSS の本文冒頭をテキストにし、URLとタイトルの表記ゆれを吸収する', () => {
  assert.strictEqual(htmlToPlainText_('<p>毎月の&amp;出納帳<br>2行目</p><h2>見出し</h2>'), '毎月の&出納帳\n2行目\n見出し');
  assert.strictEqual(normalizeNoteUrl_('https://note.com/a/n/n123/?from=rss'), 'https://note.com/a/n/n123');
  assert.strictEqual(normalizeTitle_('毎月の現金出納帳、ＧＡＳ 配布'), normalizeTitle_('毎月の現金出納帳、GAS配布'));
});

test('RSS の裸の & を直し、正しい記号はそのまま残す', () => {
  const xml = '<url>https://a.jp/x.jpg?fit=bounds&format=jpeg&quality=85</url><t>A &amp; B &lt;p&gt; &#39; &#x27;</t>';
  assert.strictEqual(escapeBareAmpersands_(xml),
    '<url>https://a.jp/x.jpg?fit=bounds&amp;format=jpeg&amp;quality=85</url><t>A &amp; B &lt;p&gt; &#39; &#x27;</t>');
});

test('noteのプロフィールURLをRSSのURLに直す', () => {
  assert.strictEqual(resolveNoteRssUrl_('https://note.com/nice_macaw6'), 'https://note.com/nice_macaw6/rss');
  assert.strictEqual(resolveNoteRssUrl_(' https://note.com/nice_macaw6/ '), 'https://note.com/nice_macaw6/rss');
  assert.strictEqual(resolveNoteRssUrl_('https://note.com/nice_macaw6/rss'), 'https://note.com/nice_macaw6/rss');
  assert.strictEqual(resolveNoteRssUrl_('https://note.com/nice_macaw6?tab=x'), 'https://note.com/nice_macaw6/rss');
});
