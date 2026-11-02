-- 수입 내역 분할 입력의 '내역'(항목 설명) 저장용 컬럼 추가 — med_records / cert_records
-- 기존 billing·billing_dates·billing_currencies와 같은 jsonb 배열 형식. 기존 행은 NULL이며 앱에서 빈 값으로 처리함.
alter table public.med_records  add column if not exists billing_notes jsonb;
alter table public.cert_records add column if not exists billing_notes jsonb;
