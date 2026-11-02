-- 구성원 명단(staff) 테이블 생성 및 초기 구성원 입력 — Supabase 마이그레이션 20261007020127 원본 복원
-- 구성원 명단 (지윤규·대표이사는 코드상 고정 임원으로 별도 관리)
create table if not exists public.staff (
  name         text primary key,
  team         text not null check (team in ('의료기기팀','제품환경인증팀')),
  position     text not null default '',
  is_lead      boolean not null default false,
  sort_order   integer not null default 100,
  status       text not null default '재직',
  status_date  date,
  status_memo  text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.staff enable row level security;
-- 기존 테이블과 동일 수준(조회·추가·수정 허용), 영구 삭제는 허용하지 않음
create policy "staff select" on public.staff for select using (true);
create policy "staff insert" on public.staff for insert with check (true);
create policy "staff update" on public.staff for update using (true) with check (true);

insert into public.staff (name, team, position, is_lead, sort_order, status, status_date, status_memo) values
 ('엄태호','제품환경인증팀','팀 장',true ,10,'재직',null,''),
 ('Lyu Cuicui','제품환경인증팀','책 임',false,20,'재직',null,''),
 ('박성재','제품환경인증팀','선 임',false,30,'재직',null,''),
 ('유재용','의료기기팀','수 석',true ,10,'재직',null,''),
 ('윤미령','의료기기팀','책 임',false,20,'본사 전출','2026-10-07','본사 소속으로 조정'),
 ('차상호','의료기기팀','선 임',false,30,'재직',null,''),
 ('Zhao Lijie','의료기기팀','선 임',false,40,'재직',null,'')
on conflict (name) do nothing;
