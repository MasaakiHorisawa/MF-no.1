/**
 * 記事づくり（GASを貼る → 仕組みの分析・価格診断 → 下書き）で Claude に渡す指示と回答の形式
 *
 * GAS の通信は1回約60秒で打ち切られるため、「分析 → 無料エリア → 有料エリア」に分けて呼びます。
 */

// 価格の目安。AIはこの表と既存記事の価格帯をもとに価格を診断する
const PRICE_GUIDE = [
  '- 無料：数十行の単機能、または集客のための入口記事。フォローや有料記事への導線が目的',
  '- 480〜980円：単機能で、慣れた人なら30分ほどで自作できる。毎月数分の作業を省く',
  '- 1,480〜1,980円：実務の手順を丸ごと置き換える。エラー処理や設定項目があり、導入手順の解説が必要',
  '- 2,480〜2,980円：複数シートやトリガー、外部サービスとの連携があり、自作すると数日かかる。サポート1回付き',
  '- 4,980円以上：事務所内で共有できる版、複数ツールのセット、テンプレートシート付きなど',
].join('\n');

function buildArticleSystemPrompt_(settings) {
  const sample = settings['記事のお手本（任意）'];
  return [
    'あなたは、noteで業務効率化のGASツールを販売している個人の、記事づくりと価格設定を手伝う編集者です。',
    '発信者が過去に作ったGASコードを読み、仕組みを理解したうえで、ツールを紹介・販売するnote記事を作ります。',
    '',
    '## 発信者',
    settings['発信者プロフィール'],
    '',
    '## 文体',
    settings['文体'],
    '',
    '## 守ること',
    '- 書いてよい事実は、コードと発信者のメモから読み取れることだけ。コードにない機能を書かない。',
    '- 作業時間・件数・削減効果など、コードから分からない数字は作らず【要確認：〇〇】と書く。発信者があとで埋める。',
    '- 個別の税務相談に応じる表現や、税額・節税効果を断定する表現は使わない。発信者は税理士ではない。',
    '- 顧問先・勤務先を特定できる情報は書かない。例に出す会社名は「サンプル株式会社」などにする。',
    '- 誇張や、不安をあおる表現は使わない。',
    '- 本文は Markdown で書く（見出し「## 」「### 」、箇条書き「- 」、手順「1. 」、コードは ``` で囲む）。',
    '',
    '## 記事の型',
    '悩みのチェックリスト → Before/After（手作業の手順と所要時間 → ツール導入後）→ 全体の流れ → コード → つまずきやすいポイント →（有料記事なら）有料エリアの見出しと中身。',
    '',
    '## 価格の目安',
    PRICE_GUIDE,
    sample ? `\n## 文体のお手本（書き方・語り口だけを寄せる。内容は真似しない）\n${sample}` : '',
  ].join('\n');
}

/** 入力内容（コード・イメージ・種別・価格）をプロンプト用にまとめる */
function buildIdeaBlock_(idea) {
  const wish = [];
  wish.push(`記事の種別：${idea.type && idea.type !== 'おまかせ' ? idea.type : 'おまかせ（提案してほしい）'}`);
  wish.push(`価格：${idea.price ? `${idea.price}円で考えている（妥当か評価してほしい）` : '未定（提案してほしい）'}`);
  return [
    '## 発信者の希望',
    ...wish,
    '',
    '## 記事のイメージ（発信者のメモ）',
    idea.image || '（なし）',
    '',
    '## コード',
    '```javascript',
    idea.code,
    '```',
  ].join('\n');
}

function buildArticleAnalyzePrompt_(idea) {
  return [
    'このGASコードを読み、次をまとめてください。',
    '1. 仕組みの理解：何をするツールか、処理の流れ、主な関数の役割、使う前に必要な準備（シート構成・権限・トリガーなど）',
    '2. 記事の設計：想定読者、悩み、Before/After、タイトル案、無料で見せる範囲と有料で提供する範囲',
    '3. 価格の診断：「価格の目安」をもとに、おすすめの種別と価格、価格の幅、その理由を具体的に。発信者が価格を指定している場合は price.assessment で妥当か評価する。価値を上げて高く売るための工夫も挙げる',
    '記事のイメージが書かれていれば、切り口や強調点はそれに合わせる。',
    '',
    buildIdeaBlock_(idea),
  ].join('\n');
}

