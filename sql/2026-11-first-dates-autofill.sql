-- 최초상담일·최초계약일 자동 기록 트리거 (2026-11-19 Supabase에 적용 완료, 기록용)
-- 값이 비어 있을 때 한 번만 채움. 인증: date / contract_date, 의료기기: start_date 기준. 기존 잠금 트리거(trg_lock_first_dates)와 함께 동작.

create or replace function public.fill_first_dates() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_consult text;
  v_contract text;
begin
  if TG_TABLE_NAME = 'cert_records' then
    v_consult  := nullif(NEW.date, '');
    v_contract := nullif(NEW.contract_date, '');
  else
    v_consult  := nullif(NEW.start_date, '');
    v_contract := nullif(NEW.start_date, '');
  end if;

  if NEW.record_type = 'consult' and NEW.first_consult_date is null and v_consult is not null then
    NEW.first_consult_date := v_consult;
  end if;
  if NEW.record_type = 'contract' and NEW.first_contract_date is null and v_contract is not null then
    NEW.first_contract_date := v_contract;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_fill_first_dates on public.cert_records;
create trigger trg_fill_first_dates before insert or update on public.cert_records
  for each row execute function public.fill_first_dates();
drop trigger if exists trg_fill_first_dates on public.med_records;
create trigger trg_fill_first_dates before insert or update on public.med_records
  for each row execute function public.fill_first_dates();
