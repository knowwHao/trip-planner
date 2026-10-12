# 旅遊規劃

和旅伴一起排行程、記旅費的網頁：景點、時間、Google 地圖連結大家一起編輯，有人改了其他人畫面會自動更新；旅費可以記當地幣別或新台幣，結算一律換成新台幣，算出最少筆數的轉帳建議。

- 前端：Vue 3 + Vite + TypeScript + Tailwind CSS v4，可安裝成 PWA
- 資料：Supabase（免費方案即可）；沒設定時自動進入 **Demo 模式**，資料存在瀏覽器
- 存取：不用註冊帳號，每趟旅程有自己的**旅程連結**，拿到連結的人都能查看與編輯那一趟；沒有連結的人什麼都讀不到、改不了
- 同時編輯：存檔後其他旅伴的畫面即時更新；兩個人同時改同一筆時會先問要不要覆蓋（見「[同時編輯](#同時編輯)」）
- 部署：GitHub Pages（GitHub Actions 自動部署），網址 `https://knowwhao.github.io/trip-planner/`
- 原始碼：<https://github.com/knowwHao/trip-planner>
- 姊妹專案：[球友記帳](https://github.com/knowwHao/sports-ledger)（架構與做法相同）

## 功能

- **我的旅程**（首頁）：這台裝置開過的旅程，進行中與還沒出發的依出發日排在前面、已結束的排在後面，標示「還有 N 天」「旅行中・第 N 天」「已結束」；「建立新旅程」填名稱、出發與回程日、當地幣別與匯率、旅伴（空白或逗號分隔，選填）；「用旅程連結開啟」貼上旅伴傳來的連結（完整網址或只有 token 都可以）
- **行程**：
  - 依天分段（第 1 天、第 2 天…），最後是「**口袋名單**」——想去但還沒排進行程的地方
  - 景點有名稱、時間、地址、Google 地圖連結、預估花費（當地幣別，旁邊附新台幣約略金額）、備註；每天與整趟顯示預估花費合計
  - 按住卡片左邊的把手可以拖曳排序，也能拖到別天或口袋名單；在編輯框改「哪一天」會排到那天最後面
  - 某天有時間的景點順序亂了，那天的標題旁會出現「依時間排」，按一下照時間重排（沒填時間的維持原本位置）
  - 每張卡片右邊的「地圖」直接開 Google 地圖：有貼連結就用連結，沒有就用地址、再沒有就用名稱搜尋（不需要 Google API key）
  - 頂端日期列可以跳到某一天，今天會標出來
  - 旅程改短時，排在新天數之後的景點會先顯示在口袋名單（存檔前會提醒），之後可以再拖回去
- **旅費**：總花費與平均每人、轉帳建議（按「已轉帳」可改金額與日期後記下）、每個人的代墊／自己花／要收或要付、旅費紀錄（依日期分組，點一筆可編輯或刪除）、已轉帳紀錄（可刪除）
- **記一筆旅費**：品項 → 金額與幣別（當地幣別／新台幣切換）→ 誰付的 → 日期（列出旅程每一天，選填）→ 怎麼分（「勾選的人平分」或「各付各的金額」，見「[分攤](#分攤)」）→ 哪個景點（選填）、備註
- **設定**：旅程資訊（名稱、日期、當地幣別、匯率）、旅伴（一次新增多位、改名、移除）、旅程連結（複製、顯示、重新產生）、深色模式、從這台裝置移除、刪除整趟旅程
- 這台裝置沒有某趟的連結時顯示「這台裝置沒有這趟旅程的連結」；連結失效時提示跟旅伴要新連結，並可從這台裝置移除

## 計算規則

### 幣別與匯率

- 每趟旅程設一個**當地幣別**與**匯率**（1 單位當地幣別 = 多少新台幣）；國內旅遊選新台幣，就不會出現換算
- 每筆旅費可以記當地幣別或新台幣（例如機票在台灣刷卡、餐廳付日圓）；景點的預估花費一律記當地幣別
- 金額的小數位數依幣別：新台幣、日圓、韓元等不能有小數，美元、歐元等最多兩位
- 結算一律用旅程**目前的**匯率換成新台幣，四捨五入到元；改了匯率，所有外幣旅費都用新匯率重算
- 已經有當地幣別的旅費時不能換幣別（不然那些旅費會被當成新幣別算），要先改掉或刪掉那些旅費；這是在資料庫端強制的

### 分攤

- **勾選的人平分**：先把金額換成新台幣，每人應付 = `ceil(新台幣金額 ÷ 人數)`（無條件進位），零頭由付錢的人多收，畫面標示「除不盡進位，付錢的人多收 $X」——與球友記帳相同
- **各付各的金額**：每個人填自己要付的金額（與這筆同幣別），加總要剛好等於總額才能存檔；「剩下的平分給空白的人」會把還沒分配的金額平分給還沒填的人（除不盡的最小單位依序多分一點）；外幣時每個人的金額各自換成新台幣後四捨五入
- 付錢的人不一定要在分攤名單裡（例如幫別人付）

### 要付／要收（淨額）

```
淨額 = 代墊入帳 − 自己的應付總額 + 自己轉出的錢 − 自己收到的轉帳
```

- 正數＝別人要給他，畫面顯示「收 $X」；負數＝他要給別人，顯示「付 $X」；0 顯示「—」
- 「代墊入帳」以該筆旅費的**分攤加總**計（平分時含進位的零頭、指定金額時含四捨五入的差額），這樣全體淨額加總恰好為 0，轉帳建議才能把帳完全打平
- 「每個人」表格的「代墊」是付錢的人付出的新台幣金額、「自己花」是自己的應付總額，兩者不含轉帳

### 轉帳建議（最少轉帳）

貪婪法：每次讓「欠最多的人」付給「應收最多的人」，金額取兩者較小值，直到全部歸零。轉帳後按「已轉帳」記下來，淨額與建議會跟著更新；轉帳一律記新台幣整數。

邏輯在 `src/lib/split.ts`，測試在 `src/lib/split.test.ts`。

## 同時編輯

- 有人存檔後，同一趟旅程的其他人畫面會自動更新；頁首旅程日期前的小圓點是綠色代表即時同步連線中
- 手機休眠或斷線時會漏掉通知，所以切回頁面、網路恢復、以及每 2 分鐘都會再讀一次
- 兩個人同時改同一筆（景點、旅費、旅程資訊、旅伴名字）：
  - 編輯框開著時別人先存了，框的上方會出現「別人剛改過這筆」，可以按「看最新」；被刪掉時會提示存檔會失敗
  - 存檔時版本對不上，會問「用我的覆蓋」還是「看最新版本」，不會默默蓋掉別人的修改
  - 拖曳排序只改天數與順序，不算修改內容，不會讓別人正在編輯的景點變成衝突
- 原理：
  - 景點、旅費、旅程、旅伴都有 `version`，內容欄位變動時由資料庫觸發器自動 +1；更新時帶上自己看到的版本號，對不上就更新 0 列，前端再分辨是別人改過、已被刪除還是連結失效
  - 存檔成功後經 Supabase Realtime 在這趟旅程的頻道廣播「有東西改了」，**不帶任何資料**，其他人收到後再帶 token 經 RLS 重新讀取；頻道名稱是 token 的 SHA-256，旁人從頻道名稱反推不出 token
  - Demo 模式以瀏覽器的 BroadcastChannel 模擬，同一個瀏覽器開兩個分頁就能試

## 本機開發（Demo 模式）

需要 Node.js 22（22.12 以上）或 24，這是 vitest 5 的要求；CI 用 Node 22。

```bash
npm ci             # 依 package-lock.json 安裝
npm run dev        # http://localhost:5173
npm test           # 單元測試（vitest）
npm run build      # 型別檢查 + 打包到 dist/
```

不設定任何環境變數就會進入 Demo 模式：

- 頂端會出現「Demo 模式」提示條
- 首頁按「開一趟示範旅程」會建立一趟一個月後出發的東京五天四夜（4 位旅伴、十幾個景點與口袋名單、日圓與新台幣的旅費、平分與指定金額、一筆已轉帳）；每按一次多一趟，不要的可以在設定刪除
- 也能自己建立新旅程；「設定」裡的 `#/t/<token>` 連結在同一個瀏覽器也能開（資料只存在 localStorage）
- 同一個瀏覽器開兩個分頁就能試同時編輯

## Supabase 設定

1. 到 [supabase.com](https://supabase.com) 建立新專案（Free 方案即可，每個帳號可同時有 2 個免費專案），記下資料庫密碼。本專案是東京區的 `trip-planner`。
2. 左側 **SQL Editor** → New query，把 [`supabase/schema.sql`](supabase/schema.sql) 整份貼上執行。這份 SQL 可以重複執行，之後改版也是貼整份再跑一次，會建立：
   - 資料表 `trips`、`participants`、`spots`、`expenses`、`expense_shares`、`transfers`，以及外鍵、索引；子表參照旅伴、景點、旅費一律用帶 `trip_id` 的複合外鍵，不可能把別趟旅程的資料掛進來
   - `trips.token`：旅程連結用的隨機 token（244 bit），建立旅程時自動產生
   - RLS：每張表都要帶正確 token 才能讀寫，而且只碰得到那一趟；沒帶或帶錯時 select 是 0 筆、寫入被擋；`truncate` 權限已收回
   - `current_trip_id()`：RLS 用的檢查函式，從請求的 `x-trip-token` header 找出對應的旅程
   - `create_trip()`：任何人都能呼叫，建立旅程與旅伴並回傳 token；`trips` 不能直接新增
   - `regenerate_trip_token()`：帶正確 token 才能呼叫，換發並回傳新 token；token 欄位不能直接修改
   - `save_expense()`：旅費連同分攤一起寫入，並檢查幣別、指定金額加總與版本號
   - `bump_version()` 觸發器（內容變動時版本 +1）與 `check_trip_currency()` 觸發器（有外幣旅費時不能換幣別）
   - 預設權限：之後在 `public` 新建的表、函式、序列不再自動授權給 `anon`／`authenticated`，要自己明確 grant
3. 這個專案**不使用 Supabase Auth**，但仍建議到 **Authentication → Sign In / Providers** 關閉 **Allow new users to sign up**：anon key 是公開的，不關閉的話任何人都能註冊成 `authenticated` 使用者（目前 RLS 對 `anon` 與 `authenticated` 一視同仁，註冊了也讀不到資料，關閉是多一層保險）。
4. Realtime 不用另外設定；如果曾經在 **Realtime → Settings** 關掉「Allow public access」，要打開，否則即時同步會失效（還是會在切回頁面時更新）。
5. 取得連線資訊：**Project Settings → API**（或 Data API），複製 **Project URL** 與 **anon public key**。
6. 本機要連 Supabase 的話，在專案根目錄建立 `.env.local`：

   ```bash
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

   `.env*` 已列在 `.gitignore`，不會被 commit。anon key 本來就會出現在前端，資料安全靠 RLS 保護；**絕對不要**把 `service_role` key 放進前端或 GitHub secrets。

Supabase 的安全檢查（Advisors）會對 `create_trip()`、`current_trip_id()`、`regenerate_trip_token()` 提出「anon 可以執行 SECURITY DEFINER 函式」的警告，這是刻意的：任何人都能建立旅程，另外兩個只作用在呼叫者自己帶的 token 那一趟。

## 部署到 GitHub Pages

1. 在 GitHub 建立 repo（本專案是 `https://github.com/knowwHao/trip-planner`），把專案 push 到 `main`。
2. **Settings → Secrets and variables → Actions → New repository secret**，新增：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   （不設定也能部署，網站會以 Demo 模式運作。）
3. **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
4. 之後每次 push 到 `main`，`.github/workflows/deploy.yml` 會跑測試、打包並部署。網址是 `https://<帳號>.github.io/<repo>/`，本專案為 `https://knowwhao.github.io/trip-planner/`；打包時會自動以 repo 名稱設定 Vite 的 `base`。第一次部署成功後，以 **Settings → Pages** 顯示的網址為準。
5. 路由使用 hash 模式（網址長得像 `.../#/trips/…`），GitHub Pages 重新整理深層頁面也不會 404。
6. 網站是 PWA，會用 service worker 快取整個網站。部署新版後，使用者下次打開網站（或把 App 從背景切回前景）時會在背景下載新版，畫面底部跳出「有新版本可以用了」，按「立即更新」就會重新載入成新版；按 ✕ 會先繼續用舊版，下次打開會再提示。正在填表單時不會自動重新整理，避免填到一半的內容消失。
7. 球友記帳也部署在同一個網域（`knowwhao.github.io`），兩個網站共用瀏覽器的 localStorage，所以本專案的鍵名一律以 `trip-` 開頭，避免互相覆蓋。

### 避免 Supabase 免費專案被暫停

Supabase 免費專案閒置一週會被暫停。`.github/workflows/keepalive.yml` 每天以 GET 呼叫一次 `/rest/v1/trips?select=id&limit=1`（不帶旅程 token）保持活躍，預期回傳 200 與空陣列；回傳不是空陣列代表 RLS 失守，workflow 會失敗。secrets 沒設定時會直接成功跳過。

**注意**：
- 排程只會從預設分支（`main`）執行，workflow 檔要合併進 `main` 才會開始每天跑
- public repo 連續 60 天沒有任何活動（commit 等）時，GitHub 會自動停用 schedule 排程，keepalive 就不會再跑。停用期間只要 Supabase 連續 7 天沒有收到請求，專案就會被暫停。收到 GitHub 的停用通知或發現排程沒在跑時，到 repo 的 **Actions → Supabase keepalive** 頁面按 **Enable workflow** 重新啟用；專案若已被暫停，要到 Supabase Dashboard 手動恢復（Restore）

## 旅程連結

- 網址格式為 `https://knowwhao.github.io/trip-planner/#/t/<token>`；建立旅程後到 **設定 → 旅程連結** 按「複製連結」，貼到旅伴群組即可
- 開啟後網站會把 token 記在這台裝置的 localStorage（首頁「我的旅程」），並立刻把 token 從網址移除，避免截圖外流
- 拿到連結的人都能查看與編輯那一趟；前端把 token 放在每個 API 請求的 `x-trip-token` header，資料庫的 RLS 以 `current_trip_id()` 比對，沒有 token 的人（包括直接打 API 的陌生人或機器人）讀不到也改不了，拿 A 旅程的連結也碰不到 B 旅程
- 伺服器端沒有「所有旅程」的清單，任何人都看不到別人建了哪些旅程；換一台裝置要再用連結開一次
- 連結外流或有人不該再看到時，按「重新產生」，舊連結立即失效（已開過的裝置也會看到「連結已失效」），再把新連結傳給旅伴
- 設定頁的連結預設遮住 token，按「顯示」才看得到完整網址；「複製連結」一律複製完整網址
- 「從這台裝置移除」只是這台裝置不再記得，資料還在；「刪除整趟旅程」會把行程、旅費、轉帳紀錄全部永久刪除，所有旅伴都看不到，無法復原

### 連結遺失、外流或被搶先重新產生時

拿到連結的人也能按「重新產生」，外流後若對方搶先換掉 token，你手上的連結會跟著失效、網站上也無從換回；大家都弄丟連結時也一樣。這時到 Supabase Dashboard 的 **SQL Editor**：

- 只是找回連結（不換 token）：

  ```sql
  select name, start_date, token from public.trips order by created_at desc;
  ```

- 換掉 token（把「東京五天四夜」換成旅程名稱），所有舊連結（包括對方手上的）立即失效：

  ```sql
  update public.trips set token = public.new_trip_token() where name = '東京五天四夜' returning name, token;
  ```

SQL Editor 以資料表擁有者 `postgres` 身分執行，不受 RLS 與旅程 token 限制。拿回傳的 token 組成 `https://knowwhao.github.io/trip-planner/#/t/<token>` 傳給旅伴。

## 專案結構

```
src/
  lib/split.ts          分攤、要付／要收（淨額）、最少轉帳、每人摘要（純函式＋測試）
  lib/money.ts          幣別、小數位數、換算、金額格式與解析
  lib/format.ts         日期與旅程天數
  lib/maps.ts           Google 地圖連結（只接受 http(s)）
  lib/order.ts          拖曳排序的排序值（取前後中間值）
  data/repository.ts    資料層介面與錯誤類型
  data/supabaseRepo.ts  Supabase 實作（含 Realtime 廣播）
  data/demoRepo.ts      Demo 實作（localStorage + BroadcastChannel）
  data/demoSeed.ts      示範旅程產生器
  data/writeCheck.ts    更新 0 列時分辨連結失效、別人改過、資料已不在
  stores/               Pinia：這台裝置的旅程清單、目前開啟的旅程
  composables/          同時編輯的衝突處理、toast、確認框、深色模式
  views/                各頁面（我的旅程、開啟連結、行程、旅費、設定）
  components/           共用元件（modal、景點卡片與拖曳清單、旅費與轉帳表單…）
supabase/schema.sql     資料庫結構、RLS、旅程 token 與旅費 RPC
.github/workflows/      部署與 keepalive
```

## 用 Claude Code 繼續開發

根目錄的 [`CLAUDE.md`](CLAUDE.md) 寫了常用指令、目錄地圖和硬性規則，每個 Claude Code session 都會自動載入。開新 session 後可以直接這樣下指令：

- 「景點加一個『營業時間』欄位，Supabase schema、型別、兩個 repo 和示範資料一起改，記得用 PGlite 驗 RLS」
- 「旅費可以拍收據照片附上去，先跟我討論要存在哪裡」
- 「跑測試，再開瀏覽器用 375px 寬檢查手機版有沒有水平溢出」
- 「開兩個分頁測同時編輯：一邊改景點、一邊拖曳排序，看會不會互相蓋掉」
- 「轉帳建議的金額怪怪的，先補一個能重現的測試再修」
- 「GitHub Actions 部署失敗了，幫我看原因」（先把 Actions 頁面的錯誤 log 貼給它）
- 「改完了，幫我 commit」（push 前它會先問你）
