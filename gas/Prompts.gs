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
    article.body,
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

// ---------------------------------------------------------------------------
// 記事の下書き（ネタ帳 → note記事）
// GAS の通信は1回約60秒で打ち切られるため、「構成 → 無料エリア → 有料エリア」の3回に分けて作る
// ---------------------------------------------------------------------------

function buildArticleSystemPrompt_(settings) {
  const sample = settings['記事のお手本（任意）'];
  return [
    'あなたは、noteで業務効率化のGASツールを販売している個人の記事づくりを手伝う編集者です。',
    '発信者が過去に作ったGASコードをもとに、ツールを紹介・販売するnote記事の下書きを作ります。',
    '',
    '## 発信者',
    settings['発信者プロフィール'],
    '',
    '## 文体',
    settings['文体'],
    '',
    '## 守ること',
    '- 書いてよい事実は、コードとメモから読み取れることだけ。コードにない機能を書かない。',
    '- 作業時間・件数・削減効果など、コードから分からない数字は作らず【要確認：〇〇】と書く。発信者があとで埋める。',
    '- 個別の税務相談に応じる表現や、税額・節税効果を断定する表現は使わない。発信者は税理士ではない。',
    '- 顧問先・勤務先を特定できる情報は書かない。例に出す会社名は「サンプル株式会社」などにする。',
    '- 誇張や、不安をあおる表現は使わない。',
    '- 見出しは「## 」「### 」、箇条書きは「- 」、手順は「1. 」、コードは ``` で囲む Markdown で書く。',
    '',
    '## 記事の型',
    '悩みのチェックリスト → Before/After（手作業の手順と所要時間 → ツール導入後）→ 全体の流れ → 無料で見せるコード（または冒頭部分）→ つまずきやすいポイント → 有料エリアの見出しと中身。',
    sample ? `\n## 文体のお手本（この記事の書き方・語り口に寄せる。内容は真似しない）\n${sample}` : '',
  ].join('\n');
}

function buildCodeBlock_(idea) {
  return [
    `## メモ\n${idea.memo || '（なし）'}`,
    '',
    '## コード',
    '```javascript',
    idea.code,
    '```',
  ].join('\n');
}

function buildArticlePlanPrompt_(idea) {
  return [
    'このGASコードを販売するnote記事の構成を考えてください。',
    'free_scope には無料エリアで見せる範囲（コードのどの関数・どこまでか）、paid_scope には有料エリアで提供するものを書く。',
    'price_suggestion は既存の価格帯（980〜2,980円）から選び、price_reason に理由を1文で書く。',
    '',
    buildCodeBlock_(idea),
  ].join('\n');
}

function buildArticleFreePrompt_(idea, plan) {
  return [
    '次の構成で、note記事の「無料エリア」の本文を書いてください。',
    '- 記事タイトルは書かず、導入の段落から始める。',
    '- 無料で見せるコードは、下のコードから free_scope の部分をそのまま抜き出す（書き換えたり、新しい処理を足したりしない）。',
    '- 最後は「## ここから先は有料」の見出しで、有料エリアで手に入るものを箇条書きで紹介して終える。',
    '- コードを除いて2,000〜3,000字。',
    '',
    '## 構成',
    JSON.stringify(plan, null, 2),
    '',
    buildCodeBlock_(idea),
  ].join('\n');
}

function buildArticlePaidPrompt_(idea, plan) {
  return [
    '次の構成で、note記事の「有料エリア」の本文を書いてください。',
    '- 完全版のコードは書き写さず、その位置に「【ここに完全版コードを貼る】」とだけ書く。',
    '- 含める見出し：導入手順（権限の承認やトリガー設定など、コードに必要なものだけ）／設定項目の説明／処理の解説（関数名を出して要所だけ）／よくあるエラーと対処／自分の業務に合わせて変える方法。',
    '- 1,500〜2,500字。',
    '',
    '## 構成',
    JSON.stringify(plan, null, 2),
    '',
    buildCodeBlock_(idea),
  ].join('\n');
}

function buildArticlePlanSchema_() {
  const str = { type: 'string' };
  const list = { type: 'array', items: { type: 'string' } };
  const props = {
    title: str,
    title_alternatives: list,
    target_reader: str,
    pains: list,
    before_steps: list,
    after_summary: str,
    flow: list,
    features: list,
    free_scope: str,
    paid_scope: str,
    config_items: list,
    pitfalls: list,
    price_suggestion: str,
    price_reason: str,
  };
  return { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false };
}

function buildMarkdownSchema_() {
  return {
    type: 'object',
    properties: { markdown: { type: 'string' } },
    required: ['markdown'],
    additionalProperties: false,
  };
}

/** 3回分の回答を、1つの下書きにまとめる */
function assembleDraftMarkdown_(plan, freeMd, paidMd) {
  return [
    '> 【下書き】AIが作成しました。【要確認】の箇所を埋め、内容を確認してから公開してください。',
    `> 価格案：${plan.price_suggestion}（${plan.price_reason}）`,
    `> タイトル案：${[plan.title].concat(plan.title_alternatives || []).join(' ／ ')}`,
    '',
    `# ${plan.title}`,
    '',
    freeMd.trim(),
    '',
    '---',
    '',
    '## ▼▼▼ ここから有料エリア ▼▼▼',
    '',
    paidMd.trim(),
  ].join('\n');
}
