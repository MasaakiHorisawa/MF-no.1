/**
 * gas/*.gs を1つのファイル（dist/コード.gs）にまとめる
 *
 * Apps Script エディタに1ファイルだけ貼れば動くようにするためのものです。
 * 実行：node tools/bundle.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 読みやすさのための並び順（GAS はファイル順に依存しないが、設定 → 共通処理 → 機能 の順に並べる）
const ORDER = [
  'Config', 'Sheets', 'Menu', 'Claude', 'Prompts', 'ArticlePrompts', 'Checks', 'Sanitize',
  'Docs', 'Posts', 'Ideas', 'Rss', 'Reminder',
];

const gasDir = path.join(__dirname, '..', 'gas');
const files = fs.readdirSync(gasDir).filter(f => f.endsWith('.gs')).map(f => f.replace(/\.gs$/, ''));
const missing = files.filter(f => !ORDER.includes(f));
if (missing.length) throw new Error(`ORDER に追加してください：${missing.join(', ')}`);

const parts = ORDER.filter(name => files.includes(name)).map(name => {
  const body = fs.readFileSync(path.join(gasDir, `${name}.gs`), 'utf8').trim();
  return `// ===== ${name}.gs ${'='.repeat(Math.max(0, 60 - name.length))}\n\n${body}\n`;
});

const header = [
  '/**',
  ' * note × X 投稿管理ツール（1ファイル版）',
  ' *',
  ' * このファイルは tools/bundle.js で gas/*.gs から自動生成しています。直接編集せず、gas/ を直してから作り直してください。',
  ' * Apps Script には、このファイル（コード.gs）・ArticleDialog.html・appsscript.json の3つだけを置きます。',
  ' * ほかの .gs ファイルが残っていると「すでに宣言されています」というエラーになるので削除してください。',
  ' */',
  '',
].join('\n');

const bundle = header + parts.join('\n');
new vm.Script(bundle, { filename: 'コード.gs' }); // 文法エラーと重複宣言をここで検出する
fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'コード.gs'), bundle);
fs.copyFileSync(path.join(gasDir, 'ArticleDialog.html'), path.join(__dirname, '..', 'dist', 'ArticleDialog.html'));
fs.copyFileSync(path.join(gasDir, 'appsscript.json'), path.join(__dirname, '..', 'dist', 'appsscript.json'));
console.log(`dist/コード.gs を作成しました（${bundle.split('\n').length}行）`);
