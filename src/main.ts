import L, { type Layer } from "leaflet";
import "leaflet.heat";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { formatDate, formatDuration, formatElevation, summarize } from "./activity";
import { decodePolyline } from "./polyline";
import { clearActivities, loadActivities, saveActivities } from "./storage";
import type { Activity, ActivityKind, WorkerMessage } from "./types";

type Filter = ActivityKind | "all";
type Mode = "routes" | "heat";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="shell">
    <header class="hero landing-only">
      <div>
        <p class="eyebrow">STRAVA ACTIVITY VIEWER</p>
        <h1>これまでの運動を、<br><span>ひとつの地図に。</span></h1>
        <p class="lead">Stravaの記録を読み込むだけで、ランニング・ライド・ウォーキングの軌跡や走行距離を地図で振り返れます。</p>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <span class="route-dot dot-one"></span><span class="route-dot dot-two"></span><span class="route-dot dot-three"></span>
        <svg viewBox="0 0 320 190"><path d="M20 155 C55 92,90 150,125 88 S190 30,210 92 S255 165,302 35" /></svg>
      </div>
    </header>

    <div class="privacy landing-only"><span aria-hidden="true">✓</span><div><strong>あなたの記録は外部へ送信されません</strong><small>ZIPの解析はすべてこのブラウザ内で行います。地図タイルの取得を除き、位置情報をサーバーへ送信しません。</small></div></div>

    <section class="guide landing-only" aria-labelledby="guide-title">
      <div class="section-heading"><p>HOW TO USE</p><h2 id="guide-title">かんたん3ステップ</h2><span>最初にStravaへアーカイブを申請します。準備には数日かかる場合があります。</span></div>
      <ol class="steps">
        <li><span class="step-number">1</span><div><strong>アーカイブを申請</strong><p><a href="https://www.strava.com/account" target="_blank" rel="noopener noreferrer">Stravaにログイン</a>し、右上の自分のアイコンから「設定」→「My Account」→「アカウントをダウンロード」の順に進み、「始める」を選択します。</p></div></li>
        <li><span class="step-number">2</span><div><strong>メールが届くまで待つ</strong><p>準備が完了するとStravaからメールが届きます。メール内のリンクからZIPをダウンロードします。</p><small>通常、数日かかります</small></div></li>
        <li><span class="step-number">3</span><div><strong>ZIPを読み込む</strong><p>ダウンロードしたZIPを展開せず、そのまま下のボタンから選択します。</p></div></li>
      </ol>
    </section>

    <section class="features landing-only" aria-labelledby="features-title">
      <div class="section-heading"><p>FEATURES</p><h2 id="features-title">Stravaの思い出を安全に見える化</h2><span>Activity Mapは、過去のアクティビティを「地図で探す」「傾向を見る」「端末に残す」ための無料Webアプリです。</span></div>
      <div class="feature-grid">
        <article><span aria-hidden="true">🗺️</span><h3>走った道を一枚の地図に</h3><p>FITやGPXに含まれるルートを読み込み、ランニング、ライド、ウォーキングなどの軌跡をまとめて表示できます。</p></article>
        <article><span aria-hidden="true">🔥</span><h3>ヒートマップでお気に入りコースを発見</h3><p>よく通る道をヒート表示に切り替えられるので、日々の練習エリアや旅先の記録を直感的に振り返れます。</p></article>
        <article><span aria-hidden="true">🔒</span><h3>Strava ZIPをアップロードしない設計</h3><p>アーカイブの解析はブラウザ内で完結します。保存も明示的に選んだときだけ端末内に行います。</p></article>
      </div>
    </section>

    <section class="faq landing-only" aria-labelledby="faq-title">
      <div class="section-heading"><p>FAQ</p><h2 id="faq-title">よくある質問</h2></div>
      <details><summary>Activity Mapは無料で使えますか？</summary><p>はい。ブラウザで開いて、Stravaから取得したZIPファイルを選択するだけで利用できます。</p></details>
      <details><summary>Stravaのデータはサーバーに送信されますか？</summary><p>いいえ。ZIPの解析は端末のブラウザ内で行います。地図表示時のみ、地図タイル取得の通信が発生します。</p></details>
      <details><summary>どんなアクティビティを表示できますか？</summary><p>Stravaエクスポート内のFITまたはGPXからGPSルートを抽出し、ラン、ライド、ウォーク、その他の種目に分けて表示します。</p></details>
    </section>

    <section class="import-card" id="import-card">
      <div class="import-heading"><span>準備ができたら</span><h2>アーカイブを読み込む</h2></div>
      <input id="zip-input" type="file" accept=".zip,application/zip" hidden />
      <div class="drop-zone" id="drop-zone">
        <div class="upload-mark" aria-hidden="true">↑</div>
        <div><strong>StravaのZIPファイルを選択</strong><p>ZIPは展開しなくて大丈夫です。ここにドロップすることもできます。</p></div>
        <button class="primary" id="choose-button" type="button">ZIPを選択</button>
      </div>
      <div class="progress-area" id="progress-area" hidden>
        <div class="progress-copy"><strong id="progress-label">準備中</strong><span id="progress-percent">0%</span></div>
        <progress id="progress" value="0" max="1"></progress>
        <button class="text-button" id="cancel-button" type="button">キャンセル</button>
      </div>
      <p class="error" id="error" role="alert" hidden></p>
    </section>

    <section class="workspace" id="workspace" hidden>
      <div class="stats" aria-label="集計">
        <div><strong data-stat="count">0</strong><span>Activities</span></div>
        <div><strong data-stat="distance">0</strong><span>Distance km</span></div>
        <div><strong data-stat="time">0m</strong><span>Moving time</span></div>
        <div><strong data-stat="elevation">0</strong><span>Elevation m</span></div>
      </div>
      <div class="toolbar">
        <div class="segments" aria-label="種目フィルター">
          <button class="active" data-filter="all">すべて</button><button data-filter="run">Run</button><button data-filter="ride">Ride</button><button data-filter="walk">Walk</button><button data-filter="other">Other</button>
        </div>
        <div class="segments" aria-label="表示方法">
          <button class="active" data-mode="routes">軌跡</button><button data-mode="heat">ヒート</button>
        </div>
        <div class="actions">
          <button id="save-button" type="button">端末に保存</button><button id="export-button" type="button">JSON書き出し</button><button id="clear-button" type="button">消去</button>
        </div>
      </div>
      <div class="panels">
        <div class="map-wrap"><div id="map"></div></div>
        <aside>
          <div class="list-heading"><h2>アクティビティ</h2><span id="count-badge"></span></div>
          <div class="activity-list" id="activity-list"></div>
        </aside>
      </div>
      <p class="tile-notice">地図表示時は、選択した地図提供者へタイル取得の通信が発生します。</p>
    </section>
    <footer class="landing-only"><strong>Activity Map</strong><span>Stravaとは提携していない非公式のツールです。</span></footer>
  </main>
