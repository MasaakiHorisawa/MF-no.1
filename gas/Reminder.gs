/**
 * 毎朝の自動処理：noteの新着記事の取り込み ＋ 投稿予定のリマインド
 *
 * 今後7日間に予定している投稿（推敲済・予約済）が目標本数に足りないとき、メールで知らせます。
 */

/** メニューから実行：今週の状況を画面に表示する */
function showWeeklyStatus() {
  SpreadsheetApp.getUi().alert(buildWeeklyStatus_().message);
}

/** 毎朝のトリガーから実行：新着記事を取り込み、知らせることがあるときだけメールを送る */
function dailyJobs() {
  const settings = getSettings_();
  const notes = [];
  if (settings['noteのRSS']) {
    try {
      const r = importNoteArticles_(settings);
      if (r.added.length) notes.push(`noteの新着記事を取り込みました：${r.added.join('、')}`);
      if (r.linked.length) notes.push(`下書きにURLを紐づけました：${r.linked.join('、')}`);
      if (r.postsCreated) notes.push(`X投稿案を${r.postsCreated}件作りました。「X投稿」シートで推敲してください。`);
      notes.push(...r.errors);
    } catch (e) {
      notes.push(`noteの取り込みに失敗しました：${e.message}`);
    }
  }
  const status = buildWeeklyStatus_();
  if (!status.shortage && !notes.length) return;

  const to = settings['リマインド送信先'] || Session.getEffectiveUser().getEmail();
  const subject = status.shortage ? '【X投稿】今週の予定が不足しています' : '【X投稿】新着記事を取り込みました';
  const body = [status.message].concat(notes.length ? ['', ...notes] : [], ['', SpreadsheetApp.getActiveSpreadsheet().getUrl()]).join('\n');
  MailApp.sendEmail(to, subject, body);
}

function buildWeeklyStatus_() {
  const posts = getSheetOrThrow_(APP.SHEETS.POSTS);
  const cols = requireColumns_(posts, ['ステータス', '予定日時']);
  const settings = getSettings_();
  const target = parseInt(settings['週あたり目標投稿数'], 10) || 4;

  const now = new Date();
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  let scheduled = 0;
  let unscheduledReady = 0;
  let drafts = 0;
  if (posts.getLastRow() > 1) {
    posts.getRange(2, 1, posts.getLastRow() - 1, posts.getLastColumn()).getValues().forEach(r => {
      const status = r[cols['ステータス']];
      const date = r[cols['予定日時']];
      if (status === '案') drafts++;
      if (status !== '推敲済' && status !== '予約済') return;
      if (date instanceof Date && date >= now && date <= weekLater) scheduled++;
      else if (!(date instanceof Date)) unscheduledReady++;
    });
  }

  const shortage = Math.max(target - scheduled, 0);
  const lines = [
    `今後7日間の予定：${scheduled}本（目標${target}本）`,
    `推敲済で日時が未定：${unscheduledReady}本`,
    `未推敲の案：${drafts}本`,
  ];
  if (shortage) {
    lines.push('', `あと${shortage}本必要です。` +
      (unscheduledReady + drafts > 0 ? '手持ちの案を推敲して予定日時を入れましょう。' : '記事を選んで投稿案を作成しましょう。'));
  }
  return { shortage: shortage, message: lines.join('\n') };
}

/** 毎朝8時台の自動処理を有効にする（重複して登録しない） */
function enableDailyJobs() {
  removeDailyTriggers_();
  ScriptApp.newTrigger('dailyJobs').timeBased().everyDays(1).atHour(8).create();
  SpreadsheetApp.getUi().alert(
    '毎朝8時台に次の処理を行います。\n' +
    '・noteの新着記事を取り込み、X投稿案を作る（「設定」の「noteのRSS」が入っている場合）\n' +
    '・今後7日間の投稿予定が目標より少なければメールで知らせる'
  );
}

function disableDailyJobs() {
  removeDailyTriggers_();
  SpreadsheetApp.getUi().alert('毎朝の自動処理を停止しました。');
}

function removeDailyTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'dailyJobs')
    .forEach(t => ScriptApp.deleteTrigger(t));
}
