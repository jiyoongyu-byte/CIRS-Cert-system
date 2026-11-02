-- 상담 보관(archived·archive_reason·archived_at) 컬럼 추가 — Supabase 마이그레이션 20261007023624 원본 복원
-- 상담 보관 표시 (기존 상담상태는 유지, 보관 여부·사유만 별도 관리)
alter table public.med_records  add column if not exists archived boolean not null default false,
                                add column if not exists archive_reason text not null default '',
                                add column if not exists archived_at date;
alter table public.cert_records add column if not exists archived boolean not null default false,
                                add column if not exists archive_reason text not null default '',
                                add column if not exists archived_at date;
