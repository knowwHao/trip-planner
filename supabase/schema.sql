-- =============================================================
-- 旅遊規劃 Supabase schema
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行即可；可重複執行，也可套在舊版資料庫上升級
--
-- 不用帳號登入：每趟旅程有自己的 token，拿到「旅程連結」的人都能查看與編輯那一趟，
-- 沒有連結的人什麼都讀不到、改不了；任何人都能在網站上建立新旅程（經 create_trip()）
--   旅程連結：https://knowwhao.github.io/trip-planner/#/t/<token>
--
-- 原理：前端在每個 API 請求帶 x-trip-token header，RLS 以 current_trip_id() 找出 token 對應的旅程，
-- 子表一律以 trip_id 比對；子表之間的外鍵都帶 trip_id，參照不到別趟旅程的資料
--
-- 同時編輯：內容欄位改動時 version 自動 +1，前端以 version 做樂觀鎖，
-- 版本對不上（別人剛改過）時更新 0 列，前端再判斷是衝突、資料已刪除還是連結失效
-- =============================================================

-- ---------- 預設權限 ----------
-- Supabase 預設把 postgres 日後建立的表、函式、序列全部授權給 anon／authenticated，新物件一建好就對外公開；
-- 改成預設不授權，本檔的物件都在下方明確 grant。之後新增物件的規則：
--   table：開 RLS、加 trip_all policy、明確 grant；view：一律 with (security_invoker = true)，否則會繞過 RLS；
--   函式：PostgreSQL 內建讓 public 可執行，不受這裡影響，要自己 revoke execute ... from public 再明確 grant
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- 兩個 v4 UUID 共 244 bit 隨機；用內建 gen_random_uuid 免得依賴 pgcrypto 所在的 schema
create or replace function public.new_trip_token()
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
  token      text not null unique default public.new_trip_token() check (length(token) >= 32),
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
  -- 預估花費，以旅程的當地幣別計
  est_cost   numeric(14, 2) check (est_cost >= 0 and est_cost < 100000000),
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

create index if not exists participants_trip_idx on public.participants (trip_id);
create index if not exists spots_trip_idx on public.spots (trip_id);
create index if not exists expenses_trip_idx on public.expenses (trip_id);
create index if not exists expense_shares_trip_idx on public.expense_shares (trip_id);
create index if not exists transfers_trip_idx on public.transfers (trip_id);

-- ---------- 版本號 ----------

-- 只有內容欄位變動才 +1：拖曳排序（day、sort_key）不算，否則別人正在編輯的景點一被搬動就會被判成衝突
create or replace function public.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  skip constant text[] := array['version', 'updated_at', 'sort_key', 'day', 'token'];
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
  foreach t in array array['trips', 'participants', 'spots', 'expenses'] loop
    execute format('drop trigger if exists bump_version on public.%I', t);
    execute format('create trigger bump_version before update on public.%I for each row execute function public.bump_version()', t);
  end loop;
end;
$$;

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

-- ---------- 權限判斷 ----------

-- PostgREST 把請求 header 以小寫名稱存進 request.headers；同一連線先前設過再清掉時會是空字串而非 null
-- security definer 才能在 RLS 開啟時讀 trips，否則 trips 自己的 policy 會遞迴
create or replace function public.current_trip_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
    from public.trips t
   where t.token = (nullif(current_setting('request.headers', true), '')::json ->> 'x-trip-token');
$$;

-- ---------- RLS ----------
-- anon 與 authenticated 一律要帶正確的旅程 token 才能讀寫；包成 (select …) 讓每個查詢只算一次

alter table public.trips enable row level security;
revoke truncate, trigger, references on public.trips from anon, authenticated;
drop policy if exists trip_all on public.trips;
create policy trip_all on public.trips for all to anon, authenticated
  using (id = (select public.current_trip_id())) with check (id = (select public.current_trip_id()));

