# 旅遊規劃（trip-planner）

旅伴一起排行程、記旅費的 SPA：每趟旅程一條連結，景點可多人同時編輯，旅費支援當地幣別、結算換成新台幣並算出最少轉帳。
Vue 3 + Vite + TypeScript + Tailwind CSS v4 + Pinia + Vue Router（hash 模式）+ PWA + SortableJS；
資料在 Supabase（未設定 env 時進 Demo 模式，存 localStorage）；部署在 GitHub Pages。
不做帳號登入：拿到旅程連結 `#/t/<token>` 的人都能讀寫那一趟，token 走 `x-trip-token` header、由 RLS 比對；
任何人都能經 `create_trip()` 建新旅程，伺服器端沒有旅程清單（「我的旅程」只存在各自裝置的 localStorage）。
架構與做法沿用姊妹專案 `knowwHao/sports-ledger`（球友記帳）。人看的完整說明在 `README.md`。

## 常用指令

```bash
npm ci               # 依 lock 檔安裝；需 Node 22.12+ 或 24（vitest 5 的 engines）
npm run dev          # http://localhost:5173，Demo 模式不需任何 env
npm test             # vitest 單元測試
npm run typecheck    # 只跑 vue-tsc
npm run build        # vue-tsc 型別檢查 + vite build 到 dist/
```

## 硬性規則

- **禁用 `v-html`**：使用者輸入一律走文字插值；景點的地圖連結只接受 http(s)（`src/lib/maps.ts` 的 `safeUrl` 與 schema 的 check）
- **金鑰**：Supabase anon key 只能透過 env 注入，不得寫死；任何地方都不得使用 `service_role` key
- **localStorage 鍵名**：與 sports-ledger 同在 `knowwhao.github.io` 一個 origin，鍵名一律 `trip-` 開頭，不可撞名
- **改 schema**：每張表都要開 RLS、有 `trip_all` policy（子表 `using`／`with check` 都是 `trip_id = (select current_trip_id())`）、
  明確 grant 給 anon／authenticated（預設權限已收回）且收回 truncate；子表參照旅伴／景點一律用帶 `trip_id` 的複合外鍵；
  新增 view 一律 `with (security_invoker = true)`；新增函式要 `revoke execute ... from public` 再明確 grant；
  有內容欄位的表要掛 `bump_version` 觸發器（排序欄位列在它的 skip 清單裡）；
  `schema.sql` 要可重複執行，也要能套在舊版 DB 上升級；改完用 PGlite（`@electric-sql/pglite`，不在依賴內，臨時裝在專案外）
  實跑 `schema.sql` 兩次，需先替身 `anon`／`authenticated` 角色，以 `set_config('request.headers', '{"x-trip-token":"…"}', true)` 模擬 header，
  驗沒帶／帶錯 token 讀不到也寫不進、別趟的 token 碰不到這趟；並同步 `src/types.ts`、兩個 repo 實作與 `src/data/demoSeed.ts`
- **旅程與 token 的寫入**：`trips` 只能經 `create_trip()` 新增、token 只能經 `regenerate_trip_token()` 換發，不要重新 grant `trips` 的 insert 或 token 欄位的 update；
  旅費一律經 `save_expense()` 連同分攤一起寫
- **同時編輯**：改內容一律帶 version（樂觀鎖），版本不符要丟 `ConflictError` 讓畫面走 `saveWithConflict()`；
  寫入一律經 `trip` store 的 `mutate()`（成功後會廣播通知其他人並重讀）；拖曳排序只改 `day`／`sort_key`，不檢查版本
- **改金額或結算邏輯**：先在 `src/lib/split.test.ts` 補會失敗的測試，再改 `split.ts`；結算金額一律新台幣整數，外幣在換算時才四捨五入
- **手機版**：375px 寬不可水平溢出（`document.documentElement.scrollWidth` 不得大於視窗寬）
- 路由是 hash 模式，站內連結用 router 產生；完整旅程網址參考 `src/views/TripSettingsView.vue` 的 `tripUrl`

## 目錄地圖

