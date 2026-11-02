-- 인증팀 완료예정일(due_date)·의료기기팀 발급일(issue_date) 컬럼 추가 후 text 형식으로 통일 — Supabase 마이그레이션 20260930083823 + 20260930083838 원본 복원(순서대로 실행)
alter table cert_records add column if not exists due_date date;
alter table med_records add column if not exists issue_date date;
alter table cert_records alter column due_date type text using due_date::text;
alter table med_records alter column issue_date type text using issue_date::text;
