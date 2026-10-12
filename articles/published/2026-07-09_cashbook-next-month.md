---
title: "毎月の現金出納帳、シートのコピペをやめました(GASコード配布)マネーフォワード形式用"
url: https://note.com/nice_macaw6/n/nd6fd57a4096c
published: 2026-07-09
type: 有料（無料コードあり）
price: 未記入
note: 無料エリアのみ収録。有料エリアと完全版コードは公開リポジトリに置かないこと
---

毎月の現金出納帳の更新作業、少し手間に感じていませんか？ 前月のシートをコピーし、入力済みのデータを消去して数式だけを残し、前月の最終残高を「繰越金」として手入力する……。一つひとつは数分の作業でも、毎月必ず発生するため負担になります。 この記事では、税理士事務所の実務でも実際に使われているスプレッドシート用の自動化スクリプト（GAS）をご紹介します。ボタン一つで翌月のシート準備が完了する仕組みを作ってみましょう。

## こんな人におすすめ
- 毎月初めにマネーフォワード形式のスプレッドシートで出納帳の新しいシートを手作業で作っている方
- シートをコピーした際、誤って数式まで消してしまった経験がある方
- 手作業のコピペによる残高の転記ミスを防ぎたい方

## このGASで解決できること

【Before：これまでの手作業】
- 前月のシートを右クリックして「コピーを作成」
- シート名を「〇月」に変更
- 入力されている前月のデータを、数式を消さないように慎重に選択して削除
- 前月のシートを開いて最終残高を確認
- 新しいシートの一番上に「繰越金」として手入力 （所要時間：約3〜5分）

【After：GAS実行後】
- メニューバーから「翌月シートを自動作成する」をクリックするだけ （所要時間：数秒）

手作業によるコピー＆ペーストがなくなるため、毎月の作業時間が削減されるだけでなく、転記ミスや数式破損のリスクを大幅に減らすことができます。

## 無料で使える範囲のコード

以下のコードは、現在開いているシートを元に「翌月のシートを自動作成し、残高を繰り越す」という基本的な機能のみを抜粋したものです。ご自身のシートの列構成（B列から始まる等）に合わせて設定部分を変更してご利用ください。

### 導入手順
- スプレッドシートを開き、上部のメニューから「拡張機能」＞「Apps Script」をクリックします。
- 開いた画面（スクリプトエディタ）に最初から書かれている function myFunction() {} をすべて消去します。
- 下記のコードをコピーし、エディタに貼り付けます。
- ご自身のシート構成に合わせて、コード上部の CONFIG（設定）の行数や列数を修正します。
- エディタ上部の「保存」（フロッピーディスクのアイコン）をクリックします。
- スプレッドシートの画面に戻り、ページを一度更新（再読み込み）すると、上部メニューに「自動化メニュー」が追加されます。

JavaScript

