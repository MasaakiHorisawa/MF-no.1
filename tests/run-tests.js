/**
 * GAS コードのうち、スプレッドシートに依存しない部分を Node.js で確認するテスト
 *
 * 実行：node tests/run-tests.js
 * Claude API には接続しません（UrlFetchApp などはテスト用の偽物に置き換えています）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const gasDir = path.join(__dirname, '..', 'gas');
const source = fs.readdirSync(gasDir)
  .filter(f => f.endsWith('.gs'))
  .sort()
  .map(f => fs.readFileSync(path.join(gasDir, f), 'utf8'))
  .join('\n');

const context = {
  console,
  sleeps: [],
  fetchQueue: [],
  fetchCalls: [],
  Utilities: {
    sleep(ms) { context.sleeps.push(ms); },
    formatDate() { return '261012090000'; },
  },
  PropertiesService: {
    getScriptProperties() { return { getProperty: () => 'sk-ant-test' }; },
  },
  UrlFetchApp: {
    fetch(url, req) {
      context.fetchCalls.push(req);
      const next = context.fetchQueue.shift();
      return {
        getResponseCode: () => next.code,
        getContentText: () => next.body,
        getHeaders: () => next.headers || {},
      };
    },
  },
};
vm.createContext(context);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
context.test = test;
context.assert = assert;

vm.runInContext(source + '\n' + `
test('全角は2、半角は1、URLは23で数える', () => {
  assert.strictEqual(countXWeight_('abc'), 3);
  assert.strictEqual(countXWeight_('あいう'), 6);
  assert.strictEqual(countXWeight_('URL https://note.com/nice_macaw6/n/nd6fd57a4096c'), 4 + 23);
  assert.strictEqual(countXWeight_('あ'.repeat(140)), 280);
});

test('文字数超過・NGワード・URL重複・ハッシュタグ過多を検出する', () => {
  const ng = '絶対,必ず';
  assert.strictEqual(checkPost_('', '', ng).result, '本文が空です');
  assert.strictEqual(checkPost_('毎月の出納帳を3秒で準備', '', ng).result, 'OK');
  assert.match(checkPost_('あ'.repeat(141), '', ng).result, /文字数超過（282\\/280）/);
  assert.match(checkPost_('あ'.repeat(130), 'https://note.com/x', ng).result, /文字数超過/);
  assert.match(checkPost_('これで絶対ラク', '', ng).result, /NGワード：絶対/);
  assert.match(checkPost_('詳しくは https://note.com/x', 'https://note.com/x', ng).result, /重複/);
  assert.match(checkPost_('#GAS #経理 #効率化 です', '', ng).result, /ハッシュタグが多すぎます（3個）/);
});

test('Opus 5.5 ではフォールバック指定と構造化出力を付ける', () => {
  const req = buildClaudeRequest_({ model: 'claude-opus-5-5', effort: 'low', system: 's', user: 'u', schema: buildPostsSchema_() }, 'sk-ant-test');
  const payload = JSON.parse(req.payload);
  assert.strictEqual(payload.fallbacks, 'default');
  assert.strictEqual(req.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.strictEqual(req.headers['anthropic-version'], '2023-06-01');
  assert.strictEqual(payload.thinking.type, 'adaptive');
  assert.strictEqual(payload.output_config.effort, 'low');
  assert.strictEqual(payload.output_config.format.type, 'json_schema');
  assert.strictEqual(payload.max_tokens, 16000);
  assert.strictEqual(req.muteHttpExceptions, true);
});

test('フォールバック非対応のモデルでは付けない', () => {
  const req = buildClaudeRequest_({ model: 'claude-haiku-5-5', effort: 'low', system: 's', user: 'u', schema: {} }, 'k');
  assert.strictEqual(JSON.parse(req.payload).fallbacks, undefined);
  assert.strictEqual(req.headers['anthropic-beta'], undefined);
});

test('思考ブロックを飛ばしてテキストのJSONを読む', () => {
  const body = JSON.stringify({
    stop_reason: 'end_turn',
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"posts":[]}' }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  assert.strictEqual(JSON.stringify(parseClaudeJson_(200, body)), '{"posts":[]}');
});

test('拒否・打ち切り・認証エラーをわかる言葉で返す', () => {
  assert.throws(() => parseClaudeJson_(200, JSON.stringify({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] })), /見送りました（cyber）/);
  assert.throws(() => parseClaudeJson_(200, JSON.stringify({ stop_reason: 'max_tokens', content: [] })), /途中で切れました/);
  assert.throws(() => parseClaudeJson_(401, JSON.stringify({ error: { message: 'invalid x-api-key' } })), /APIキーが無効/);
  assert.throws(() => parseClaudeJson_(400, JSON.stringify({ error: { message: 'bad' } })), /HTTP 400.*bad/);
  assert.throws(() => parseClaudeJson_(502, '<html>'), /想定外の応答/);
});

test('混雑時は待って再試行し、400はすぐ返す', () => {
  fetchQueue.push({ code: 529, body: '{}' }, { code: 429, body: '{}', headers: { 'retry-after': '5' } }, { code: 200, body: '{}' });
  assert.strictEqual(fetchWithRetry_({ url: 'u' }).getResponseCode(), 200);
  assert.strictEqual(JSON.stringify(sleeps), '[2000,5000]');
  sleeps.length = 0;
  fetchQueue.push({ code: 400, body: '{}' });
  assert.strictEqual(fetchWithRetry_({ url: 'u' }).getResponseCode(), 400);
  assert.strictEqual(sleeps.length, 0);
});

test('Claude の回答をシートの1行に変換する', () => {
  const pCols = {};
  POST_COLS.forEach((c, i) => { pCols[c] = i; });
  const settings = {};
  DEFAULT_SETTINGS.forEach(([k, v]) => { settings[k] = v; });
  const article = { id: 'A1', url: 'https://note.com/nice_macaw6/n/nd6fd57a4096c' };
  const row = buildPostRow_({ pillar: 'GAS実例', post_type: '告知', text: '出納帳の翌月準備が3秒に', include_link: true, intent: '記事を読んでもらう' }, article, 0, settings, pCols);
  assert.strictEqual(row.length, POST_COLS.length);
  assert.strictEqual(row[pCols['リンク']], article.url);
  assert.strictEqual(row[pCols['ステータス']], '案');
  assert.strictEqual(row[pCols['チェック']], 'OK');
  assert.strictEqual(row[pCols['文字数(X換算)']], countXWeight_('出納帳の翌月準備が3秒に\\n' + article.url));
  const noLink = buildPostRow_({ pillar: '人柄', post_type: '日常', text: 'x', include_link: true, intent: '' }, { id: 'A2', url: '' }, 1, settings, pCols);
  assert.strictEqual(noLink[pCols['リンク']], '');
});

test('プロンプトに設定シートの値が入る', () => {
  const settings = {};
  DEFAULT_SETTINGS.forEach(([k, v]) => { settings[k] = v; });
  settings['文体'] = 'テスト用の文体';
  assert.match(buildSystemPrompt_(settings), /テスト用の文体/);
  assert.match(buildUserPrompt_({ title: 'T', type: '有料', price: '1980', url: '', body: 'B' }, 3), /3本[\\s\\S]*1980円[\\s\\S]*include_link は false/);
});
`, context);

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n  ${e.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