function buildArticleAnalyzeSchema_() {
  const str = { type: 'string' };
  const int = { type: 'integer' };
  const list = { type: 'array', items: { type: 'string' } };
  const obj = props => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });
  return obj({
    mechanism_summary: str,
    flow: list,
    functions: { type: 'array', items: obj({ name: str, role: str }) },
    required_setup: list,
    target_reader: str,
    pains: list,
    before_steps: list,
    after_summary: str,
    title: str,
    title_alternatives: list,
    recommended_type: { type: 'string', enum: ARTICLE_TYPES },
    type_reason: str,
    price: obj({
      recommended: int,
      low: int,
      high: int,
      reasons: list,
      assessment: str,
      value_up_ideas: list,
    }),
    free_scope: str,
    paid_scope: str,
    config_items: list,
    pitfalls: list,
  });
}

/** 無料記事の本文、または有料記事の無料エリア */
function buildArticleFreePrompt_(idea, plan, type) {
  const isFree = type === '無料';
  return [
    isFree
      ? '次の分析をもとに、無料のnote記事の本文を書いてください。'
      : '次の分析をもとに、note記事の「無料エリア」の本文を書いてください。',
    '- 記事タイトルは書かず、導入の段落から始める。',
    isFree
      ? '- コード全文は書き写さず、その位置に「【ここにコード全文を貼る】」と書く。導入手順と、設定を変える箇所の説明は本文に含める。'
      : type === '有料（無料コードあり）'
        ? '- 無料で見せるコードは、下のコードから free_scope の部分をそのまま抜き出す（書き換えたり、新しい処理を足したりしない）。'
        : '- コードは冒頭の数行だけを、下のコードからそのまま抜き出して見せる。',
    isFree
      ? '- 最後に、ほかの記事やフォローにつながる一言で締める。'
      : '- 最後は「## ここから先は有料」の見出しで、有料エリアで手に入るものを箇条書きで紹介して終える。',
    `- コードを除いて${isFree ? '2,500〜3,500' : '2,000〜3,000'}字。`,
    '',
    '## 分析',
    JSON.stringify(plan, null, 2),
    '',
    buildIdeaBlock_(idea),
  ].join('\n');
}

function buildArticlePaidPrompt_(idea, plan) {
  return [
    '次の分析をもとに、note記事の「有料エリア」の本文を書いてください。',
    '- 完全版のコードは書き写さず、その位置に「【ここに完全版コードを貼る】」とだけ書く。',
    '- 含める見出し：導入手順（required_setup にあるものだけ）／設定項目の説明／処理の解説（関数名を出して要所だけ）／よくあるエラーと対処／自分の業務に合わせて変える方法。',
    '- サポートの範囲や問い合わせ先は書かない（あとで定型文を自動で付ける）。',
    '- 1,500〜2,500字。',
    '',
    '## 分析',
    JSON.stringify(plan, null, 2),
    '',
    buildIdeaBlock_(idea),
  ].join('\n');
}

function buildMarkdownSchema_() {
  return {
    type: 'object',
    properties: { markdown: { type: 'string' } },
    required: ['markdown'],
    additionalProperties: false,
  };
}

/** 下書きドキュメントの本文を組み立てる（無料記事は有料エリアなし） */
function assembleDraftMarkdown_(meta, freeMd, paidMd) {
  const header = [
    '> 【下書き】AIが作成しました。【要確認】の箇所を埋め、内容を確認してから公開してください。',
    `> 種別：${meta.type}` + (meta.type === '無料' ? '' : ` ／ 価格：${formatYen_(meta.price)}（noteの公開設定で入力）`),
    `> タイトル案：${[meta.title].concat(meta.titleAlternatives || []).join(' ／ ')}`,
    '',
    `# ${meta.title}`,
    '',
    freeMd.trim(),
  ];
  if (meta.type !== '無料' && paidMd) {
    header.push('', '---', '', '## ▼▼▼ ここから有料エリア ▼▼▼', '', paidMd.trim());
    // サポートの約束は記事ごとにぶれないよう、AIに書かせず「設定」シートの文面をそのまま入れる
    if (meta.support) header.push('', '## サポートについて', '', String(meta.support).trim());
  }
  return header.join('\n');
}

/** 「1,980円」「１９８０」などを数値に。読めなければ空文字 */
function normalizePrice_(value) {
  const digits = String(value === undefined || value === null ? '' : value).normalize('NFKC').replace(/[^\d]/g, '');
  return digits ? Number(digits) : '';
}

function formatYen_(price) {
  return price === '' || price === undefined || price === null ? '未定' : `${String(Number(price)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}円`;
}
