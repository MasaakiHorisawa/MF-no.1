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
