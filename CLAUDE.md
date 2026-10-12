# 旅遊規劃（trip-planner）

旅伴一起排行程、記旅費的 SPA：每趟旅程有自己的成員，景點可多人同時編輯，旅費支援當地幣別、結算換成新台幣並算出最少轉帳。
Vue 3 + Vite + TypeScript + Tailwind CSS v4 + Pinia + Vue Router（hash 模式）+ PWA + SortableJS；
資料在 Supabase（未設定 env 時進 Demo 模式，存 localStorage）；部署在 GitHub Pages。
一定要登入：帳號是名稱＋6～8 位數字密碼（做法同 sports-ledger 的成員密碼），沒登入時 `App.vue` 一律顯示 `AuthView`；
登入憑證走 `x-account-id`／`x-account-key` header，RLS 只放行自己是成員（`participants.account_id`）的旅程；
任何成員都能加人、移人（`add_trip_member()`／`remove_trip_member()`），旅程至少留一位成員；沒有帳號的旅伴是「只記帳」（`account_id` 為 null）。
沒有旅程連結（舊版的 `#/t/<token>` 與 `trips.token` 已拿掉）。
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
- **改 schema**：每張表都要開 RLS、有 `trip_all` policy（子表 `using`／`with check` 都是 `trip_id in (select my_trip_ids())`）、
  明確 grant 給 anon／authenticated（預設權限已收回）且收回 truncate（唯一例外是 `accounts`：完全不授權、沒有 policy，只能經函式存取）；子表參照旅伴／景點一律用帶 `trip_id` 的複合外鍵；
  新增 view 一律 `with (security_invoker = true)`；新增函式要 `revoke execute ... from public` 再明確 grant；
  有內容欄位的表要掛 `bump_version` 觸發器（排序欄位列在它的 skip 清單裡）；新欄位一律寫在「後來加的欄位」段落用 `add column if not exists`，跨欄位 check 用具名 constraint 包在 `if not exists` 裡；
  `schema.sql` 要可重複執行，也要能套在舊版 DB 上升級；改完用 PGlite（`@electric-sql/pglite`，不在依賴內，臨時裝在專案外）
  實跑 `schema.sql` 兩次，需先替身 `anon`／`authenticated` 角色，以 `set_config('request.headers', '{"x-account-id":"…","x-account-key":"…"}', true)` 模擬 header，
  驗沒登入／憑證錯誤讀不到也寫不進、不是成員碰不到那一趟；並同步 `src/types.ts`、兩個 repo 實作與 `src/data/demoSeed.ts`
- **旅程與成員的寫入**：`trips` 只能經 `create_trip()` 新增（建立者自動成為成員）、`participants.account_id` 只能經 `add_trip_member()`／`remove_trip_member()` 異動，
  不要重新 grant `trips` 的 insert 或 `participants` 的 `account_id`；旅費一律經 `save_expense()` 連同分攤一起寫；
  `keep_one_member` 觸發器擋最後一位成員離開，`sync_member_name` 讓成員名字固定是帳號名稱
- **同時編輯**：改內容一律帶 version（樂觀鎖），版本不符要丟 `ConflictError` 讓畫面走 `saveWithConflict()`；
  寫入一律經 `trip` store 的 `mutate()`（成功後會廣播通知其他人並重讀）；拖曳排序只改 `day`／`sort_key`、子項目打勾只改 `done`，都不檢查版本
- **帳號**：密碼格式與鎖定次數在 `src/lib/pin.ts`，要與 `schema.sql` 一致；使用者清單（`list_accounts()`）只給登入的人，不要回傳名稱以外的欄位
- **改金額或結算邏輯**：先在 `src/lib/split.test.ts` 補會失敗的測試，再改 `split.ts`；結算金額一律新台幣整數，外幣在換算時才四捨五入
- **手機版**：375px 寬不可水平溢出（`document.documentElement.scrollWidth` 不得大於視窗寬）
- 路由是 hash 模式，站內連結用 router 產生；旅程網址是 `#/trips/<id>`，只有成員打得開

## 目錄地圖

- `src/lib/split.ts`：分攤（平分／指定金額）、淨額、最少轉帳、每人摘要的**唯一來源**（純函式），測試 `split.test.ts`
- `src/lib/category.ts`：行程類型與預約狀態的文字、預設值、卡片上點標籤的切換，要與 schema 的 `spots.category` check 和 `spots_booking_fits_category` 一致
- `src/lib/money.ts`：幣別清單、小數位數、換算、金額格式與解析（`parseSum` 可輸入加法）；`format.ts`：日期與旅程天數；`maps.ts`：Google 地圖連結（只用連結或地址，都沒有就不給）；
  `flight.ts`：航班號碼整理、航班摘要（`flight_no` 格式要與 schema 的 check 一致）；`order.ts`：排序值（取中間值）
