/**
 * スプレッドシートを開いたときに専用メニューを追加する
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('note×X')
    .addItem('① 初期設定（シート作成）', 'setupSheets')
    .addItem('② APIキーを設定', 'promptApiKey')
    .addSeparator()
    .addItem('GASから記事を作る（分析・価格診断・下書き）', 'openArticleDialog')
    .addItem('noteの新着記事を取り込む', 'importNoteArticles')
    .addSeparator()
    .addItem('記事：選択した記事からX投稿案を作成', 'generatePostsFromSelection')
    .addItem('X投稿：選択した投稿を再チェック', 'recheckSelectedPosts')
    .addSeparator()
    .addItem('今週の投稿予定を確認', 'showWeeklyStatus')
    .addItem('毎朝の自動処理を有効にする', 'enableDailyJobs')
    .addItem('毎朝の自動処理を停止する', 'disableDailyJobs')
    .addToUi();
}
