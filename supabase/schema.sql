-- =============================================================
-- 旅遊規劃 Supabase schema
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行即可；可重複執行，也可套在舊版資料庫上升級
--
-- 帳號成員制：要先註冊／登入（名稱＋6～8 位數字密碼），只看得到自己是成員的旅程；
-- 任何成員都能把其他註冊使用者加進旅程或移出，旅程至少要留一位成員
--
-- 原理：前端在每個 API 請求帶 x-account-id 與 x-account-key header，current_account_id() 驗證登入憑證，
-- my_trip_ids() 列出這個帳號參加的旅程，RLS 一律以 trip_id in my_trip_ids() 比對；
-- 子表之間的外鍵都帶 trip_id，參照不到別趟旅程的資料
--
-- 旅伴（participants）account_id 有值的是成員（看得到、能編輯）；被移出的人 account_id 變 null，留著名字讓旅費紀錄照常結算
-- 幫不是旅伴的人買的部分記在 expense_proxies（代購），不進旅伴之間的結算
-- 代購清單（wish_items、wish_photos）是每個人自己的，只有自己讀寫得到；記帳時 expense_proxies.wish_item_id 指回清單項目
--
-- 同時編輯：內容欄位改動時 version 自動 +1，前端以 version 做樂觀鎖，
-- 版本對不上（別人剛改過）時更新 0 列，前端再判斷是衝突、資料已刪除還是已經不是成員
-- =============================================================

-- ---------- 預設權限 ----------
-- Supabase 預設把 postgres 日後建立的表、函式、序列全部授權給 anon／authenticated，新物件一建好就對外公開；
-- 改成預設不授權，本檔的物件都在下方明確 grant。之後新增物件的規則：
--   table：開 RLS、加 trip_all policy、明確 grant；view：一律 with (security_invoker = true)，否則會繞過 RLS；
--   函式：PostgreSQL 內建讓 public 可執行，不受這裡影響，要自己 revoke execute ... from public 再明確 grant
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- 兩個 v4 UUID 共 244 bit 隨機，用於密碼的鹽與登入憑證；用內建 gen_random_uuid 免得依賴 pgcrypto 所在的 schema
create or replace function public.new_secret()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

-- ---------- 資料表 ----------

create table if not exists public.trips (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 40),
  start_date date not null,
  end_date   date not null,
  -- 當地幣別；fx_rate 是 1 單位當地幣別等於多少新台幣，結算一律換成新台幣
  currency   text not null default 'TWD' check (currency ~ '^[A-Z]{3}$'),
  fx_rate    numeric(14, 6) not null default 1 check (fx_rate > 0 and fx_rate < 100000),
  version    int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_dates_ok check (end_date >= start_date and end_date - start_date < 60),
  constraint trips_twd_rate check (currency <> 'TWD' or fx_rate = 1)
);

-- 帳號：名稱＋6～8 位數字密碼；完全不授權給前端，只能經下方 account_* 等函式存取
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 2 and 20),
  pin_salt        text not null,
  pin_hash        text not null,
  -- 登入憑證；改密碼時換掉，其他裝置就得重新登入
  session_key     text not null,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now()
);
create unique index if not exists accounts_name_key on public.accounts (lower(btrim(name)));

create table if not exists public.participants (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 20),
  sort_order int not null default 0,
  version    int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, name),
  -- 給子表的複合外鍵用，確保參照的參與者屬於同一趟旅程
  unique (id, trip_id)
);

create table if not exists public.spots (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  -- 第幾天；null 是還沒排進行程的口袋名單
  day        int check (day between 1 and 60),
  start_time time,
  title      text not null check (length(btrim(title)) between 1 and 80),
  address    text not null default '' check (length(address) <= 200),
  -- 只收 http(s)，避免 javascript: 之類的連結被點開
  map_url    text not null default '' check (length(map_url) <= 1000 and (map_url = '' or map_url ~* '^https?://')),
  note       text not null default '' check (length(note) <= 2000),
  -- 同一天內的排序；搬動時取前後兩個的中間值，只改被搬的那一筆
  sort_key   double precision not null default 0,
  version    int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trip_id)
);

create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  title      text not null check (length(btrim(title)) between 1 and 60),
  -- 以 currency 計的金額；currency 只能是新台幣或旅程的當地幣別（save_expense 與 trips 的觸發器把關）
  amount     numeric(14, 2) not null check (amount > 0 and amount < 100000000),
  currency   text not null check (currency ~ '^[A-Z]{3}$'),
  payer_id   uuid not null,
  -- even：勾選的人平分；custom：各付各的指定金額（expense_shares.amount）
  split_mode text not null default 'even' check (split_mode in ('even', 'custom')),
  spent_on   date,
  spot_id    uuid,
  note       text not null default '' check (length(note) <= 500),
  version    int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trip_id),
  foreign key (payer_id, trip_id) references public.participants (id, trip_id),
  -- 景點刪掉時只清 spot_id，trip_id 要留著
  foreign key (spot_id, trip_id) references public.spots (id, trip_id) on delete set null (spot_id)
);

