-- 비용 지출일·수주 예상 컬럼 추가 및 월간 실적보고(monthly_reports) 테이블 생성 — Supabase 마이그레이션 20261007025514 원본 복원
-- 비용 지출일 (기타 비용은 exp_extra JSON 항목에 date·kind 저장)
alter table public.med_records  add column if not exists exp_audit_date date,
                                add column if not exists exp_test_date  date,
                                add column if not exists exp_trip_date  date,
                                add column if not exists location        text not null default '',
                                add column if not exists win_prob        text not null default '',
                                add column if not exists expected_month  text not null default '',
                                add column if not exists expected_amount numeric not null default 0;
alter table public.cert_records add column if not exists exp_audit_date date,
                                add column if not exists exp_test_date  date,
                                add column if not exists exp_trip_date  date,
                                add column if not exists location        text not null default '',
                                add column if not exists win_prob        text not null default '',
                                add column if not exists expected_month  text not null default '',
                                add column if not exists expected_amount numeric not null default 0;

-- 월간 실적보고 (팀·월별 1건)
create table if not exists public.monthly_reports (
  id            text primary key,              -- 예: med-2026-09
  team          text not null check (team in ('med','cert')),
  ym            text not null,                 -- YYYY-MM
  doc_no        text not null default '',
  reason        text not null default '',      -- 달성률 사유 (부서장 작성)
  plans_done    jsonb not null default '[]',   -- 당월 추진업무
  plans_next    jsonb not null default '[]',   -- 익월 계획
  forecast      jsonb not null default '[]',   -- 연간 예상 (수정값 포함)
  status        text not null default '작성중' check (status in ('작성중','제출완료')),
  updated_by    text not null default '',
  updated_at    timestamptz not null default now(),
  submitted_by  text not null default '',
  submitted_at  timestamptz,
  unique (team, ym)
);
alter table public.monthly_reports enable row level security;
create policy "mr select" on public.monthly_reports for select using (true);
create policy "mr insert" on public.monthly_reports for insert with check (true);
create policy "mr update" on public.monthly_reports for update using (true) with check (true);
