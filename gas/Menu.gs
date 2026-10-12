/**
 * スプレッドシートを開いたときに専用メニューを追加する
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('note×X')
    .addItem('① 初期設定（シート作成）', 'setupSheets')
    .addItem('② APIキーを設定', 'promptApiKey')
    .addSeparator()
    .addItem('選択した記事からX投稿案を作成', 'generatePostsFromSelection')
    .addItem('選択した投稿を再チェック', 'recheckSelectedPosts')
    .addSeparator()
    .addItem('今週の投稿予定を確認', 'showWeeklyStatus')
    .addItem('毎朝のリマインドを有効にする', 'enableDailyReminder')
    .addItem('毎朝のリマインドを停止する', 'disableDailyReminder')
    .addToUi();
}