do $$
declare t text;
begin
  foreach t in array array['participants', 'spots', 'expenses', 'expense_shares', 'transfers'] loop
    execute format('alter table public.%I enable row level security', t);
    -- TRUNCATE 不受 RLS 約束，只能靠收回權限擋下
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
    execute format('drop policy if exists trip_all on public.%I', t);
    execute format(
      'create policy trip_all on public.%I for all to anon, authenticated
         using (trip_id = (select public.current_trip_id())) with check (trip_id = (select public.current_trip_id()))', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end;
$$;

-- 旅程只能經 create_trip() 建立，token 只能經 regenerate_trip_token() 換發，避免被改成弱 token
revoke insert, update on public.trips from anon, authenticated;
grant select, delete on public.trips to anon, authenticated;
grant update (name, start_date, end_date, currency, fx_rate) on public.trips to anon, authenticated;

-- ---------- RPC ----------

create or replace function public.create_trip(
  p_name text, p_start date, p_end date, p_currency text, p_fx_rate numeric, p_participants text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.trips;
begin
  if coalesce(array_length(p_participants, 1), 0) > 50 then
    raise exception 'too many participants' using errcode = '22023';
  end if;
  insert into public.trips (name, start_date, end_date, currency, fx_rate)
  values (btrim(p_name), p_start, p_end, upper(p_currency), p_fx_rate)
  returning * into t;
  insert into public.participants (trip_id, name, sort_order)
  select t.id, x.name, x.ord - 1
    from (select btrim(n) as name, min(o) as ord
            from unnest(p_participants) with ordinality as u (n, o)
           where btrim(n) <> ''
           group by btrim(n)) x;
  return jsonb_build_object('id', t.id, 'token', t.token);
end;
$$;

create or replace function public.regenerate_trip_token()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_trip uuid := public.current_trip_id();
  t text;
begin
  if v_trip is null then
    raise exception 'invalid trip token' using errcode = '42501';
  end if;
  update public.trips set token = public.new_trip_token() where id = v_trip returning token into t;
  return t;
end;
$$;

-- 費用與分攤一起寫，避免只寫進一半；security invoker 讓 RLS 照常把關
-- p_expense 帶 id 與 version 時是修改，版本不符丟 TP409、費用已不在丟 TP404
create or replace function public.save_expense(p_expense jsonb, p_shares jsonb)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_trip uuid := public.current_trip_id();
  v_id uuid := nullif(p_expense ->> 'id', '')::uuid;
  v_amount numeric := (p_expense ->> 'amount')::numeric;
  v_currency text := p_expense ->> 'currency';
  v_mode text := p_expense ->> 'split_mode';
  v_found uuid;
begin
  if v_trip is null then
    raise exception 'invalid trip token' using errcode = '42501';
  end if;
  if v_currency <> 'TWD' and v_currency <> (select currency from public.trips where id = v_trip) then
    raise exception 'currency must be TWD or the trip currency' using errcode = '22023';
  end if;
  if jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'at least one share required' using errcode = '22023';
  end if;
  if v_mode = 'custom' and (
       exists (select 1 from jsonb_array_elements(p_shares) s where s ->> 'amount' is null)
       or (select sum((s ->> 'amount')::numeric) from jsonb_array_elements(p_shares) s) <> v_amount) then
    raise exception 'custom shares must add up to the amount' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.expenses (trip_id, title, amount, currency, payer_id, split_mode, spent_on, spot_id, note)
    values (v_trip, btrim(p_expense ->> 'title'), v_amount, v_currency, (p_expense ->> 'payer_id')::uuid, v_mode,
            nullif(p_expense ->> 'spent_on', '')::date, nullif(p_expense ->> 'spot_id', '')::uuid,
            coalesce(p_expense ->> 'note', ''))
    returning id into v_id;
  else
    update public.expenses
       set title = btrim(p_expense ->> 'title'), amount = v_amount, currency = v_currency,
           payer_id = (p_expense ->> 'payer_id')::uuid, split_mode = v_mode,
           spent_on = nullif(p_expense ->> 'spent_on', '')::date, spot_id = nullif(p_expense ->> 'spot_id', '')::uuid,
           note = coalesce(p_expense ->> 'note', '')
     where id = v_id and version = (p_expense ->> 'version')::int
    returning id into v_found;
    if v_found is null then
      if exists (select 1 from public.expenses where id = v_id) then
        raise exception 'expense was changed by someone else' using errcode = 'TP409';
      end if;
      raise exception 'expense not found' using errcode = 'TP404';
    end if;
    delete from public.expense_shares where expense_id = v_id;
  end if;

  insert into public.expense_shares (expense_id, trip_id, participant_id, amount)
  select v_id, v_trip, (s ->> 'participant_id')::uuid,
         case when v_mode = 'custom' then (s ->> 'amount')::numeric end
    from jsonb_array_elements(p_shares) s;
  return v_id;
end;
$$;

revoke execute on function public.new_trip_token() from public, anon, authenticated;
revoke execute on function public.bump_version() from public, anon, authenticated;
revoke execute on function public.check_trip_currency() from public, anon, authenticated;

revoke execute on function public.current_trip_id() from public;
grant execute on function public.current_trip_id() to anon, authenticated;
revoke execute on function public.create_trip(text, date, date, text, numeric, text[]) from public;
grant execute on function public.create_trip(text, date, date, text, numeric, text[]) to anon, authenticated;
revoke execute on function public.regenerate_trip_token() from public;
grant execute on function public.regenerate_trip_token() to anon, authenticated;
revoke execute on function public.save_expense(jsonb, jsonb) from public;
grant execute on function public.save_expense(jsonb, jsonb) to anon, authenticated;