create table if not exists public.expense_shares (
  expense_id     uuid not null,
  trip_id        uuid not null references public.trips (id) on delete cascade,
  participant_id uuid not null,
  -- 平分時為 null；指定金額時是這個人要付的金額（與費用同幣別）
  amount         numeric(14, 2) check (amount >= 0 and amount < 100000000),
  primary key (expense_id, participant_id),
  foreign key (expense_id, trip_id) references public.expenses (id, trip_id) on delete cascade,
  foreign key (participant_id, trip_id) references public.participants (id, trip_id)
);

create table if not exists public.transfers (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  from_id    uuid not null,
  to_id      uuid not null,
  -- 結算一律新台幣整數
  amount     int not null check (amount > 0 and amount < 100000000),
  paid_on    date not null default current_date,
  note       text not null default '' check (length(note) <= 200),
  created_at timestamptz not null default now(),
  check (from_id <> to_id),
  foreign key (from_id, trip_id) references public.participants (id, trip_id),
  foreign key (to_id, trip_id) references public.participants (id, trip_id)
);

-- 行程底下的子項目，例如一區裡要逛的多間店；獨立成表，兩個人同時勾不同項目才不會互相衝突
create table if not exists public.spot_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  spot_id    uuid not null,
  title      text not null check (length(btrim(title)) between 1 and 80),
  address    text not null default '' check (length(address) <= 200),
  map_url    text not null default '' check (length(map_url) <= 1000 and (map_url = '' or map_url ~* '^https?://')),
  note       text not null default '' check (length(note) <= 1000),
  -- 已逛過；與排序一樣不算內容修改，不加版本
  done       boolean not null default false,
  sort_key   double precision not null default 0,
  version    int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (spot_id, trip_id) references public.spots (id, trip_id) on delete cascade
);

-- 代購：一筆旅費裡幫不是旅伴的人買的部分，付錢的人自己跟對方收；只能經 save_expense() 連同費用一起寫
create table if not exists public.expense_proxies (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 20),
  -- 與費用同幣別
  amount     numeric(14, 2) not null check (amount > 0 and amount < 100000000),
  sort_order int not null default 0,
  foreign key (expense_id, trip_id) references public.expenses (id, trip_id) on delete cascade
);

-- 代購清單：每個人自己的，同一趟的其他旅伴也看不到（RLS 另外比對 owner_id）
create table if not exists public.wish_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  owner_id   uuid not null references public.accounts (id) on delete cascade,
  -- 幫誰買
  recipient  text not null check (length(btrim(recipient)) between 1 and 20),
  title      text not null check (length(btrim(title)) between 1 and 80),
  qty        int not null default 1 check (qty between 1 and 999),
  note       text not null default '' check (length(note) <= 1000),
  url        text not null default '' check (length(url) <= 1000 and (url = '' or url ~* '^https?://')),
  -- 打算在哪個行程買；行程刪掉時只清 spot_id
  spot_id    uuid,
  -- todo 待買、bought 已買、unavailable 買不到；與排序、排地點一樣不算內容修改，不加版本
  status     text not null default 'todo' check (status in ('todo', 'bought', 'unavailable')),
  sort_key   double precision not null default 0,
  version    int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trip_id),
  -- 給照片的複合外鍵用，照片只能掛在自己的項目上
  unique (id, trip_id, owner_id),
  foreign key (spot_id, trip_id) references public.spots (id, trip_id) on delete set null (spot_id)
);

