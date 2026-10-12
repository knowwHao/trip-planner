# 旅遊規劃

和旅伴一起排行程、記旅費的網頁：每趟旅程有自己的連結，拿到連結的人都能新增與編輯景點，大家同時改也會即時看到彼此的修改；旅費支援當地幣別，結算一律換成新台幣，算出最少筆數的轉帳。

- 前端：Vue 3 + Vite + TypeScript + Tailwind CSS v4，可安裝成 PWA
- 資料：Supabase（免費方案即可）；沒設定時自動進入 **Demo 模式**，資料存在瀏覽器
- 存取：不用註冊帳號，拿到**旅程連結**的人都能查看與編輯那一趟；沒有連結的人什麼都讀不到、改不了
- 部署：GitHub Pages（GitHub Actions 自動部署），網址 `https://knowwhao.github.io/trip-planner/`
- 原始碼：<https://github.com/knowwHao/trip-planner>

## 功能

- **我的旅程**（首頁）：這台裝置開過的旅程（依出發日排，顯示「還有 N 天」「旅行中」「已結束」）、建立新旅程、貼上旅程連結開啟；Demo 模式可以開一趟示範旅程
- **行程**：依天分段，最後是「口袋名單」（還沒排進行程的地方）
  - 景點有名稱、時間、地址、Google 地圖連結、預估花費（當地幣別）、備註
  - 按住卡片左邊的把手可以拖曳排序，也能拖到別天；某天的時間順序亂了會出現「依時間排」
  - 每張卡片右邊的「地圖」直接在 Google 地圖開啟：有貼連結用連結，沒有就用地址、再沒有就用名稱搜尋
  - 頂端日期列可以跳到某一天，今天會標出來
- **旅費**：總花費、轉帳建議（按「已轉帳」記下來）、每個人代墊／自己花／要收或要付、旅費紀錄（依日期分組）、已轉帳紀錄
- **設定**：旅程資訊（名稱、日期、當地幣別、匯率）、旅伴（新增、改名、移除）、旅程連結（複製、顯示、重新產生）、深色模式、從這台裝置移除、刪除整趟旅程

## 同時編輯

- 有人存檔後，同一趟旅程的其他人畫面會自動更新（Supabase Realtime 廣播），頁首旅程日期前的小圓點是綠色代表即時同步連線中
- 手機休眠、斷線時會漏掉通知，所以切回頁面、網路恢復、以及每 2 分鐘都會再讀一次
- 兩個人同時改同一筆（景點、旅費、旅程資訊、旅伴名字）：
  - 編輯框開著時別人先存了，框的上方會出現「別人剛改過這筆」，可以按「看最新」
  - 存檔時版本對不上，會問「用我的覆蓋」還是「看最新版本」，不會默默蓋掉別人的修改
  - 拖曳排序只改天數與順序，不算修改內容，不會讓別人正在編輯的景點變成衝突
- 原理：資料表的 `version` 在內容欄位變動時自動 +1，更新時帶上自己看到的版本號；廣播只傳「有東西改了」不帶資料，收到後再帶 token 經 RLS 重新讀取，頻道名稱是 token 的雜湊，旁人反推不出 token

## 計算規則

### 幣別與匯率

- 每趟旅程設一個**當地幣別**與**匯率**（1 單位當地幣別 = 多少新台幣），國內旅遊就是新台幣
- 每筆旅費可以記當地幣別或新台幣（例如機票在台灣刷卡、餐廳付日圓）
- 結算一律用旅程目前的匯率換成新台幣，金額四捨五入到元；改了匯率，所有外幣旅費會用新匯率重算
- 已經有當地幣別的旅費時不能換幣別（不然那些旅費會被當成新幣別算），要先改掉或刪掉那些旅費

### 分攤

- **勾選的人平分**：先把金額換成新台幣，每人應付 = `ceil(新台幣金額 ÷ 人數)`（無條件進位），零頭由付錢的人多收，畫面會標示「付錢的人多收 $X」
- **各付各的金額**：每個人填自己要付的金額（與這筆同幣別），加總要剛好等於總額；可以按「剩下的平分給空白的人」；每人的金額各自換成新台幣後四捨五入
- 付錢的人不一定要在分攤名單裡（例如幫別人付）

### 要收／要付與轉帳建議

- 每筆旅費：付錢的人 + 每位分攤者應付的新台幣，分攤者各 − 自己應付
- 每筆已轉帳：轉出的人 + 金額，收款的人 − 金額
- 正數是要收、負數是要付，全體加總必為 0（付錢的人入帳的是分攤加總，四捨五入的差額由他吸收）
- 轉帳建議用貪婪法：每次讓欠最多的人付給該收最多的人，得到筆數最少的轉帳
- 程式在 `src/lib/split.ts`，測試在 `src/lib/split.test.ts`

## 本機開發

需要 Node 22.12+ 或 24。

```bash
npm ci
npm run dev        # http://localhost:5173，沒有 .env 時是 Demo 模式
npm test           # 單元測試
npm run build      # 型別檢查 + 打包到 dist/
```

要連真的 Supabase：複製 `.env.example` 成 `.env.local`，填入 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`。

## 設定 Supabase

1. 在 Supabase 建立專案（免費方案每個帳號可同時有 2 個專案）
2. Dashboard → SQL Editor，貼上整份 [`supabase/schema.sql`](supabase/schema.sql) 執行；可重複執行，之後改版也是貼整份再跑一次
3. Dashboard → Project Settings → API，記下 Project URL 與 `anon` public key（或 `sb_publishable_…` 開頭的 publishable key）
4. Realtime 不用另外設定；如果曾經在 Realtime Settings 關掉「Allow public access」，要打開，否則即時同步會失效（還是會在切回頁面時更新）

權限模型（細節見 `schema.sql` 開頭的註解）：

- 每張表都開了 RLS，前端每個請求帶 `x-trip-token` header，`current_trip_id()` 找出對應的旅程，只能讀寫那一趟
- 旅程只能經 `create_trip()` 建立、token 只能經 `regenerate_trip_token()` 換發；旅費經 `save_expense()` 連同分攤一起寫入
- 子表的外鍵都帶 `trip_id`，不可能把別趟旅程的旅伴或景點掛進來
- 任何拿到網站的人都能建立新旅程，但看不到別人的旅程（伺服器端沒有旅程清單，「我的旅程」只存在各自的裝置）

## 部署到 GitHub Pages

1. GitHub repo → Settings → Secrets and variables → Actions，新增兩個 repository secrets：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（沒設定時網站以 Demo 模式運作）
2. GitHub repo → Settings → Pages → Build and deployment → Source 選 **GitHub Actions**
3. push 到 `main` 就會自動跑測試、打包並部署（`.github/workflows/deploy.yml`），也可以在 Actions 頁手動執行
4. `.github/workflows/keepalive.yml` 每天不帶 token 查一次 `trips`，預期回 `[]`：一方面讓 Supabase 免費專案不會因為一週沒活動被暫停，一方面確認 RLS 沒有失守。repo 連續 60 天沒有任何活動時 GitHub 可能自動停用排程，到 Actions 頁按「Enable workflow」即可

## 連結外流或遺失

- 外流：到「設定 → 旅程連結 → 重新產生」，舊連結立即失效，再把新連結傳給旅伴
- 大家都弄丟連結：到 Supabase SQL Editor 查

  ```sql
  select name, start_date, token from public.trips order by created_at desc;
  ```

  組成 `https://knowwhao.github.io/trip-planner/#/t/<token>` 即可
