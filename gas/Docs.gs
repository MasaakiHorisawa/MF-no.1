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
