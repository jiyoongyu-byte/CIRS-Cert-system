-- 인증 갱신 알림: 갱신 상담 등록 여부 표시 컬럼 추가 (계약 건에서만 사용, 기본값 false)
-- 적용 순서: 이 SQL을 먼저 적용한 뒤 코드를 푸시할 것 (코드가 이 컬럼을 저장함)
alter table med_records  add column if not exists renew_consulted boolean not null default false;
alter table cert_records add column if not exists renew_consulted boolean not null default false;
