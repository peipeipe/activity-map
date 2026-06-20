# Activity Map

StravaのエクスポートZIPをブラウザ内で解析し、これまでの軌跡を地図で振り返る静的Webアプリです。

ZIPや位置情報はアプリのサーバーへアップロードしません。解析、集計、軌跡生成は利用者の端末内で完結します。

> Activity MapはStravaとは提携していない非公式のツールです。

公開版: [https://activity-map.pages.dev/](https://activity-map.pages.dev/)

## できること

- StravaエクスポートZIPをブラウザへドラッグ＆ドロップ
- `activities.csv` と `FIT / FIT.GZ / GPX / GPX.GZ` をWeb Workerで解析
- 全アクティビティの軌跡線またはヒートマップを表示
- Run、Ride、Walk、Otherで絞り込み
- 件数、距離、移動時間、獲得標高を集計
- 最近のアクティビティを一覧表示
- 解析結果を明示操作でIndexedDBへ保存
- 解析結果をJSONとして書き出し
- 処理状況の表示と解析キャンセル

## 使い方

1. [Stravaのアカウント設定](https://www.strava.com/account)を開きます。
2. 「アカウントのダウンロードまたは削除」からアーカイブをリクエストします。
3. Stravaからメールが届くまで待ちます。準備には数日かかる場合があります。
4. メール内のリンクからZIPファイルをダウンロードします。
5. ZIPを展開せず、Activity Mapでそのまま選択します。

## Privacy

- ZIP、CSV、FIT、GPXはWeb Worker内で解析します。
- 読み込んだ位置情報をアプリのサーバーへ送信しません。
- 「端末に保存」を押した場合のみ、解析結果をIndexedDBへ保存します。
- 地図表示時は、CARTO / OpenStreetMapまたは国土地理院のタイルサーバーへ通信します。
- 初期版ではログイン、クラウド同期、Workers、R2、外部DBを使用しません。

## 技術構成

- Vite + TypeScript
- Leaflet + Leaflet.heat
- Web Worker
- zip.js / fflate / Papa Parse / fast-xml-parser
- IndexedDB
- Cloudflare Pagesで配信可能な完全静的サイト

主な実装:

- `src/import.worker.ts`: ZIP検査、CSV、FIT、GPX解析
- `src/fit.ts`: GPS点列に必要なFIT record messageの解析
- `src/polyline.ts`: 点列簡略化とGoogle Polyline形式の変換
- `src/main.ts`: UI、地図、フィルター、統計、JSON書き出し
- `src/storage.ts`: IndexedDBへの明示保存

## Development

Node.js 22.12以降を使用します。

```sh
npm install
npm run dev
```

Viteが表示するURLをブラウザで開きます。`index.html`を`file://`で直接開く方法には対応していません。

```sh
npm test
npm run build
```

## Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`

`dist/`だけで動作し、サーバー側の実行環境やデータベースは不要です。

WranglerでCloudflareへログイン済みの環境では、次のコマンドで本番デプロイできます。

```sh
npm run pages:deploy
```

## Import limits

異常なアーカイブやZIP bombによるメモリ消費を抑えるため、次の上限を設けています。

- ZIP: 8GB
- ZIP内のエントリー: 10,000件
- 展開後の合計サイズ: 4GB
- 1エントリーおよび内包GZIPの展開後サイズ: 512MB
- `activities.csv`: 64MB

実際に扱えるサイズは端末とブラウザのメモリにも依存します。

## Current status

MVPの読み込み、解析、地図、ヒートマップ、統計、フィルター、ローカル保存、JSON書き出しまで実装済みです。約2,620件のStravaエクスポートを元にした構成で、FIT / GPX解析ロジックを検証しています。
