/**
 * 送信前チェック：貼り付けたコードに、外部（Claude）へ送るべきでない情報が含まれていないか調べる
 *
 * 見つかった場合は送信を止め、どこを置き換えればよいかを表示します。
 * 「サンプル株式会社」「test@example.com」のような、明らかなダミーは対象外です。
 */

const SENSITIVE_PATTERNS = [
  { label: 'メールアドレス', re: /[\w.+-]+@[\w-]+(\.[\w-]+)+/g, allow: /@example\.(com|jp|org)$|^(test|sample|user|your|foo)[\w.+-]*@/i },
  { label: 'APIキー・トークン', re: /sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|ghp_[A-Za-z0-9]{20,}/g },
  { label: 'パスワード・秘密情報', re: /(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"\s]{6,}['"]/gi },
  { label: 'GoogleドライブのURL', re: /https:\/\/(docs|drive)\.google\.com\/[^\s'"`)]*\/(d|folders)\/[A-Za-z0-9_-]{20,}/g },
  { label: 'ファイル・フォルダIDらしき文字列', re: /['"`][A-Za-z0-9_-]{25,}['"`]/g },
  { label: '電話番号', re: /0\d{1,4}-\d{1,4}-\d{3,4}/g, allow: /^0{2,}|0000|1234-5678/ },
  { label: 'マイナンバー・法人番号らしき数字', re: /(?<![\d.])\d{12,13}(?![\d.])/g },
  { label: '口座番号', re: /(普通|当座|口座(番号)?)\s*[:：]?\s*\d{7}/g },
  { label: '郵便番号', re: /〒\s*\d{3}-?\d{4}|(?<![\d-])\d{3}-\d{4}(?![\d-])/g, allow: /000-0000|123-4567/ },
  { label: '住所', re: /(北海道|東京都|京都府|大阪府|[^\s'"`、。]{2,3}県)[^\s'"`、。]{1,8}?[市区町村郡]/g, allow: /サンプル|テスト|〇〇|○○|例/ },
  { label: '法人名', re: /(株式会社|有限会社|合同会社|税理士法人|医療法人|社会福祉法人)[^\s'"`、。,）)]{1,12}|[^\s'"`、。,（(]{1,12}(株式会社|有限会社|合同会社|税理士法人|医療法人)/g, allow: /サンプル|テスト|〇〇|○○|ＡＢＣ|ABC|XYZ|例|架空|ダミー/ },
];

/**
 * @param {string} code
 * @return {Array<{label: string, sample: string}>} 見つかった項目（同じ文字列は1回だけ）
 */
function findSensitive_(code) {
  const found = [];
  const seen = new Set();
  SENSITIVE_PATTERNS.forEach(p => {
    (String(code).match(p.re) || []).forEach(hit => {
      if (p.allow && p.allow.test(hit)) return;
      const key = `${p.label}:${hit}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push({ label: p.label, sample: hit.length > 40 ? `${hit.slice(0, 40)}…` : hit });
    });
  });
  return found;
}

/** チェック列に書く文章 */
function describeSensitive_(found) {
  return '送信前に置き換えてください：' + found.map(f => `${f.label}「${f.sample}」`).join('、');
}