```
/**
 * 現金出納帳 翌月シート自動作成スクリプト（無料版）
 */

// -------------------------------------------------------------------
// 設定：ご自身のシートフォーマットに合わせて数値を変更してください
// -------------------------------------------------------------------
const CONFIG = {
  HEADER_ROWS: 4,      // 見出しや繰越金が入力されている行までの数
  START_DATA_ROW: 5,   // 日々のデータ入力が始まる行数
  COL: {
    MONTH: 1,          // 「月」を入力する列 (B列の場合は1、C列の場合は2)
    SUMMARY: 10,       // 「摘要」を入力する列 (K列の場合は10)
    BALANCE: 13        // 「残高」が表示される列 (N列の場合は13)
  }
};

// スプレッドシートを開いた時に専用メニューを自動作成する
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('自動化メニュー')
    .addItem('🆕 翌月シートを自動作成する', 'createNextMonthSheet')
    .addToUi();
}

// 翌月シートを作成し、データをクリアして残高を繰り越す機能
function createNextMonthSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentSheet = ss.getActiveSheet();
  const currentSheetName = currentSheet.getName();
  
  // 1. シート名から「月」の数字を取得（例：「4月」→ 4）
  const currentMonth = parseInt(currentSheetName.replace(/[^0-9]/g, ""), 10);
  if (isNaN(currentMonth)) {
    SpreadsheetApp.getUi().alert("エラー：現在開いているシート名から月を判定できません。「4月」のような名前にしてください。");
    return;
  }
  
  // 翌月を計算（12月の次は1月）
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextSheetName = currentSheetName.replace(String(currentMonth), String(nextMonth));
  
  // すでに翌月シートがある場合は処理を中断
  if (ss.getSheetByName(nextSheetName)) {
    SpreadsheetApp.getUi().alert(`確認：すでに「${nextSheetName}」シートは存在します。`);
    return;
  }
  
  // 2. 現在のシートの最終入力行を探し、最終残高を取得する
  const bValues = currentSheet.getRange("B:B").getValues();
  let actualLastRow = CONFIG.HEADER_ROWS;
  for (let i = bValues.length - 1; i >= CONFIG.HEADER_ROWS; i--) {
    if (bValues[i][0] !== "") {
      actualLastRow = i + 1;
      break;
    }
  }
  const lastBalance = currentSheet.getRange(actualLastRow, CONFIG.COL.BALANCE + 1).getValue();
  
  // 3. シートをコピーして翌月用の名前に変更
  const nextSheet = currentSheet.copyTo(ss);
  nextSheet.setName(nextSheetName);
  
  // 4. 入力データをクリア（※数式は消さずに残す処理）
  if (actualLastRow >= CONFIG.START_DATA_ROW) {
    const totalRows = actualLastRow - CONFIG.START_DATA_ROW + 1;
    
    // 例：B列(2) ～ F列(6) をクリア
    const range1 = nextSheet.getRange(CONFIG.START_DATA_ROW, 2, totalRows, 5);
    const formulas1 = range1.getFormulas();
    range1.clearContent();
    range1.setFormulas(formulas1);
    
    // 例：H列(8) ～ M列(13) をクリア
    const range2 = nextSheet.getRange(CONFIG.START_DATA_ROW, 8, totalRows, 6);
    const formulas2 = range2.getFormulas();
    range2.clearContent();
    range2.setFormulas(formulas2);
  }
  
  // 5. 繰越行（4行目）に翌月と繰越残高をセット
  nextSheet.getRange(CONFIG.HEADER_ROWS, CONFIG.COL.MONTH + 1).setValue(nextMonth);
  nextSheet.getRange(CONFIG.HEADER_ROWS, CONFIG.COL.SUMMARY + 1).setValue("繰越金");
  nextSheet.getRange(CONFIG.HEADER_ROWS, CONFIG.COL.BALANCE + 1).setValue(lastBalance);
  
  // 完了メッセージ
  ss.setActiveSheet(nextSheet);
  SpreadsheetApp.getUi().alert(`完了：「${nextSheetName}」を作成しました。`);
}

```

## つまずきやすいポイント
- 「承認が必要です」という画面が出た場合 初めてスクリプトを実行する際、Googleからアクセス権限の承認を求められます。「権限を確認」→ご自身のアカウントを選択→「詳細」→「（安全ではないページ）に移動」をクリックして「許可」してください。これはご自身のスプレッドシートを操作するための正常な手続きです。
- シート名が正しくない場合 「〇月」という数字を含むシート名でないと、翌月を計算できずにエラーになります。「2024年4月」や「4月度」など、数字が含まれていれば動作します。
- クリアされる列の位置ズレ 無料版コードの「入力データをクリア」する部分は、ある特定のフォーマット（B〜F列、H〜M列にデータが入っている想定）に合わせています。お使いの表の形に合わせて nextSheet.getRange(...) の数字を微調整する必要があります。

## ここから先は有料

有料版では、翌月シートの作成だけでなく「日々の入力作業を圧倒的に速くする」ための高度な機能を追加したフルバージョンのコードを公開しています。

### 有料部分の見出しと概要

1. 過去データから「摘要マスタ」を自動合成する機能 過去の出納帳シートすべてを一括でスキャンし、「どの科目コードに、どんな摘要が使われたか」を自動で集計・整理して専用のマスタシートを作成する機能です。手作業でマスタを更新する手間がなくなります。

2. 科目コードを入れるだけで「摘要」が連動する超高速プルダウン機能 シートに「科目コード」を入力した瞬間、上記のマスタシートを参照し、その科目に紐づく過去の摘要履歴だけをプルダウンの選択肢として自動生成します。「過去になんて入力したっけ？」と探す時間がゼロになります。

3. 実務に合わせたエラー防止機能 誤ってマスタシート上でスクリプトを実行してしまった場合のガード処理や、マスタが存在しない状態でも入力者が困らないような安全設計が組み込まれています。

### 有料版の内容
- マスタ合成機能・連動プルダウン機能を含むフルコードの公開
- 想定されるエラー（マスタ未作成時の挙動など）とその対処コードの解説
- あなたの業務フォーマットに合わせたカスタマイズ相談（コメント欄またはnoteのDMにて1回）
