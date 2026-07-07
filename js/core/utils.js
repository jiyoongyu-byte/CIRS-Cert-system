// js/core/utils.js — 유틸리티 함수 모음 (기존 단일파일 완전 이식)

// ── 보안 정화 (XSS 방지) ─────────────────────────────────────────
export const sanitize = (str) =>
    String(str || '').replace(/[&<>"']/g, m =>
        ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])
    );

// ── 고유 ID 생성 ──────────────────────────────────────────────────
export const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);

// ── 숫자 콤마 포맷 ───────────────────────────────────────────────
export const fmt = (n) => Number(n || 0).toLocaleString();

// ── 금액 원 단위 포맷 (화면 표시용) ──────────────────────────────
export function fmtM(n) {
    if (!n) return '₩0원';
    const v = Number(n);
    if (v >= 100000000) return '₩' + (v / 100000000).toFixed(2) + '억원';
    return '₩' + Math.round(v).toLocaleString() + '원';
}

// ── 백만원 단위 포맷 (차트 레이블용) ─────────────────────────────
export function fmtMil(n) {
    if (!n) return '0';
    const v = Number(n);
    if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
    if (v >= 1000000)   return (v / 1000000).toFixed(1) + '백만';
    if (v >= 10000)     return Math.round(v / 10000) + '만';
    return Math.round(v).toLocaleString();
}

// ── 달성률 계산 ───────────────────────────────────────────────────
export const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

// ── 날짜 → 분기 변환 ─────────────────────────────────────────────
export function quarter(dateStr) {
    if (!dateStr) return 1;
    const m = new Date(dateStr).getMonth(); // 0~11
    if (m <= 2) return 1;
    if (m <= 5) return 2;
    if (m <= 8) return 3;
    return 4;
}

// ── 날짜 정규화 (YYYY.MM.DD → YYYY-MM-DD) ────────────────────────
export const normalizeDate = (d) => d ? d.replace(/\./g, '-') : '';

// ── 환율 가져오기 ────────────────────────────────────────────────
export function getRates() {
    return {
        rmb: Number(document.getElementById('rmbRateInput')?.value) || 0,
        usd: Number(document.getElementById('usdRateInput')?.value) || 0,
    };
}

// ── 금액 → KRW 환산 ──────────────────────────────────────────────
export function toKRW(amt, cur) {
    const { rmb, usd } = getRates();
    if (cur === 'RMB') return rmb ? Number(amt) * rmb : 0;
    if (cur === 'USD') return usd ? Number(amt) * usd : 0;
    return Number(amt);
}

// ── 다국어 처리 (한/중) ──────────────────────────────────────────
export const tt = (ko, zh) => {
    const lang = document.documentElement.lang || 'ko';
    return lang === 'zh' ? zh : ko;
};

// ── CSV 다운로드 ──────────────────────────────────────────────────
export function downloadCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) return;
    let csv = [];
    for (let i = 0; i < table.rows.length; i++) {
        let row = [], cols = table.rows[i].querySelectorAll('td, th');
        for (let j = 0; j < cols.length; j++) {
            if (cols[j].innerText.includes('관리') || cols[j].innerText.includes('수정')) continue;
            row.push('"' + cols[j].innerText.replace(/"/g, '""').replace(/\n/g, ' ') + '"');
        }
        csv.push(row.join(','));
    }
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename + '.csv'; a.click();
}

// ── isRowVisibleInYear (연도별 레코드 표시 여부) ──────────────────
export function isRowVisibleInYear(r, y) {
    if (y < r.year) return false;
    if (r.year == y) return true;
    const ys = String(y);
    if (r.duedate && r.duedate >= ys + '-01-01') return true;
    if ((r.billingDates || []).some(d => d && d.startsWith(ys))) return true;
    if ((r.billingDates || []).some(d => d && d > ys + '-01-01')) return true;
    const total = Number(r.amount || 0);
    const billed = (r.billing || []).reduce((s, v) => s + Number(v || 0), 0);
    const nc = r.status !== '완료' && r.status !== '취소' && r.contracted !== '완료취소';
    if (total - billed > 0 && nc && r.duedate && r.duedate >= ys + '-01-01') return true;
    if ((r.status === '완료' || r.stage === '완료' || r.contracted === '계약완료') && r.renewcycle) {
        if (parseInt(r.renewcycle)) return true;
    }
    return false;
}

// ── getBilledActual (팀별 분기 수입 실적 계산) ────────────────────
export function getBilledActual(teamRows, y) {
    const qs = { q1:0, q2:0, q3:0, q4:0 };
    const qsRMB = { q1:0, q2:0, q3:0, q4:0 };
    const qsUSD = { q1:0, q2:0, q3:0, q4:0 };

    const today = new Date().toISOString().slice(0, 10); // 오늘 날짜 YYYY-MM-DD
    teamRows.filter(r => r.recordType !== 'consult' && isRowVisibleInYear(r, y))
        .forEach(r => {
            (r.billing || []).forEach((amt, i) => {
                if (!amt) return;
                const cur = (r.billingCurrencies || [])[i] || 'KRW';
                const ds = (r.billingDates || [])[i];
                const krw = toKRW(Number(amt), cur);
                let qn = 'q1';
                if (ds) {
                    if (ds > today) return;           // 미래 수입 예정은 실적에서 제외
                    if (new Date(ds).getFullYear() !== y) return;
                    const m = new Date(ds).getMonth();
                    qn = m <= 2 ? 'q1' : m <= 5 ? 'q2' : m <= 8 ? 'q3' : 'q4';
                } else if (r.year === y) {
                    qn = 'q1';
                }
                qs[qn] += krw;
                if (cur === 'RMB') qsRMB[qn] += Number(amt);
                if (cur === 'USD') qsUSD[qn] += Number(amt);
            });
        });

    return { qs, qsRMB, qsUSD };
}

// ── window 전역 등록 (HTML 인라인 호환) ──────────────────────────
window.downloadCSV = downloadCSV;