- `src/lib/split.ts`：分攤（平分／指定金額）、淨額、最少轉帳、每人摘要的**唯一來源**（純函式），測試 `split.test.ts`
- `src/lib/money.ts`：幣別清單、小數位數、換算、金額格式與解析；`format.ts`：日期與旅程天數；`maps.ts`：Google 地圖連結；`order.ts`：排序值（取中間值）
- `src/data/repository.ts`：資料層介面與 `InvalidTokenError`／`ConflictError`／`InUseError`；實作 `supabaseRepo.ts`（Supabase + Realtime 廣播）、
  `demoRepo.ts`（localStorage，以 `guard()` 模擬 RLS、版本號與刪除限制，BroadcastChannel 模擬即時同步，測試 `demoRepo.test.ts`）
- `src/data/writeCheck.ts`：RLS 擋下或版本不符時 update／delete 只會 0 列不報錯，`supabaseRepo.ts` 一律 `.select(…)` 後經 `expectAffected` 判定
  （0 列時再確認 token 與這筆是否還在，分辨連結失效、別人改過、資料已不在）
- `src/data/realtime.ts`：即時同步的頻道名稱（token 的 SHA-256），廣播只傳「有東西改了」
- `src/data/index.ts`：依 `VITE_SUPABASE_*` 有無選 repo；`demoSeed.ts` 是示範旅程
- `src/stores/saved.ts`：這台裝置開過的旅程（含 token）；`src/stores/trip.ts`：目前開啟的旅程、讀取／重讀、`mutate()`、拖曳的樂觀更新、彙整的 computed
- `src/composables/useConflict.ts`：`saveWithConflict()`，別人改過時問「用我的覆蓋／看最新版本」
- `src/router.ts`：`/` 我的旅程、`/t/:token`（`JoinView` 記下 token 後以 replace 導到旅程頁，網址不留 token）、`/trips/:tripId`（`TripLayout` 底下行程／旅費／設定）
- 行程：`src/views/ItineraryView.vue`、`src/components/SpotList.vue`（SortableJS，拖完先把 DOM 放回原位再改資料）、`SpotCard.vue`、`SpotFormModal.vue`
- 旅費：`src/views/ExpensesView.vue`、`src/components/ExpenseFormModal.vue`、`TransferModal.vue`
- `supabase/schema.sql`：資料表、RLS、`current_trip_id()`、`bump_version()`、`create_trip()`／`regenerate_trip_token()`／`save_expense()`
- `.github/workflows/deploy.yml`：測試、打包、部署 Pages；`keepalive.yml`：每日不帶 token GET trips，預期 `[]`
- `vite.config.ts`：`base` 依 `VITE_BASE`／`GITHUB_REPOSITORY` 決定、PWA manifest
- `.claude/launch.json`：瀏覽器預覽設定 `trip-planner`（跑 `npm run dev`，port 5173）

## 業務規則指標（改之前先讀）

- 幣別與匯率（每趟一個當地幣別、旅費可記當地幣別或新台幣、結算用目前匯率）→ README「幣別與匯率」、`toTwd`
- 平分無條件進位、零頭由付錢的人多收；指定金額加總要等於總額、各自換算後四捨五入 → README「分攤」、`expenseDues`
- 要收／要付（全體加總必為 0）與最少轉帳 → README「要收／要付與轉帳建議」、`netBalances`／`simplifyDebts`
- 同時編輯的行為 → README「同時編輯」
- 改了上述任一規則，README 對應段落要同步更新

## 部署

- push 到 `main` → `.github/workflows/deploy.yml` 跑 `npm test`、`npm run build` 並部署到 `https://knowwhao.github.io/trip-planner/`
- 需要 repo secrets `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`，以及 Settings → Pages 的 Source 設成 GitHub Actions；沒設定 secrets 時網站以 Demo 模式運作
- Supabase 專案 `trip-planner`（ref `sqmmachdonlnuafysnti`，東京區）；改 schema 後到 SQL Editor 貼整份 `schema.sql` 執行

## 完成前的驗證

1. `npm test` 全過
2. `npm run build` exit code 0
3. UI 改動：用瀏覽器預覽 `.claude/launch.json` 的 `trip-planner` 實際操作，並在 375px 寬檢查版面；同時編輯相關的改動要開兩個分頁實測

## 程式碼註解

- 只寫程式碼本身講不出來的事（為什麼、隱藏限制、外部相依、workaround）
- 繁體中文、一句話講完、句尾不加句號；不寫改動過程敘事（那是 commit 訊息的事）

## Git

- commit 訊息：`feat:`／`fix:`／`docs:` + 繁體中文
- remote 是 `https://github.com/knowwHao/trip-planner`，push 到 `main` 會觸發部署
- **push 前一定要先問使用者**；不要 force push
