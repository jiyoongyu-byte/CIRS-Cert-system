-- 업무지시서 '수신자 미처리' 종결 상태 추가 + 결정('수신자미처리')·되돌리기('재지시') 동작 — wo_transition 갱신
-- 규칙: 결정은 지시자·지윤규만, 기한이 지난 건(지시·확인·반려 상태)만, 사유 필수. 되돌리기는 '수신자미처리' 건만 '지시'로 복귀. 이력은 모두 보존.
alter table public.work_orders drop constraint if exists work_orders_status_check;
alter table public.work_orders add constraint work_orders_status_check
  check (status in ('지시','확인','처리완료','작업수행완료','반려','수신자미처리'));

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
  elsif p_action = '수신자미처리' then
    if not v_sender or o.status not in ('지시','확인','반려') then
      raise exception '수신자 미처리로 결정할 수 없는 상태입니다'; end if;
    if o.due is null or o.due >= (now() at time zone 'Asia/Seoul')::date then
      raise exception '기한이 지난 건만 결정할 수 있습니다'; end if;
    if btrim(coalesce(p_note,'')) = '' then raise exception '사유를 입력하세요'; end if;
    v_new := '수신자미처리';
  elsif p_action = '재지시' then
    if not v_sender or o.status <> '수신자미처리' then raise exception '다시 지시할 수 없는 상태입니다'; end if;
    v_new := '지시';
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
