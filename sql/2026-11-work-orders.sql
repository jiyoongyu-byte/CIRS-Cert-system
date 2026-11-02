-- sql/2026-11-work-orders.sql — 업무지시서 개편: 지시서·이력·계정연결 테이블, 열람 권한(RLS), 상태변경 함수, 기존 _tasks 이관
-- 주의: 이 파일에는 직원 이메일을 넣지 않음 (공개 저장소). 이메일↔이름 연결(user_accounts)은 별도로 실행함.
-- 상태 흐름: 지시 → 확인(수신자) → 처리완료(수신자) → 작업수행완료(지시자) 또는 반려(→ 수신자 재수행 → 처리완료)
--   반려 건은 지시자·지윤규가 재수행을 기다리지 않고 바로 작업수행완료(승인)로 조정할 수 있음
-- 이관 구간(맨 아래)은 멱등이라 배포 직전에 다시 실행해도 중복 생성되지 않음.

begin;

-- ── 1. 계정 연결: Auth 계정 ↔ 업무지시서용 이름·역할 ─────────────────
create table if not exists public.user_accounts (
  auth_uid uuid primary key references auth.users(id) on delete cascade,
  name     text not null unique,
  role     text not null check (role in ('super','rep','member')),  -- super=지윤규, rep=대표이사(전체 조회만)
  pw_changed boolean not null default false                          -- false면 앱이 첫 로그인 비번 변경을 강제함
);
alter table public.user_accounts add column if not exists pw_changed boolean not null default false;

-- ── 2. 지시서 (건마다 상태가 따로 움직임) ──────────────────────────
create table if not exists public.work_orders (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,                       -- 기존 _tasks 배열의 id (이관 중복 방지용)
  type          text not null default 'order' check (type in ('order','collab')),
  team          text not null default '공통',
  priority      text not null default '일반',
  from_name     text not null,
  to_name       text not null,
  order_date    date not null default ((now() at time zone 'Asia/Seoul')::date),
  due           date,
  content       text not null check (length(btrim(content)) > 0),
  project       text not null default '',
  status        text not null default '지시'
                check (status in ('지시','확인','처리완료','작업수행완료','반려')),
  complete_date date,
  complete_note text not null default '',
  deleted_at    timestamptz,                       -- 삭제는 숨김 처리 (이력 보존)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists work_orders_to_idx   on public.work_orders(to_name);
create index if not exists work_orders_from_idx on public.work_orders(from_name);

-- ── 3. 이력 (수정·삭제 불가) ─────────────────────────────────────
create table if not exists public.work_order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.work_orders(id),
  at          timestamptz not null default now(),
  actor_name  text not null,
  action      text not null,
  from_status text,
  to_status   text,
  note        text not null default '',
  detail      jsonb
);
create index if not exists work_order_events_order_idx on public.work_order_events(order_id, at);

create or replace function public.wo_events_immutable() returns trigger
language plpgsql as $$
begin
  raise exception '업무지시 이력은 수정·삭제할 수 없습니다';
end $$;
drop trigger if exists wo_events_immutable on public.work_order_events;
create trigger wo_events_immutable before update or delete on public.work_order_events
  for each row execute function public.wo_events_immutable();

-- ── 4. 현재 로그인 사용자 확인 (열람 규칙에서 사용) ───────────────
create or replace function public.wo_me_name() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select name from public.user_accounts where auth_uid = auth.uid()
$$;
create or replace function public.wo_me_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.user_accounts where auth_uid = auth.uid()
$$;

-- ── 5. 권한: 읽기만 직접 허용, 쓰기는 아래 함수로만 ───────────────
alter table public.user_accounts    enable row level security;
alter table public.work_orders      enable row level security;
alter table public.work_order_events enable row level security;

revoke all on public.user_accounts, public.work_orders, public.work_order_events
  from public, anon, authenticated;
grant select on public.user_accounts, public.work_orders, public.work_order_events to authenticated;

drop policy if exists ua_select on public.user_accounts;
create policy ua_select on public.user_accounts for select to authenticated
  using (auth_uid = auth.uid());

-- 열람: 지시자·해당 수신자 + 지윤규(super) + 대표이사(rep, 조회만). 그 외는 불가
drop policy if exists wo_select on public.work_orders;
create policy wo_select on public.work_orders for select to authenticated
  using (deleted_at is null
         and (public.wo_me_role() in ('super','rep')
              or public.wo_me_name() in (from_name, to_name)));

drop policy if exists wo_events_select on public.work_order_events;
create policy wo_events_select on public.work_order_events for select to authenticated
  using (exists (select 1 from public.work_orders w where w.id = order_id));