-- 代購項目的照片：前端壓縮成 JPEG 後以 data URL 存進資料庫，權限才能沿用 RLS；縮圖給清單、大圖點開才讀
create table if not exists public.wish_photos (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  owner_id   uuid not null,
  thumb      text not null check (length(thumb) <= 60000 and thumb ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'),
  full_image text not null check (length(full_image) <= 700000 and full_image ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (item_id, trip_id, owner_id) references public.wish_items (id, trip_id, owner_id) on delete cascade
);

-- ---------- 清除舊版（旅程連結版）殘留 ----------
-- 舊版以 x-trip-token 比對旅程連結；policy 依賴 current_trip_id()，要先拆掉 policy 才能刪函式，下方 RLS 段落會重建
do $$
declare t text;
begin
  foreach t in array array['trips', 'participants', 'spots', 'expenses', 'expense_shares', 'transfers', 'spot_items', 'expense_proxies',
                           'wish_items', 'wish_photos'] loop
    execute format('drop policy if exists trip_all on public.%I', t);
  end loop;
end;
$$;
drop function if exists public.regenerate_trip_token();
drop function if exists public.create_trip(text, date, date, text, numeric, text[]);
drop function if exists public.save_expense(jsonb, jsonb);
-- 只記帳旅伴與代購之前的版本
drop function if exists public.create_trip(text, date, date, text, numeric, uuid[], text[]);
drop function if exists public.save_expense(uuid, jsonb, jsonb);
drop function if exists public.account_list_trips(uuid, text);
drop function if exists public.account_save_trip(uuid, text, text);
drop function if exists public.account_remove_trip(uuid, text, uuid);
-- 舊版帳號函式以參數帶登入憑證，新版改從 header 取
drop function if exists public.account_change_pin(uuid, text, text, text);
drop function if exists public.require_account(uuid, text);
drop table if exists public.account_trips;
alter table public.trips drop column if exists token;
drop function if exists public.current_trip_id();
drop function if exists public.new_trip_token();

-- ---------- 後來加的欄位 ----------
-- 只寫在這裡、不寫進上面的 create table：新資料庫與舊資料庫升級都走同一條路

-- 行程項目的類型；舊資料一律當作景點
alter table public.spots
  add column if not exists category text not null default 'sight'
    check (category in ('sight', 'food', 'shop', 'activity', 'transport', 'stay', 'other'));
-- 預約狀態：done 已訂／已買、todo 還沒、none 不需要；null 是沒設定，畫面文字依類型而定
alter table public.spots
  add column if not exists booking text check (booking in ('done', 'todo', 'none'));

-- 舊版的預估花費，行程畫面已拿掉不用
alter table public.spots drop column if exists est_cost;

-- 航班（交通類型才用）：起飛時間沿用 start_time，抵達時間跨日時以 arr_day_offset 記 +1、+2
alter table public.spots add column if not exists airline text not null default '' check (length(airline) <= 40);
alter table public.spots add column if not exists flight_no text not null default '' check (flight_no ~ '^[A-Z0-9]{0,8}$');
alter table public.spots add column if not exists dep_airport text not null default '' check (length(dep_airport) <= 40);
alter table public.spots add column if not exists arr_airport text not null default '' check (length(arr_airport) <= 40);
alter table public.spots add column if not exists arr_time time;
alter table public.spots add column if not exists arr_day_offset int not null default 0 check (arr_day_offset between 0 and 2);

-- 外幣旅費的實際扣款（新台幣，例如信用卡帳單金額），有填時這筆用它換算而不用旅程匯率
alter table public.expenses
  add column if not exists twd_amount int check (twd_amount > 0 and twd_amount < 100000000);

-- 記在行程底下某個子項目（地點、店家）的旅費；子項目一定屬於 spot_id 那個行程，刪掉子項目時只清這欄
alter table public.expenses add column if not exists item_id uuid;

-- 代購項目打算在哪間店（行程底下的子項目）買；規則與 expenses.item_id 相同
alter table public.wish_items add column if not exists item_id uuid;

-- 代購記帳時對應的代購清單項目；項目刪掉時只清這欄，代購紀錄照常
alter table public.expense_proxies add column if not exists wish_item_id uuid;

-- 旅伴對應的帳號；有值就是成員。帳號被刪除時留下名字，旅費紀錄不受影響
alter table public.participants
  add column if not exists account_id uuid references public.accounts (id) on delete set null;

do $$
begin
  -- 購物與其他沒有預約狀態，住宿一定要訂房所以沒有「不需要」
  if not exists (select 1 from pg_constraint where conname = 'spots_booking_fits_category') then
    alter table public.spots add constraint spots_booking_fits_category check (
      (category not in ('shop', 'other') or booking is null) and (category <> 'stay' or booking is distinct from 'none'));
  end if;
  -- 新台幣的旅費本來就是實際金額，不需要另外填
  -- 外鍵帶 spot_id，子項目只能是這筆旅費所屬行程底下的；行程刪掉時子項目跟著刪，item_id 也一起清掉
  if not exists (select 1 from pg_constraint where conname = 'spot_items_id_spot_trip_key') then
    alter table public.spot_items add constraint spot_items_id_spot_trip_key unique (id, spot_id, trip_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_item_fkey') then
    alter table public.expenses add constraint expenses_item_fkey
      foreign key (item_id, spot_id, trip_id) references public.spot_items (id, spot_id, trip_id) on delete set null (item_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wish_items_item_fkey') then
    alter table public.wish_items add constraint wish_items_item_fkey
      foreign key (item_id, spot_id, trip_id) references public.spot_items (id, spot_id, trip_id) on delete set null (item_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expense_proxies_wish_item_fkey') then
    alter table public.expense_proxies add constraint expense_proxies_wish_item_fkey
      foreign key (wish_item_id, trip_id) references public.wish_items (id, trip_id) on delete set null (wish_item_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_twd_amount_foreign_only') then
    alter table public.expenses add constraint expenses_twd_amount_foreign_only check (twd_amount is null or currency <> 'TWD');
  end if;
end;
$$;

create unique index if not exists participants_member_key on public.participants (trip_id, account_id) where account_id is not null;
create index if not exists participants_account_idx on public.participants (account_id) where account_id is not null;
create index if not exists participants_trip_idx on public.participants (trip_id);
create index if not exists spots_trip_idx on public.spots (trip_id);
create index if not exists expenses_trip_idx on public.expenses (trip_id);
create index if not exists expense_shares_trip_idx on public.expense_shares (trip_id);
create index if not exists transfers_trip_idx on public.transfers (trip_id);
create index if not exists spot_items_trip_idx on public.spot_items (trip_id);
create index if not exists spot_items_spot_idx on public.spot_items (spot_id);
create index if not exists expense_proxies_trip_idx on public.expense_proxies (trip_id);
create index if not exists expense_proxies_expense_idx on public.expense_proxies (expense_id);
create index if not exists expense_proxies_wish_idx on public.expense_proxies (wish_item_id) where wish_item_id is not null;
create index if not exists wish_items_trip_owner_idx on public.wish_items (trip_id, owner_id);
create index if not exists wish_items_item_idx on public.wish_items (item_id) where item_id is not null;
create index if not exists wish_photos_item_idx on public.wish_photos (item_id);

-- ---------- 版本號 ----------

-- 只有內容欄位變動才 +1：拖曳排序（day、sort_key）、子項目打勾（done）與成員異動（account_id）不算，
-- 否則別人正在編輯的那筆一被搬動或勾選就會被判成衝突；觸發器的參數是這張表另外不算的欄位
create or replace function public.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  skip text[] := array['version', 'updated_at', 'sort_key', 'day', 'done', 'account_id'] || coalesce(tg_argv::text[], '{}');
begin
  if (to_jsonb(new) - skip) is distinct from (to_jsonb(old) - skip) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['trips', 'participants', 'spots', 'expenses', 'spot_items'] loop
    execute format('drop trigger if exists bump_version on public.%I', t);
    execute format('create trigger bump_version before update on public.%I for each row execute function public.bump_version()', t);
  end loop;
end;
$$;

-- 代購項目打勾（status）與排地點（spot_id、item_id）不算內容修改
drop trigger if exists bump_version on public.wish_items;
create trigger bump_version before update on public.wish_items
  for each row execute function public.bump_version('status', 'spot_id', 'item_id');

-- 一個代購項目最多 2 張照片，與前端的上限一致
create or replace function public.limit_wish_photos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.wish_photos where item_id = new.item_id) >= 2 then
    raise exception 'too many photos' using errcode = 'TP424';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_wish_photos on public.wish_photos;
create trigger limit_wish_photos before insert on public.wish_photos
  for each row execute function public.limit_wish_photos();

-- 換當地幣別時，已記的外幣費用會被當成新幣別算，所以有舊幣別的費用就不准換
create or replace function public.check_trip_currency()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency
     and exists (select 1 from public.expenses e
                  where e.trip_id = new.id and e.currency not in ('TWD', new.currency)) then
    raise exception 'trip has expenses in %', old.currency using errcode = 'TP422';
  end if;
  return new;
end;
$$;

drop trigger if exists check_trip_currency on public.trips;
create trigger check_trip_currency before update of currency on public.trips
  for each row execute function public.check_trip_currency();

-- 刪行程時旅費與代購項目的 spot_id 先被清掉，子項目再被刪時已經比對不到這些列，item_id 要在這裡跟著清
create or replace function public.clear_item_without_spot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.spot_id is null then
    new.item_id := null;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['expenses', 'wish_items'] loop
    execute format('drop trigger if exists clear_item_without_spot on public.%I', t);
    execute format(
      'create trigger clear_item_without_spot before insert or update of spot_id, item_id on public.%I
         for each row execute function public.clear_item_without_spot()', t);
  end loop;
end;
$$;

-- 旅程至少要留一位成員，否則沒人看得到它；整趟旅程刪除時連帶刪旅伴不受限
-- security definer：移出自己之後，以自己的身分已經讀不到這趟旅程的旅伴
create or replace function public.keep_one_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.trips where id = old.trip_id)
     and not exists (select 1 from public.participants where trip_id = old.trip_id and account_id is not null) then
    raise exception 'trip needs at least one member' using errcode = 'TP423';
  end if;
  return null;
end;
$$;

drop trigger if exists keep_one_member on public.participants;
create trigger keep_one_member after update of account_id or delete on public.participants
  for each row execute function public.keep_one_member();

-- 成員的名字一律是帳號名稱，不另取暱稱；移出後留下的名字才能改
create or replace function public.sync_member_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_id is not null then
    new.name := (select name from public.accounts where id = new.account_id);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_member_name on public.participants;
create trigger sync_member_name before insert or update on public.participants
  for each row execute function public.sync_member_name();

-- ---------- 權限判斷 ----------

-- PostgREST 把請求 header 以小寫名稱存進 request.headers；同一連線先前設過再清掉時會是空字串而非 null
-- 以文字比對 id，header 不是合法 uuid 時才不會讓整個查詢報錯
create or replace function public.current_account_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id
    from public.accounts a,
         (select nullif(current_setting('request.headers', true), '')::json as h) r
   where a.id::text = r.h ->> 'x-account-id'
     and a.session_key = r.h ->> 'x-account-key';
$$;

-- security definer 才能在 RLS 開啟時讀 participants，否則 participants 自己的 policy 會遞迴
create or replace function public.my_trip_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.trip_id from public.participants p where p.account_id = (select public.current_account_id());
$$;

-- ---------- RLS ----------
-- 一律要帶有效的登入憑證，而且只碰得到自己是成員的旅程；包成 (select …) 讓每個查詢只算一次

alter table public.trips enable row level security;
revoke truncate, trigger, references on public.trips from anon, authenticated;
create policy trip_all on public.trips for all to anon, authenticated
  using (id in (select public.my_trip_ids())) with check (id in (select public.my_trip_ids()));

do $$
declare t text;
begin
  foreach t in array array['participants', 'spots', 'expenses', 'expense_shares', 'transfers', 'spot_items', 'expense_proxies'] loop
    execute format('alter table public.%I enable row level security', t);
    -- TRUNCATE 不受 RLS 約束，只能靠收回權限擋下
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
    execute format(
      'create policy trip_all on public.%I for all to anon, authenticated
         using (trip_id in (select public.my_trip_ids())) with check (trip_id in (select public.my_trip_ids()))', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end;
$$;

-- 代購清單只有自己讀寫得到：除了要是成員，還要是自己的（owner_id）；被移出旅程後也就看不到，加回來會再出現
do $$
declare t text;
begin
  foreach t in array array['wish_items', 'wish_photos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
    execute format(
      'create policy trip_all on public.%I for all to anon, authenticated
         using (trip_id in (select public.my_trip_ids()) and owner_id = (select public.current_account_id()))
         with check (trip_id in (select public.my_trip_ids()) and owner_id = (select public.current_account_id()))', t);
  end loop;
end;
$$;
grant select, insert, update, delete on public.wish_items to anon, authenticated;
-- 照片不能改，只能新增或刪掉
revoke update on public.wish_photos from anon, authenticated;
grant select, insert, delete on public.wish_photos to anon, authenticated;

-- 旅程只能經 create_trip() 建立（建立者一併成為成員）
revoke insert, update on public.trips from anon, authenticated;
grant select, delete on public.trips to anon, authenticated;
grant update (name, start_date, end_date, currency, fx_rate) on public.trips to anon, authenticated;

-- 旅伴只能經 create_trip()／add_trip_member()／remove_trip_member() 新增或異動；表層級的 revoke 會一併收回舊版給的欄位權限
-- 只留 delete：被移出、沒有任何紀錄的人可以刪掉（有紀錄的會被外鍵擋下）
revoke insert, update on public.participants from anon, authenticated;

-- accounts 是唯一不授權的表：讀得到就等於拿到雜湊與登入憑證；開 RLS 不設 policy 只是保險
alter table public.accounts enable row level security;
revoke all on public.accounts from anon, authenticated;

-- ---------- 帳號 ----------
-- 與球友記帳的成員密碼同一套做法：數字密碼加鹽雜湊、連續錯 5 次鎖 15 分鐘；
-- 帳號拿得到自己所有旅程，所以密碼至少 6 位，4 位數在鎖定機制下幾天就試得出來

create or replace function public.hash_account_pin(p_salt text, p_pin text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_salt || ':' || p_pin, 'UTF8')), 'hex');
$$;

-- 驗證密碼並記錄失敗次數；錯誤時用回傳值而不 raise，否則失敗次數的更新會一起被回滾
create or replace function public.attempt_account_pin(p_account uuid, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.accounts;
  until timestamptz;
begin
  select * into r from public.accounts where id = p_account for update;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  if r.locked_until > now() then
    return jsonb_build_object('ok', false, 'locked_until', r.locked_until);
  end if;
  if r.pin_hash = public.hash_account_pin(r.pin_salt, coalesce(p_pin, '')) then
    update public.accounts set failed_attempts = 0, locked_until = null where id = p_account;
    return jsonb_build_object('ok', true, 'id', r.id, 'name', r.name, 'key', r.session_key);
  end if;
  if r.failed_attempts + 1 >= 5 then
    until := now() + interval '15 minutes';
    update public.accounts set failed_attempts = 0, locked_until = until where id = p_account;
    return jsonb_build_object('ok', false, 'locked_until', until);
  end if;
  update public.accounts set failed_attempts = r.failed_attempts + 1 where id = p_account;
  return jsonb_build_object('ok', false, 'remaining', 5 - (r.failed_attempts + 1));
end;
$$;

-- TP401：沒帶或帶了失效的登入憑證（密碼已在別的裝置改過），前端據此要求重新登入
create or replace function public.require_account()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.current_account_id();
begin
  if v_id is null then
    raise exception 'account session expired' using errcode = 'TP401';
  end if;
  return v_id;
end;
$$;

-- 註冊時即時檢查名稱；任何人都能查，名稱本來就會出現在使用者清單裡
create or replace function public.account_name_available(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.accounts where lower(btrim(name)) = lower(btrim(coalesce(p_name, ''))));
$$;

-- 回傳 {id, name, key}；名稱重複時是 23505
create or replace function public.account_register(p_name text, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.accounts;
  salt text := public.new_secret();
begin
  if coalesce(p_pin, '') !~ '^[0-9]{6,8}$' then
    raise exception 'pin must be 6-8 digits' using errcode = '22023';
  end if;
  insert into public.accounts (name, pin_salt, pin_hash, session_key)
  values (btrim(p_name), salt, public.hash_account_pin(salt, p_pin), public.new_secret())
  returning * into r;
  return jsonb_build_object('id', r.id, 'name', r.name, 'key', r.session_key);
end;
$$;

-- 回傳 {ok, id, name, key} 或 {ok: false, remaining | locked_until}；名稱不存在時只回 {ok: false}
create or replace function public.account_login(p_name text, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.accounts where lower(btrim(name)) = lower(btrim(coalesce(p_name, '')));
  return public.attempt_account_pin(v_id, p_pin);
end;
$$;

create or replace function public.account_change_pin(p_old_pin text, p_new_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.require_account();
  res jsonb;
  salt text := public.new_secret();
  key text := public.new_secret();
begin
  if coalesce(p_new_pin, '') !~ '^[0-9]{6,8}$' then
    raise exception 'pin must be 6-8 digits' using errcode = '22023';
  end if;
  res := public.attempt_account_pin(v_id, p_old_pin);
  if not (res ->> 'ok')::boolean then
    return res;
  end if;
  update public.accounts
     set pin_salt = salt, pin_hash = public.hash_account_pin(salt, p_new_pin), session_key = key
   where id = v_id;
  return res || jsonb_build_object('key', key);
end;
$$;

-- 開網站時確認這台裝置的登入憑證還有效，回傳 {id, name}
create or replace function public.whoami()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.require_account();
begin
  return (select jsonb_build_object('id', a.id, 'name', a.name) from public.accounts a where a.id = v_id);
end;
$$;

-- 所有註冊使用者，給旅程加成員用；只有登入的人看得到
create or replace function public.list_accounts()
returns table (id uuid, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_account();
  return query select a.id, a.name from public.accounts a order by lower(a.name);
end;
$$;

-- ---------- 旅程 RPC ----------

-- 建立者自動成為成員；p_members 是要一起加進來的帳號
create or replace function public.create_trip(
  p_name text, p_start date, p_end date, p_currency text, p_fx_rate numeric, p_members uuid[])
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_account();
  t public.trips;
begin
  if coalesce(array_length(p_members, 1), 0) > 50 then
    raise exception 'too many members' using errcode = '22023';
  end if;
  insert into public.trips (name, start_date, end_date, currency, fx_rate)
  values (btrim(p_name), p_start, p_end, upper(p_currency), p_fx_rate)
  returning * into t;
  -- 自己排第一，接著是勾選的成員
  insert into public.participants (trip_id, name, sort_order, account_id)
  select t.id, a.name, 0, a.id from public.accounts a where a.id = v_me;
  insert into public.participants (trip_id, name, sort_order, account_id)
  select t.id, a.name, x.ord, a.id
    from unnest(p_members) with ordinality as x (aid, ord)
    join public.accounts a on a.id = x.aid
   where a.id <> v_me
  on conflict do nothing;
  return t.id;
end;
$$;

-- 把註冊使用者加進旅程，回傳對應的旅伴 id
-- 有同名、只有名字的旅伴時直接把那位換成成員（他之前的旅費紀錄跟著保留）；p_participant 指定要換成成員的旅伴
create or replace function public.add_trip_member(p_trip uuid, p_account uuid, p_participant uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_account();
  v_name text;
  v_pid uuid;
begin
  if not exists (select 1 from public.participants where trip_id = p_trip and account_id = v_me) then
    raise exception 'not a member of this trip' using errcode = '42501';
  end if;
  select name into v_name from public.accounts where id = p_account;
  if v_name is null then
    raise exception 'account not found' using errcode = 'TP404';
  end if;
  select id into v_pid from public.participants where trip_id = p_trip and account_id = p_account;
  if v_pid is not null then
    return v_pid;
  end if;
  if p_participant is not null then
    update public.participants set account_id = p_account, name = v_name
     where id = p_participant and trip_id = p_trip and account_id is null
    returning id into v_pid;
    if v_pid is null then
      raise exception 'participant not found' using errcode = 'TP404';
    end if;
    return v_pid;
  end if;
  update public.participants set account_id = p_account
   where trip_id = p_trip and name = v_name and account_id is null
  returning id into v_pid;
  if v_pid is null then
    insert into public.participants (trip_id, name, sort_order, account_id)
    values (p_trip, v_name, coalesce((select max(sort_order) + 1 from public.participants where trip_id = p_trip), 0), p_account)
    returning id into v_pid;
  end if;
  return v_pid;
end;
$$;

-- 移出成員：留下名字變成只有名字的旅伴，旅費紀錄不受影響；最後一位成員由 keep_one_member 擋下
create or replace function public.remove_trip_member(p_participant uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_account();
  v_trip uuid;
begin
  select trip_id into v_trip from public.participants where id = p_participant;
  if v_trip is null or not exists (select 1 from public.participants where trip_id = v_trip and account_id = v_me) then
    raise exception 'not a member of this trip' using errcode = '42501';
  end if;
  update public.participants set account_id = null where id = p_participant;
end;
$$;

-- 費用、分攤與代購一起寫，避免只寫進一半；security invoker 讓 RLS 照常把關
-- p_expense 帶 id 與 version 時是修改，版本不符丟 TP409、費用已不在丟 TP404
-- 平分：旅伴平分扣掉代購後的金額（沒有旅伴時代購要等於總額）；指定金額：旅伴與代購加總要等於總額
-- 代購帶 wish_item_id 時要是自己的代購清單項目（或這筆原本就連著的），存好後把那些項目標成已買
create or replace function public.save_expense(p_trip uuid, p_expense jsonb, p_shares jsonb, p_proxies jsonb)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_expense ->> 'id', '')::uuid;
  v_amount numeric := (p_expense ->> 'amount')::numeric;
  v_currency text := p_expense ->> 'currency';
  v_mode text := p_expense ->> 'split_mode';
  v_found uuid;
  v_proxy_sum numeric;
  v_keep uuid[] := '{}';
begin
  if p_trip is null or p_trip not in (select public.my_trip_ids()) then
    raise exception 'not a member of this trip' using errcode = '42501';
  end if;
  if v_currency <> 'TWD' and v_currency <> (select currency from public.trips where id = p_trip) then
    raise exception 'currency must be TWD or the trip currency' using errcode = '22023';
  end if;
  if jsonb_typeof(p_shares) <> 'array' or jsonb_typeof(p_proxies) <> 'array'
     or jsonb_array_length(p_shares) + jsonb_array_length(p_proxies) = 0 then
    raise exception 'at least one share or proxy required' using errcode = '22023';
  end if;
  -- 複合外鍵有一欄是 null 時不檢查，沒有行程卻帶子項目要在這裡擋
  if nullif(p_expense ->> 'item_id', '') is not null and nullif(p_expense ->> 'spot_id', '') is null then
    raise exception 'item needs its spot' using errcode = '22023';
  end if;
  v_proxy_sum := coalesce((select sum((x ->> 'amount')::numeric) from jsonb_array_elements(p_proxies) x), 0);
  if v_mode = 'custom' and (
       exists (select 1 from jsonb_array_elements(p_shares) s where s ->> 'amount' is null)
       or coalesce((select sum((s ->> 'amount')::numeric) from jsonb_array_elements(p_shares) s), 0) + v_proxy_sum <> v_amount) then
    raise exception 'custom shares must add up to the amount' using errcode = '22023';
  end if;
  if v_mode = 'even' and (
       (jsonb_array_length(p_shares) = 0 and v_proxy_sum <> v_amount)
       or (jsonb_array_length(p_shares) > 0 and v_proxy_sum >= v_amount)) then
    raise exception 'proxies must leave something to split' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.expenses (trip_id, title, amount, currency, payer_id, split_mode, spent_on, spot_id, item_id, note, twd_amount)
    values (p_trip, btrim(p_expense ->> 'title'), v_amount, v_currency, (p_expense ->> 'payer_id')::uuid, v_mode,
            nullif(p_expense ->> 'spent_on', '')::date, nullif(p_expense ->> 'spot_id', '')::uuid,
            nullif(p_expense ->> 'item_id', '')::uuid, coalesce(p_expense ->> 'note', ''), (p_expense ->> 'twd_amount')::int)
    returning id into v_id;
  else
    update public.expenses
       set title = btrim(p_expense ->> 'title'), amount = v_amount, currency = v_currency,
           payer_id = (p_expense ->> 'payer_id')::uuid, split_mode = v_mode,
           spent_on = nullif(p_expense ->> 'spent_on', '')::date, spot_id = nullif(p_expense ->> 'spot_id', '')::uuid,
           item_id = nullif(p_expense ->> 'item_id', '')::uuid,
           note = coalesce(p_expense ->> 'note', ''), twd_amount = (p_expense ->> 'twd_amount')::int
     where id = v_id and trip_id = p_trip and version = (p_expense ->> 'version')::int
    returning id into v_found;
    if v_found is null then
      if exists (select 1 from public.expenses where id = v_id and trip_id = p_trip) then
        raise exception 'expense was changed by someone else' using errcode = 'TP409';
      end if;
      raise exception 'expense not found' using errcode = 'TP404';
    end if;
    -- 別人改這筆時，看不到的代購清單項目也要能原樣保留
    v_keep := array(select wish_item_id from public.expense_proxies where expense_id = v_id and wish_item_id is not null);
    delete from public.expense_shares where expense_id = v_id;
    delete from public.expense_proxies where expense_id = v_id;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_proxies) x
     where nullif(x ->> 'wish_item_id', '') is not null
       and (x ->> 'wish_item_id')::uuid <> all (v_keep)
       and not exists (select 1 from public.wish_items w where w.id = (x ->> 'wish_item_id')::uuid and w.trip_id = p_trip)) then
    raise exception 'wish item not found' using errcode = 'TP404';
  end if;

  insert into public.expense_shares (expense_id, trip_id, participant_id, amount)
  select v_id, p_trip, (s ->> 'participant_id')::uuid,
         case when v_mode = 'custom' then (s ->> 'amount')::numeric end
    from jsonb_array_elements(p_shares) s;
  insert into public.expense_proxies (expense_id, trip_id, name, amount, sort_order, wish_item_id)
  select v_id, p_trip, btrim(x ->> 'name'), (x ->> 'amount')::numeric, o, nullif(x ->> 'wish_item_id', '')::uuid
    from jsonb_array_elements(p_proxies) with ordinality as u (x, o);
  -- RLS 只讓這裡改到自己的項目
  update public.wish_items set status = 'bought'
   where status <> 'bought'
     and id in (select nullif(x ->> 'wish_item_id', '')::uuid from jsonb_array_elements(p_proxies) x);
  return v_id;
end;
$$;

-- ---------- 函式權限 ----------

revoke execute on function public.new_secret() from public, anon, authenticated;
revoke execute on function public.bump_version() from public, anon, authenticated;
revoke execute on function public.check_trip_currency() from public, anon, authenticated;
revoke execute on function public.keep_one_member() from public, anon, authenticated;
revoke execute on function public.limit_wish_photos() from public, anon, authenticated;
revoke execute on function public.clear_item_without_spot() from public, anon, authenticated;
revoke execute on function public.sync_member_name() from public, anon, authenticated;
revoke execute on function public.hash_account_pin(text, text) from public, anon, authenticated;
revoke execute on function public.attempt_account_pin(uuid, text) from public, anon, authenticated;
revoke execute on function public.require_account() from public, anon, authenticated;

-- RLS 的 policy 以呼叫者身分執行這兩個函式，所以要授權；回傳的只是呼叫者自己的帳號與旅程
revoke execute on function public.current_account_id() from public;
grant execute on function public.current_account_id() to anon, authenticated;
revoke execute on function public.my_trip_ids() from public;
grant execute on function public.my_trip_ids() to anon, authenticated;

revoke execute on function public.account_name_available(text) from public;
grant execute on function public.account_name_available(text) to anon, authenticated;
revoke execute on function public.account_register(text, text) from public;
grant execute on function public.account_register(text, text) to anon, authenticated;
revoke execute on function public.account_login(text, text) from public;
grant execute on function public.account_login(text, text) to anon, authenticated;
revoke execute on function public.account_change_pin(text, text) from public;
grant execute on function public.account_change_pin(text, text) to anon, authenticated;
revoke execute on function public.whoami() from public;
grant execute on function public.whoami() to anon, authenticated;
revoke execute on function public.list_accounts() from public;
grant execute on function public.list_accounts() to anon, authenticated;
revoke execute on function public.create_trip(text, date, date, text, numeric, uuid[]) from public;
grant execute on function public.create_trip(text, date, date, text, numeric, uuid[]) to anon, authenticated;
revoke execute on function public.add_trip_member(uuid, uuid, uuid) from public;
grant execute on function public.add_trip_member(uuid, uuid, uuid) to anon, authenticated;
revoke execute on function public.remove_trip_member(uuid) from public;
grant execute on function public.remove_trip_member(uuid) to anon, authenticated;
revoke execute on function public.save_expense(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.save_expense(uuid, jsonb, jsonb, jsonb) to anon, authenticated;