`;

let activities: Activity[] = [];
let filter: Filter = "all";
let mode: Mode = "routes";
let worker: Worker | null = null;
let map: L.Map | null = null;
let activityLayer: Layer | null = null;
let selectedActivityId: number | null = null;
const routeLayers = new Map<number, L.Polyline>();

const input = element<HTMLInputElement>("zip-input");
const dropZone = element<HTMLDivElement>("drop-zone");
const progressArea = element<HTMLDivElement>("progress-area");
const progress = element<HTMLProgressElement>("progress");
const progressLabel = element<HTMLElement>("progress-label");
const progressPercent = element<HTMLElement>("progress-percent");
const errorBox = element<HTMLElement>("error");
const activityList = element<HTMLDivElement>("activity-list");

element("choose-button").addEventListener("click", () => input.click());
input.addEventListener("change", () => input.files?.[0] && beginImport(input.files[0]));
element("cancel-button").addEventListener("click", cancelImport);
dropZone.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("dragging"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  const file = event.dataTransfer?.files[0];
  if (file) beginImport(file);
});
activityList.addEventListener("click", (event) => {
  const item = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-activity-id]");
  if (item) selectActivity(Number(item.dataset.activityId), false);
});

document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((button) => button.addEventListener("click", () => {
  setActive("[data-filter]", button);
  filter = (button.dataset.filter ?? "all") as Filter;
  render();
}));
document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => button.addEventListener("click", () => {
  setActive("[data-mode]", button);
  mode = (button.dataset.mode ?? "routes") as Mode;
  renderMap(filteredActivities(), false);
}));
element("save-button").addEventListener("click", async () => {
  await saveActivities(activities);
  setButtonStatus("save-button", "保存しました");
});
element("export-button").addEventListener("click", exportJson);
element("clear-button").addEventListener("click", async () => {
  await clearActivities();
  activities = [];
  selectedActivityId = null;
  document.body.classList.remove("has-activities");
  element("workspace").hidden = true;
  element("import-card").hidden = false;
  input.value = "";
});

void loadActivities().then((saved) => {
  if (saved?.length) {
    activities = saved;
    showWorkspace();
  }
});

function beginImport(file: File): void {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    showError("ZIPファイルを選択してください");
    return;
  }
  cancelImport();
  errorBox.hidden = true;
  dropZone.hidden = true;
  progressArea.hidden = false;
  progress.value = 0;
  progressLabel.textContent = `${file.name} を準備中`;
  worker = new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<WorkerMessage>) => handleWorkerMessage(event.data);
  worker.onerror = () => importFailed("解析Workerでエラーが発生しました");
  worker.postMessage({ file });
}

function handleWorkerMessage(message: WorkerMessage): void {
  if (message.type === "progress") {
    progress.max = message.total;
    progress.value = message.current;
    progressLabel.textContent = message.label;
    progressPercent.textContent = `${Math.round((message.current / message.total) * 100)}%`;
  } else if (message.type === "complete") {
    activities = message.activities;
    selectedActivityId = null;
    cancelWorker();
    progressArea.hidden = true;
    dropZone.hidden = false;
    showWorkspace();
  } else {
    importFailed(message.message);
  }
}

function cancelImport(): void {
  cancelWorker();
  progressArea.hidden = true;
  dropZone.hidden = false;
}

function cancelWorker(): void {
  worker?.terminate();
  worker = null;
}

function importFailed(message: string): void {
  cancelImport();
  showError(message);
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function showWorkspace(): void {
  document.body.classList.add("has-activities");
  element("workspace").hidden = false;
  element("import-card").hidden = true;
  initializeMap();
  render();
  requestAnimationFrame(() => map?.invalidateSize());
}

function initializeMap(): void {
  if (map) return;
  map = L.map("map", { preferCanvas: true }).setView([36.5, 136.5], 5);
  const carto = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd", maxZoom: 20,
  });
  const gsi = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", {
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>', minZoom: 5, maxZoom: 18,
  });
  const gsiShaded = L.layerGroup([
    L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", {
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>', minZoom: 5, maxZoom: 18,
    }),
    L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png", {
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>', minZoom: 5, maxZoom: 18, maxNativeZoom: 16, opacity: 0.28,
    }),
  ]);
  carto.addTo(map);
  L.control.layers({ "CARTO Light": carto, "地理院地図": gsi, "地理院地図（陰影）": gsiShaded }).addTo(map);
}

function filteredActivities(): Activity[] {
  return filter === "all" ? activities : activities.filter((activity) => activity.kind === filter);
}

function render(): void {
  const visible = filteredActivities();
  if (selectedActivityId !== null && !visible.some((activity) => activity.id === selectedActivityId)) {
    selectedActivityId = null;
  }
  const stats = summarize(visible);
  setText('[data-stat="count"]', stats.count.toLocaleString());
  setText('[data-stat="distance"]', Math.round(stats.distance / 1000).toLocaleString());
  setText('[data-stat="time"]', formatDuration(stats.movingTime));
  setText('[data-stat="elevation"]', Math.round(stats.elevation).toLocaleString());
  element("count-badge").textContent = `${visible.length.toLocaleString()}件`;
  renderActivityList(visible);
  renderMap(visible, true);
}

function renderActivityList(visible: Activity[]): void {
  const selected = visible.find((activity) => activity.id === selectedActivityId);
  const listed = selected
    ? [selected, ...visible.filter((activity) => activity.id !== selected.id).slice(0, 99)]
    : visible.slice(0, 100);
  activityList.innerHTML = listed.map((activity) => `
    <button class="activity-item${activity.id === selectedActivityId ? " selected" : ""}" data-activity-id="${activity.id}" type="button">
      <div><strong>${escapeHtml(activity.name)}</strong><p>${escapeHtml(activity.sportType)} · ${(activity.distance / 1000).toFixed(1)} km · ${formatDuration(activity.movingTime)} · ${formatElevation(activity.elevation)} up</p></div>
      <time>${formatDate(activity.startDate)}</time>
    </button>`).join("");
}

function renderMap(data: Activity[], fitBounds: boolean): void {
  if (!map) return;
  if (activityLayer) map.removeLayer(activityLayer);
  routeLayers.clear();
  const routes = data
    .map((activity) => ({ activity, points: decodePolyline(activity.polyline) }))
    .filter((route) => route.points.length > 1);
  const points = routes.flatMap((route) => route.points.length > 300 ? route.points.filter((_, index) => index % 3 === 0) : route.points);
  if (!points.length) return;
  activityLayer = mode === "heat"
    ? L.heatLayer(points.map(([lat, lng]) => [lat, lng, 1]), { radius: 13, blur: 18, minOpacity: 0.35, gradient: { 0.2: "#2563eb", 0.5: "#16a34a", 0.75: "#facc15", 1: "#f04b23" } }).addTo(map)
    : L.layerGroup(routes.map(({ activity, points: route }) => {
      const layer = L.polyline(route, routeStyle(activity.id));
      layer.bindTooltip(escapeHtml(activity.name), { sticky: true });
      layer.on("click", () => selectActivity(activity.id, true));
      routeLayers.set(activity.id, layer);
      return layer;
    })).addTo(map);
  updateRouteStyles();
  if (fitBounds) map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 14 });
}

function selectActivity(id: number, revealInList: boolean): void {
  selectedActivityId = id;
  renderActivityList(filteredActivities());
  updateRouteStyles();
  if (revealInList) {
    requestAnimationFrame(() => activityList.querySelector(".selected")?.scrollIntoView({ block: "nearest" }));
  }
}

function updateRouteStyles(): void {
  for (const [id, layer] of routeLayers) layer.setStyle(routeStyle(id));
  if (selectedActivityId !== null) routeLayers.get(selectedActivityId)?.bringToFront();
}

function routeStyle(id: number): L.PolylineOptions {
  return id === selectedActivityId
    ? { color: "#e44721", opacity: 0.7, weight: 4, interactive: true }
    : { color: "#1769e0", opacity: 0.3, weight: 2, interactive: true };
}

function exportJson(): void {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), activities }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "activity-map.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function setActive(selector: string, active: HTMLButtonElement): void {
  document.querySelectorAll(selector).forEach((item) => item.classList.remove("active"));
  active.classList.add("active");
}

function setButtonStatus(id: string, text: string): void {
  const button = element<HTMLButtonElement>(id);
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = original; }, 1500);
}

function setText(selector: string, value: string): void {
  const target = document.querySelector(selector);
  if (target) target.textContent = value;
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