-- ── 6. 쓰기 함수 (지시자 이름은 로그인 계정에서 서버가 결정) ──────
create or replace function public.wo_create(
  p_to text, p_type text, p_team text, p_priority text, p_due date,
  p_content text, p_project text,
  p_date date default ((now() at time zone 'Asia/Seoul')::date)
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me text; v_id uuid;
begin
  v_me := public.wo_me_name();
  if v_me is null then raise exception '권한이 없습니다'; end if;
  if not exists (select 1 from public.user_accounts where name = p_to) then
    raise exception '수신자 계정이 없습니다'; end if;
  if p_to = v_me then raise exception '본인에게는 지시할 수 없습니다'; end if;
  insert into public.work_orders(type, team, priority, from_name, to_name, order_date, due, content, project)
  values (coalesce(nullif(p_type,''),'order'), coalesce(nullif(p_team,''),'공통'),
          coalesce(nullif(p_priority,''),'일반'), v_me, p_to,
          coalesce(p_date, (now() at time zone 'Asia/Seoul')::date), p_due, p_content, coalesce(p_project,''))
  returning id into v_id;
  insert into public.work_order_events(order_id, actor_name, action, to_status)
  values (v_id, v_me, '지시', '지시');
  return v_id;
end $$;

-- 수정: 지시자 본인 + 지윤규만, 작업수행완료 건은 불가. 수정 전 값은 이력에 보존
create or replace function public.wo_update(
  p_id uuid, p_to text, p_team text, p_priority text, p_due date, p_content text, p_project text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me text; v_role text; o public.work_orders%rowtype;
begin
  select name, role into v_me, v_role from public.user_accounts where auth_uid = auth.uid();
  select * into o from public.work_orders where id = p_id and deleted_at is null for update;
  if not found then raise exception '지시서를 찾을 수 없습니다'; end if;
  if v_me is null or not (o.from_name = v_me or v_role = 'super') then
    raise exception '수정 권한이 없습니다'; end if;
  if o.status = '작업수행완료' then raise exception '완료된 지시서는 수정할 수 없습니다'; end if;
  if not exists (select 1 from public.user_accounts where name = p_to) then
    raise exception '수신자 계정이 없습니다'; end if;
  update public.work_orders
     set to_name = p_to, team = coalesce(nullif(p_team,''),'공통'),
         priority = coalesce(nullif(p_priority,''),'일반'), due = p_due,
         content = p_content, project = coalesce(p_project,''), updated_at = now()
   where id = p_id;
  insert into public.work_order_events(order_id, actor_name, action, from_status, to_status, detail)
  values (p_id, v_me, '수정', o.status, o.status,
          jsonb_build_object('before', jsonb_build_object('to', o.to_name, 'team', o.team,
            'priority', o.priority, 'due', o.due, 'content', o.content, 'project', o.project)));
end $$;

-- 상태 변경: 확인 / 처리완료 / 작업수행완료 / 반려
create or replace function public.wo_transition(p_id uuid, p_action text, p_note text default '')
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me text; v_role text; o public.work_orders%rowtype; v_new text; v_sender boolean;
begin
  select name, role into v_me, v_role from public.user_accounts where auth_uid = auth.uid();
  if v_me is null then raise exception '권한이 없습니다'; end if;
  select * into o from public.work_orders where id = p_id and deleted_at is null for update;
  if not found then raise exception '지시서를 찾을 수 없습니다'; end if;
  v_sender := (o.from_name = v_me or v_role = 'super');

  if p_action = '확인' then
    if o.to_name <> v_me or o.status <> '지시' then raise exception '확인할 수 없는 상태입니다'; end if;
    v_new := '확인';
  elsif p_action = '처리완료' then
    if o.to_name <> v_me or o.status not in ('확인','반려') then
      raise exception '처리완료할 수 없는 상태입니다'; end if;
    v_new := '처리완료';
  elsif p_action = '작업수행완료' then
    if not v_sender or o.status not in ('처리완료','반려') then raise exception '작업수행완료 처리할 수 없습니다'; end if;
    v_new := '작업수행완료';
  elsif p_action = '반려' then
    if not v_sender or o.status <> '처리완료' then raise exception '반려할 수 없는 상태입니다'; end if;
    if btrim(coalesce(p_note,'')) = '' then raise exception '반려 사유를 입력하세요'; end if;
    v_new := '반려';
  else
    raise exception '알 수 없는 처리입니다';
  end if;

  update public.work_orders
     set status = v_new,
         complete_date = case v_new when '처리완료' then (now() at time zone 'Asia/Seoul')::date
                                    when '작업수행완료' then coalesce(complete_date, (now() at time zone 'Asia/Seoul')::date) else null end,
         complete_note = case v_new when '처리완료' then coalesce(p_note,'')
                                    when '작업수행완료' then complete_note else '' end,
         updated_at = now()
   where id = p_id;
  insert into public.work_order_events(order_id, actor_name, action, from_status, to_status, note)
  values (p_id, v_me, p_action, o.status, v_new, coalesce(p_note,''));
end $$;

-- 첫 로그인 비번 변경 완료 표시: 본인 행만 true로 바꿀 수 있음
create or replace function public.wo_set_pw_changed() returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.user_accounts set pw_changed = true where auth_uid = auth.uid()
$$;

-- 삭제: 지윤규만, 숨김 처리 + 이력 보존
create or replace function public.wo_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me text; v_role text; o public.work_orders%rowtype;
begin
  select name, role into v_me, v_role from public.user_accounts where auth_uid = auth.uid();
  if v_me is null or v_role <> 'super' then raise exception '삭제 권한이 없습니다'; end if;
  select * into o from public.work_orders where id = p_id and deleted_at is null for update;
  if not found then raise exception '지시서를 찾을 수 없습니다'; end if;
  update public.work_orders set deleted_at = now(), updated_at = now() where id = p_id;
  insert into public.work_order_events(order_id, actor_name, action, from_status, note)
  values (p_id, v_me, '삭제', o.status, '삭제(숨김) 처리');
end $$;

revoke all on function public.wo_me_name(), public.wo_me_role(),
  public.wo_create(text,text,text,text,date,text,text,date),
  public.wo_update(uuid,text,text,text,date,text,text),
  public.wo_transition(uuid,text,text), public.wo_delete(uuid), public.wo_set_pw_changed() from public, anon;
grant execute on function public.wo_me_name(), public.wo_me_role(),
  public.wo_create(text,text,text,text,date,text,text,date),
  public.wo_update(uuid,text,text,text,date,text,text),
  public.wo_transition(uuid,text,text), public.wo_delete(uuid), public.wo_set_pw_changed() to authenticated;

-- ── 7. 기존 revenue_plan._tasks 이관 (멱등: 원본은 삭제하지 않음) ──
--   완료일+확인일 → 작업수행완료 / 완료일만 → 처리완료(지시자 확인 대기)
--   완료일 없음 → 지시 (기존 반려 흔적이 있으면 반려)
with src as (
  select e from public.revenue_plan r,
         jsonb_array_elements(coalesce(r.data->'_tasks', '[]'::jsonb)) e
  where r.id = 'main'
), ins as (
  insert into public.work_orders(legacy_id, type, team, priority, from_name, to_name,
         order_date, due, content, project, status, complete_date, complete_note, created_at)
  select e->>'id',
         coalesce(nullif(e->>'type',''),'order'), coalesce(nullif(e->>'team',''),'공통'),
         coalesce(nullif(e->>'priority',''),'일반'), e->>'from', e->>'to',
         coalesce(nullif(e->>'date','')::date, (now() at time zone 'Asia/Seoul')::date),
         nullif(e->>'due','')::date, e->>'content', coalesce(e->>'project',''),
         case when coalesce(e->>'completedDate','') <> '' and coalesce(e->>'confirmedDate','') <> '' then '작업수행완료'
              when coalesce(e->>'completedDate','') <> '' then '처리완료'
              when coalesce(e->>'rejectedDate','') <> '' then '반려'
              else '지시' end,
         nullif(e->>'completedDate','')::date, coalesce(e->>'completeNote',''),
         coalesce(nullif(e->>'date','')::date, (now() at time zone 'Asia/Seoul')::date)::timestamptz
  from src where coalesce(e->>'id','') <> ''
  on conflict (legacy_id) do nothing
  returning id, legacy_id, status
)
insert into public.work_order_events(order_id, actor_name, action, to_status, note)
select ins.id, '시스템', '이관', ins.status,
       format('기존 업무지시서 이관 (원 지시일 %s, 완료일 %s, 확인일 %s%s)',
              src.e->>'date',
              coalesce(nullif(src.e->>'completedDate',''),'-'),
              coalesce(nullif(src.e->>'confirmedDate',''),'-'),
              case when coalesce(src.e->>'rejectedDate','') <> ''
                   then ', 기존 반려 ' || (src.e->>'rejectedDate') || ': ' || coalesce(src.e->>'rejectNote','')
                   else '' end)
from ins join src on src.e->>'id' = ins.legacy_id;

commit;
