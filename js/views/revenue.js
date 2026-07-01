// js/views/revenue.js — 수입계획 및 실적 뷰

import { getState, getCurrentYear, getRevTeam, setRevTeam, ensureRevYear } from '../core/store.js';
import { toKRW, fmtM, fmtMil, getBilledActual } from '../core/utils.js';

let chartRevMixed    = null;
let chartTopServices = null;
let revChartMode     = 'month';  // 'month' | 'quarter' | 'cumul'
let svcChartMode     = 'cert';   // 'cert'  | 'manager'

// ── 팀 탭 전환 ───────────────────────────────────────────────────
export function switchRevTeam(team, el) {
    setRevTeam(team);
    document.querySelectorAll('#revTeamSelector .team-tab').forEach(b => b.className = 'team-tab');
    if (el) el.className = 'team-tab ' + (team === 'cert' ? 'active-cert' : 'active-med');
    renderRevenue();
}

// ── 차트 모드 전환 (월별/분기별/누적) ─────────────────────────────
export function switchRevChartMode(mode, el) {
    revChartMode = mode;
    document.querySelectorAll('.rev-chart-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    const { actual, target, rows } = _getActualTarget();
    renderRevChart(actual, target, getRevTeam() || 'med', rows, getCurrentYear());
}

// ── 수입기여도 모드 전환 (인증마크별/담당자별) ─────────────────────
export function switchServiceChartMode(mode, el) {
    svcChartMode = mode;
    document.querySelectorAll('.svc-chart-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    const state = getState();
    const y     = getCurrentYear();
    const team  = getRevTeam() || 'med';
    const medRows  = (state.med  || []).filter(r => r.recordType === 'contract');
    const certRows = (state.cert || []).filter(r => r.recordType === 'contract');
    const rows = team === 'med' ? medRows : team === 'cert' ? certRows : [...medRows, ...certRows];
    renderSvcChart(rows, team, y);
}

// ── 내부 헬퍼: 현재 팀/연도에 맞는 actual/target/rows ────────────
function _getActualTarget() {
    const state = getState();
    const y     = getCurrentYear();
    const team  = getRevTeam() || 'med';
    const medRows  = (state.med  || []).filter(r => r.recordType === 'contract');
    const certRows = (state.cert || []).filter(r => r.recordType === 'contract');
    const { qs: medActual  } = getBilledActual(medRows,  y);
    const { qs: certActual } = getBilledActual(certRows, y);
    const totalActual = {
        q1: medActual.q1 + certActual.q1, q2: medActual.q2 + certActual.q2,
        q3: medActual.q3 + certActual.q3, q4: medActual.q4 + certActual.q4,
    };
    const rev = state.revenue[y] || {};
    const medTarget   = rev.med  || { q1:0, q2:0, q3:0, q4:0 };
    const certTarget  = rev.cert || { q1:0, q2:0, q3:0, q4:0 };
    const totalTarget = {
        q1: (medTarget.q1||0) + (certTarget.q1||0), q2: (medTarget.q2||0) + (certTarget.q2||0),
        q3: (medTarget.q3||0) + (certTarget.q3||0), q4: (medTarget.q4||0) + (certTarget.q4||0),
    };
    const actual = team === 'med' ? medActual : team === 'cert' ? certActual : totalActual;
    const target = team === 'med' ? medTarget : team === 'cert' ? certTarget : totalTarget;
    const rows   = team === 'med' ? medRows   : team === 'cert' ? certRows   : [...medRows, ...certRows];
    return { actual, target, rows, medRows, certRows, y, team };
}

// ── 분기 목표 → 월별 균등 배분 ────────────────────────────────────
function _getMonthlyTarget(target) {
    return Array.from({ length:12 }, (_, i) => {
        const q = ['q1','q1','q1','q2','q2','q2','q3','q3','q3','q4','q4','q4'][i];
        return Number(target[q] || 0) / 3;
    });
}

// ── 월별 실적 계산 (12개 배열) ─────────────────────────────────────
function _getMonthlyActual(rows, y) {
    const monthly = Array(12).fill(0);
    rows.forEach(r => {
        (r.billing || []).forEach((amt, i) => {
            const d = (r.billingDates || [])[i];
            if (!d || new Date(d).getFullYear() !== y) return;
            const m = new Date(d).getMonth();
            monthly[m] += toKRW(Number(amt || 0), (r.billingCurrencies || [])[i] || 'KRW');
        });
    });
    return monthly;
}

// ── 의료기기팀 업무유형 카테고리 분류 ─────────────────────────────
function categorizeMed(r) {
    const bt = (r.biztype || r.product || '').toLowerCase();
    if (bt.includes('kgmp'))                                                           return 'KGMP';
    if (bt.includes('cgmp'))                                                           return 'CGMP';
    if (bt.includes('의료기기') && (bt.includes('한국') || bt.includes('korea')))     return '한국 의료기기등록';
    if (bt.includes('의료기기') && (bt.includes('중국') || bt.includes('china') || bt.includes('중'))) return '중국 의료기기등록';
    if (bt.includes('의료기기'))                                                       return '의료기기등록';
    return r.biztype || r.product || '기타';
}

// ══════════════════════════════════════════════════════════════════
// ── 메인 렌더 ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
export function renderRevenue() {
    const state = getState();
    const y     = getCurrentYear();
    const team  = getRevTeam() || 'med';
    ensureRevYear(y);

    const { actual, target, rows, medRows, certRows } = _getActualTarget();

    // ── 분기 목표 카드 ────────────────────────────────────────────
    const qWrap = document.getElementById('revQuarterlyWrap');
    if (qWrap) {
        qWrap.innerHTML = `<div class="stat-grid" style="margin-bottom:20px">
            ${['q1','q2','q3','q4'].map((q, i) => {
                const tgt  = Number(target[q] || 0);
                const act  = Math.round(actual[q] || 0);
                const p    = tgt ? Math.min(Math.round(act / tgt * 100), 100) : 0;
                const diff = act - tgt;
                const dc   = diff >= 0 ? 'var(--success)' : 'var(--danger)';
                return `<div class="stat-card">
                    <div class="stat-label">${i + 1}분기 목표</div>
                    <div class="stat-value">${fmtM(tgt)}</div>
                    <div style="font-size:12px;color:var(--success);margin-top:4px">실적 ${fmtM(act)} (${p}%)</div>
                    <div style="font-size:11px;color:${dc};margin-top:2px">${diff >= 0 ? '▲' : '▼'} ${fmtM(Math.abs(diff))}</div>
                    <div class="stat-bar"><div class="stat-fill fill-${team === 'cert' ? 'cert' : 'med'}" style="width:${p}%"></div></div>
                    <input class="m-input" type="number" value="${tgt}" placeholder="목표 입력"
                        onchange="updateTarget('${team}','${q}',this.value)" style="margin-top:8px">
                </div>`;
            }).join('')}
        </div>`;
    }

    // ── 월별 목표/실적 카드 ───────────────────────────────────────
    const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    const mCards = document.getElementById('mCards');
    if (mCards) {
        const monthlyActual = _getMonthlyActual(rows, y);
        const monthlyTarget = _getMonthlyTarget(target);
        mCards.innerHTML = monthlyActual.map((v, i) => {
            const tgt  = monthlyTarget[i];
            const diff = v - tgt;
            const dc   = diff >= 0 ? 'var(--success)' : 'var(--danger)';
            return `<div class="m-card">
                <div class="m-label">${MONTHS[i]}</div>
                <div class="m-actual">${fmtMil(Math.round(v))}</div>
                ${tgt > 0 ? `<div style="font-size:10px;color:${dc}">${diff >= 0 ? '▲' : '▼'}${fmtMil(Math.abs(Math.round(diff)))}</div>` : ''}
            </div>`;
        }).join('');
    }

    // ── 계약별 수입 결산 테이블 ───────────────────────────────────
    const tbody = document.querySelector('#revContractTable tbody');
    if (tbody) {
        const tableRows = team === 'med'
            ? medRows.filter(r => r.year === y).map(r => ({ ...r, _team:'의료기기팀',    _item: r.biztype || r.product || '' }))
            : team === 'cert'
            ? certRows.filter(r => r.year === y).map(r => ({ ...r, _team:'제품환경인증팀', _item: r.certtype || '' }))
            : [
                ...medRows.filter(r => r.year === y).map(r => ({ ...r, _team:'의료기기팀',    _item: r.biztype || r.product || '' })),
                ...certRows.filter(r => r.year === y).map(r => ({ ...r, _team:'제품환경인증팀', _item: r.certtype || '' })),
              ];

        tbody.innerHTML = !tableRows.length
            ? `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">데이터가 없습니다.</td></tr>`
            : tableRows.map((r, i) => {
                const paid   = (r.billing || []).reduce((s, v, bi) => s + toKRW(Number(v || 0), (r.billingCurrencies || [])[bi] || 'KRW'), 0);
                const total  = toKRW(Number(r.amount || 0), r.amountCurrency || 'KRW');
                const remain = total - paid;
                return `<tr>
                    <td>${i + 1}</td>
                    <td><span class="badge ${r._team === '의료기기팀' ? 'badge-med' : 'badge-cert'}">${r._team}</span></td>
                    <td>${r.client || ''}</td>
                    <td>${r._item}</td>
                    <td>${r.startdate || r.contractdate || ''}</td>
                    <td>${fmtM(r.amount || 0)} ${r.amountCurrency || 'KRW'}</td>
                    <td style="color:var(--success);font-weight:700">${fmtM(Math.round(paid))}</td>
                    <td style="color:${remain > 0 ? 'var(--warn)' : 'var(--text3)'}">${fmtM(Math.round(remain))}</td>
                    <td>${r.manager || ''}</td>
                </tr>`;
            }).join('');
    }

    renderRevChart(actual, target, team, rows, y);
    renderSvcChart(rows, team, y);
}

// ══════════════════════════════════════════════════════════════════
// ── 차트 1: 월별/분기별/누적 실적 & 계획 (단일 y축) ────────────────
// ══════════════════════════════════════════════════════════════════
function renderRevChart(actual, target, team, rows, y) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('chartRevMixed');
    if (!ctx) return;
    if (chartRevMixed) { chartRevMixed.destroy(); chartRevMixed = null; }

    const isCert    = team === 'cert';
    const solidColor = isCert ? 'rgba(25,168,118,0.75)' : 'rgba(91,110,245,0.75)';
    const planColor  = isCert ? 'rgba(25,168,118,0.25)' : 'rgba(91,110,245,0.25)';
    const lineColor  = isCert ? '#19A876'                : '#5B6EF5';
    const planLine   = isCert ? '#56d9a8'                : '#8B9CF9';

    let labels, datasets, chartType;

    if (revChartMode === 'quarter') {
        // ── 분기별: 계획 bar + 실적 bar ──────────────────────────
        labels    = ['1분기', '2분기', '3분기', '4분기'];
        const planArr   = ['q1','q2','q3','q4'].map(q => Math.round(Number(target[q] || 0)));
        const actualArr = ['q1','q2','q3','q4'].map(q => Math.round(actual[q] || 0));
        datasets  = [
            { type:'bar', label:'계획', data: planArr,   backgroundColor: planColor,  borderColor: lineColor, borderWidth:1.5, borderRadius:4 },
            { type:'bar', label:'실적', data: actualArr, backgroundColor: solidColor, borderRadius:4 },
        ];
        chartType = 'bar';

    } else if (revChartMode === 'cumul') {
        // ── 누적: 누적계획 점선 + 누적실적 실선 ─────────────────
        labels = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
        const mActual = _getMonthlyActual(rows, y);
        const mTarget = _getMonthlyTarget(target);
        const cActual = mActual.reduce((a, v, i) => { a.push((a[i-1]||0) + v); return a; }, []);
        const cTarget = mTarget.reduce((a, v, i) => { a.push((a[i-1]||0) + v); return a; }, []);
        datasets = [
            { type:'line', label:'누적 계획', data: cTarget.map(v=>Math.round(v)), borderColor: planLine,   borderDash:[6,4], borderWidth:2, pointRadius:2, backgroundColor:'transparent', tension:0.3 },
            { type:'line', label:'누적 실적', data: cActual.map(v=>Math.round(v)), borderColor: lineColor, borderWidth:2.5, pointRadius:3, backgroundColor:'transparent', tension:0.3 },
        ];
        chartType = 'line';

    } else {
        // ── 월별 (기본): 계획 bar + 실적 bar ─────────────────────
        labels = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
        const mActual = _getMonthlyActual(rows, y);
        const mTarget = _getMonthlyTarget(target);
        datasets = [
            { type:'bar', label:'계획', data: mTarget.map(v=>Math.round(v)), backgroundColor: planColor,  borderColor: lineColor, borderWidth:1.5, borderRadius:3 },
            { type:'bar', label:'실적', data: mActual.map(v=>Math.round(v)), backgroundColor: solidColor, borderRadius:3 },
        ];
        chartType = 'bar';
    }

    chartRevMixed = new Chart(ctx, {
        type: chartType,
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color:'#BAC0CB', font:{ size:11 } } },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${fmtMil(ctx.raw)}`
                    }
                }
            },
            scales: {
                y: {
                    ticks: { color:'#BAC0CB', callback: v => fmtMil(v) },
                    grid:  { color:'rgba(255,255,255,0.05)' }
                },
                x: { ticks: { color:'#BAC0CB' }, grid: { display:false } }
            }
        }
    });
}

// ══════════════════════════════════════════════════════════════════
// ── 차트 2: 수입기여도 도넛 (인증마크별 / 담당자별) ─────────────────
// ══════════════════════════════════════════════════════════════════
function renderSvcChart(rows, team, y) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('chartTopServices');
    if (!ctx) return;
    if (chartTopServices) { chartTopServices.destroy(); chartTopServices = null; }

    const COLORS = ['#5B6EF5','#19A876','#F5A623','#E8652A','#4FC3F7','#AB47BC','#26A69A','#EF5350','#78909C','#D4E157'];
    const targetRows = rows.filter(r => r.year === y);
    const map = {};

    if (svcChartMode === 'manager') {
        // ── 담당자별 ─────────────────────────────────────────────
        targetRows.forEach(r => {
            const key = r.manager || '미지정';
            map[key] = (map[key] || 0) + toKRW(Number(r.amount || 0), r.amountCurrency || 'KRW');
        });
    } else {
        // ── 인증마크/서비스별 ─────────────────────────────────────
        targetRows.forEach(r => {
            let key;
            if (r.biztype || r.product) {
                // 의료기기팀 레코드 → 카테고리 분류
                key = categorizeMed(r);
            } else {
                // 제품환경인증팀 레코드
                key = r.certtype || '기타';
            }
            map[key] = (map[key] || 0) + toKRW(Number(r.amount || 0), r.amountCurrency || 'KRW');
        });
    }

    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!sorted.length) return;

    chartTopServices = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sorted.map(([k]) => k),
            datasets: [{
                data: sorted.map(([, v]) => Math.round(v)),
                backgroundColor: COLORS.slice(0, sorted.length),
                borderWidth: 0,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position:'bottom', labels:{ color:'#BAC0CB', font:{ size:11 }, boxWidth:12 } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
                            const pct   = total ? Math.round(ctx.raw / total * 100) : 0;
                            return ` ${ctx.label}: ${fmtM(ctx.raw)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.renderRevenue          = renderRevenue;
window.switchRevTeam          = switchRevTeam;
window.switchRevChartMode     = switchRevChartMode;
window.switchServiceChartMode = switchServiceChartMode;