- `src/data/repository.ts`：資料層介面與 `NoAccessError`／`AccountSessionError`／`ConflictError`／`InUseError`／`LastMemberError`；實作 `supabaseRepo.ts`（Supabase + Realtime 廣播）、
  `demoRepo.ts`（localStorage，以 `me()`／`guard()` 模擬登入與成員 RLS、版本號與刪除限制，BroadcastChannel 模擬即時同步，測試 `demoRepo.test.ts`）
- `src/data/writeCheck.ts`：RLS 擋下或版本不符時 update／delete 只會 0 列不報錯，`supabaseRepo.ts` 一律 `.select(…)` 後經 `expectAffected` 判定
  （0 列時再確認還看不看得到旅程與這筆是否還在，分辨不是成員、別人改過、資料已不在；看不到旅程時再以 `whoami()` 分辨登入失效）
- `src/data/realtime.ts`：即時同步的頻道名稱（旅程 id 的 SHA-256），廣播只傳「有東西改了」
- `src/data/index.ts`：依 `VITE_SUPABASE_*` 有無選 repo；`demoSeed.ts` 是示範旅程
- `src/stores/account.ts`：登入憑證（localStorage `trip-account`，`setSession()` 同步換掉 repo 的身分）、開站驗證、使用者清單；
  `src/views/AuthView.vue`：登入／註冊（註冊時即時檢查名稱）；`src/components/AccountModal.vue`：改密碼、登出
- `src/stores/trip.ts`：目前開啟的旅程、讀取／重讀、`mutate()`、拖曳的樂觀更新、彙整的 computed（含 `me`：自己在這趟的旅伴資料）
- `src/composables/useConflict.ts`：`saveWithConflict()`，別人改過時問「用我的覆蓋／看最新版本」
- `src/router.ts`：`/` 我的旅程（`HomeView` 向伺服器讀自己參加的旅程）、`/trips/:tripId`（`TripLayout` 底下行程／旅費／設定）
- 成員：`src/views/TripSettingsView.vue` 的旅伴區塊（加入、移出、只記帳旅伴換成帳號、退出）、`src/components/MemberPickerModal.vue`（列出註冊使用者）、
  `TripFormModal.vue` 建立旅程時勾選成員
- 行程：`src/views/ItineraryView.vue`（已過的天收合）、`src/components/SpotList.vue`（SortableJS，拖完先把 DOM 放回原位再改資料）、`SpotCard.vue`、`SpotFormModal.vue`；
  子項目：`SpotItems.vue`（卡片裡的子清單，各行程各自一組 Sortable）、`ItemFormModal.vue`、`src/composables/useExpanded.ts`（展開狀態）；
  行程的旅費：`SpotExpensesModal.vue`（依 `expenses.spot_id`，從行程記帳以 `ExpenseFormModal` 的 `preset` 帶入行程與日期）
- 旅費：`src/views/ExpensesView.vue`、`src/components/ExpenseFormModal.vue`、`TransferModal.vue`
- `supabase/schema.sql`：資料表、RLS、`current_account_id()`／`my_trip_ids()`、`bump_version()`、`create_trip()`／`add_trip_member()`／`remove_trip_member()`／`save_expense()`、帳號函式
- `.github/workflows/deploy.yml`：測試、打包、部署 Pages；`keepalive.yml`：每日不帶登入憑證 GET trips，預期 `[]`
- `vite.config.ts`：`base` 依 `VITE_BASE`／`GITHUB_REPOSITORY` 決定、PWA manifest
- `.claude/launch.json`：瀏覽器預覽設定 `trip-planner`（跑 `npm run dev`，port 5173）

## 業務規則指標（改之前先讀）

- 幣別與匯率（每趟一個當地幣別、旅費可記當地幣別或新台幣、結算用目前匯率）→ README「幣別與匯率」、`toTwd`
- 平分無條件進位、零頭由付錢的人多收；指定金額加總要等於總額、各自換算後四捨五入 → README「分攤」、`expenseDues`
- 實際扣款（外幣旅費照帳單金額換算，指定金額時依比例分配且加總恰好等於扣款）→ README「實際扣款」、`expenseDues`／`expenseTwd`
- 行程類型與預約狀態（預設「還沒」、「無需」不顯示、口袋名單與已過的天不算待辦）→ README「類型與預約狀態」、`src/lib/category.ts`
- 航班、已過的天、地圖圖示何時顯示 → README「功能」的行程段落
- 要收／要付（全體加總必為 0）與最少轉帳 → README「要收／要付與轉帳建議」、`netBalances`／`simplifyDebts`
- 同時編輯的行為 → README「同時編輯」
- 子項目（一個行程底下多間店）→ README「功能」的行程段落
- 帳號與成員（一定要登入、誰能加人移人、只記帳的旅伴、至少一位成員、忘記密碼與把人加回旅程的 SQL）→ README「帳號與成員」
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
