-- 최초계약일·최초상담일 컬럼 추가 + 수정 잠금 트리거 + 기존 데이터 채우기 (2026-11-18 Supabase에 적용 완료, 기록용)

-- 1단계: 구조 변경
alter table public.cert_records add column if not exists first_contract_date text, add column if not exists first_consult_date text;
alter table public.med_records add column if not exists first_contract_date text, add column if not exists first_consult_date text;

create or replace function public.lock_first_dates() returns trigger language plpgsql as $$
begin
  if OLD.first_contract_date is not null and NEW.first_contract_date is distinct from OLD.first_contract_date then
    raise exception '최초계약일은 한 번 정하면 수정할 수 없음';
  end if;
  if OLD.first_consult_date is not null and NEW.first_consult_date is distinct from OLD.first_consult_date then
    raise exception '최초상담일은 한 번 정하면 수정할 수 없음';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_lock_first_dates on public.cert_records;
create trigger trg_lock_first_dates before update on public.cert_records for each row execute function public.lock_first_dates();
drop trigger if exists trg_lock_first_dates on public.med_records;
create trigger trg_lock_first_dates before update on public.med_records for each row execute function public.lock_first_dates();

-- 2단계: 기존 데이터 채우기 (의료기기는 시작일을 최초일로 간주 → 계약 20건은 비즈메카이지와 대조 필요)
update public.cert_records set first_contract_date = contract_date where record_type = 'contract' and coalesce(contract_date,'') <> '';
update public.cert_records set first_consult_date = date where record_type = 'consult' and coalesce(date,'') <> '';
update public.med_records set first_consult_date = start_date where record_type = 'consult' and coalesce(start_date,'') <> '';
update public.med_records set first_contract_date = start_date where record_type = 'contract' and coalesce(start_date,'') <> '';
