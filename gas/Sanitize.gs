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

/**
 * 送信前チェック：AI への指示を書き換える文（プロンプトインジェクション）が紛れていないか調べる
 * 判定そのものは PromptGuard.gs（ほかのシステムにも持っていける単体モジュール）で行い、ここでは「設定」シートに合わせて止めるかを決める
 * @return {Object} PromptGuard.scan の結果（止めたときはエラーを投げる）
 */
function guardPromptInput_(text, where, settings) {
  const mode = { '中程度から止める': 'medium', '止めない': 'never' }[String(settings['インジェクション検出'] || '').trim()] || 'high';
  const result = PromptGuard.guard(text, { where: where, block: mode });
  if (result.risk !== 'none') console.log(`${where}：${PromptGuard.describe(result)}`);
  return result;
}
