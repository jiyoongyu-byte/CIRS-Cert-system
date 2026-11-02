-- 분기별 환율 테이블(exchange_rates) 생성 — Supabase 마이그레이션 20260901071207 원본 복원
create table if not exists public.exchange_rates (
  id          text primary key,
  year        integer not null,
  quarter     integer not null,
  rmb         numeric default 0,
  usd         numeric default 0,
  updated_by  text    default '',
  updated_at  timestamptz default now()
);
alter table public.exchange_rates enable row level security;
drop policy if exists "allow all" on public.exchange_rates;
create policy "allow all" on public.exchange_rates for all using (true) with check (true);
