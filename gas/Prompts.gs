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
    PromptGuard.SYSTEM_NOTE.split('\n').map(l => `- ${l}`).join('\n'),
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
    PromptGuard.wrap(article.body),
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

