// js/core/rates.js — 분기별 환율 관리 전담 (Supabase exchange_rates 테이블)
// 전 직원 공유. 수정 권한은 지윤규(SUPER_ADMIN)만. 적용 기준은 수금일이 속한 분기.

import { initSb } from './api.js';

const RATE_EDITOR = '지윤규';          // 환율 수정 권한자
let cache = {};                        // { '2026_q3': {rmb, usd, updatedBy, updatedAt} }

// ── 날짜 → 분기(1~4) ─────────────────────────────────────────────
export function quarterOf(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(d)) return Math.floor(new Date().getMonth() / 3) + 1;
    return Math.floor(d.getMonth() / 3) + 1;
}
export function yearOf(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    return isNaN(d) ? new Date().getFullYear() : d.getFullYear();
}
const key = (y, q) => `${y}_q${q}`;

// ── 전체 환율 로드 ───────────────────────────────────────────────
export async function loadRates() {
    const client = initSb(); if (!client) return cache;
    const { data, error } = await client.from('exchange_rates').select('*');
    if (error) { console.warn('환율 로드 실패', error); return cache; }
    cache = {};
    (data || []).forEach(r => {
        cache[r.id] = {
            rmb: Number(r.rmb || 0), usd: Number(r.usd || 0),
            updatedBy: r.updated_by || '', updatedAt: r.updated_at || '',
        };
    });
    return cache;
}

// ── 환율 저장 (권한자만) ─────────────────────────────────────────
export async function saveRate(y, q, rmb, usd, user) {
    if (user !== RATE_EDITOR) return { ok: false, msg: '환율 수정 권한이 없습니다.' };
    const client = initSb(); if (!client) return { ok: false, msg: 'DB 연결 실패' };
    const row = {
        id: key(y, q), year: y, quarter: q,
        rmb: Number(rmb || 0), usd: Number(usd || 0),
        updated_by: user, updated_at: new Date().toISOString(),
    };
    const { error } = await client.from('exchange_rates').upsert(row);
    if (error) return { ok: false, msg: error.message };
    cache[row.id] = { rmb: row.rmb, usd: row.usd, updatedBy: user, updatedAt: row.updated_at };
    return { ok: true };
}

// ── 조회 ─────────────────────────────────────────────────────────
export function getQuarterRates(y, q) {
    return cache[key(y, q)] || { rmb: 0, usd: 0, updatedBy: '', updatedAt: '' };
}
export function getRatesForDate(dateStr) {
    return getQuarterRates(yearOf(dateStr), quarterOf(dateStr));
}
export function getCurrentRates() {
    return getRatesForDate(null);
}
export function canEditRate(user) {
    return user === RATE_EDITOR;
}
export function getRateCache() {
    return cache;
}
