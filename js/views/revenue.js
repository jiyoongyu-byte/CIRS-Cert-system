// js/views/revenue.js — 수입계획 및 실적 뷰

import { getState, getCurrentYear, getRevTeam, setRevTeam, ensureRevYear } from '../core/store.js';
import { toKRW, fmt, fmtMil, getBilledActual } from '../core/utils.js';

let chartRevMixed = null;
let chartTopServices = null;
let revChartMode = 'month';   // 'month' | 'quarter'
let serviceChartMode = 'cert'; // 'cert' | 'manager'

const CN_MANAGERS = ['윤미령','Lyu Cuicui','Zhao Lijie'];

export function switchRevTeam(team, el) {
    setRevTeam(team);
    document.querySelectorAll('#revTeamSelector .team-tab').forEach(b => { b.className = 'team-tab'; });
    if (el) el.className = 'team-tab ' + (team === 'med' ? 'active-med' : team === 'cert' ? 'active-cert' : 'active-med');
    renderRevenue();
}

export function switchRevChartMode(mode, el) {
    revChartMode = mode;
    document.querySelectorAll('.rev-chart-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    const state = getState();
    const y     = getCurrentYear();
    const team  = getRevTeam() || 'med';
    const medRows  = (state.med  || []).filter(r => r.recordType === 'contract');
    const certRows = (state.cert || []).filter(r => r.recordType === 'contract');
    const { qs: medActual  } = getBilledActual(medRows, y);
    const { qs: certActual } = getBilledActual(certRows, y);
    const totalActual = { q1: medActual.q1+certActual.q1, q2: medActual.q2+certActual.q2, q3: medActual.q3+certActual.q3, q4: medActual.q4+certActual.q4 };
    const actual = team === 'med' ? medActual : team === 'cert' ? certActual : totalActual;
    const rev = state.revenue[y] || {};
    const medTarget  = rev.med  || { q1:0, q2:0, q3:0, q4:0 };
    const certTarget = rev.cert || { q1:0, q2:0, q3:0, q4:0 };
    const totalTarget = { q1:(medTarget.q1||0)+(certTarget.q1||0), q2:(medTarget.q2||0)+(certTarget.q2||0), q3:(medTarget.q3||0)+(certTarget.q3||0), q4:(medTarget.q4||0)+(certTarget.q4||0) };
    const target = team === 'med' ? medTarget : team === 'cert' ? certTarget : totalTarget;
    const rows = team === 'med' ? medRows : team === 'cert' ? certRows : [...medRows,...certRows];
    renderRevenueCharts(actual, target, team, rows, y);
}

export function switchServiceChartMode(mode, el) {
    serviceChartMode = mode;
    document.querySelectorAll('.svc-chart-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    const state = getState();
    const y     = getCurrentYear();
    const team  = getRevTeam() || 'med';
    const medRows  = (state.med  || []).filter(r => r.recordType === 'contract');
    const certRows = (state.cert || []).filter(r => r.recordType === 'contract');
    const rows = team === 'med' ? medRows : team === 'cert' ? certRows : [...medRows,...certRows];
    renderServiceChart(rows, y);
}

export function renderRevenue() {
    const state = getState();
    const y     = getCurrentYear();
    const team  = getRevTeam() || 'med';
    ensureRevYear(y);

    const medRows  = (state.med  || []).filter(r => r.recordType === 'contract');
    const certRows = (state.cert || []).filter(r => r.recordType === 'contract');

    const { qs: medActual  } = getBilledActual(medRows,  y);
    const { qs: certActual } = getBilledActual(certRows, y);

    const totalActual = {
        q1: medActual.q1 + certActual.q1,
        q2: medActual.q2 + certActual.q2,
        q3: medActual.q3 + certActual.q3,
        q4: medActual.q4 + certActual.q4,
    };

    const rev = state.revenue[y] || {};
    const medTarget  = rev.med  || { q1:0, q2:0, q3:0, q4:0 };
    const certTarget = rev.cert || { q1:0, q2:0, q3:0, q4:0 };
    const totalTarget = {
        q1: (medTarget.q1||0) + (certTarget.q1||0),
        q2: (medTarget.q2||0) + (certTarget.q2||0),
        q3: (medTarget.q3||0) + (certTarget.q3||0),
        q4: (medTarget.q4||0) + (certTarget.q4||0),
    };

    const actual = team === 'med' ? medActual : team === 'cert' ? certActual : totalActual;
    const target = team === 'med' ? medTarget : team === 'cert' ? certTarget : totalTarget;

    // ── 연간 총 목표 + 누적 합산 카드 ────────────────────────────
    const annualWrap = document.getElementById('revAnnualWrap');
    if (annualWrap) {
        const totalTgt = ['q1','q2','q3','q4'].reduce((s,q) => s + Number(target[q]||0), 0);
        const totalAct = ['q1','q2','q3','q4'].reduce((s,q) => s + Number(actual[q]||0), 0);
        const p = totalTgt ? Math.min(Math.round(totalAct/totalTgt*100), 100) : 0;
        const color = team === 'cert' ? 'cert' : 'med';
        annualWrap.innerHTML =
            '<div class="stat-card" style="border:2px solid var(--' + color + ');margin-bottom:20px">' +
                '<div class="stat-label" style="font-size:14px;font-weight:800;">🎯 ' + y + '년 연간 목표</div>' +
                '<div style="display:flex;gap:32px;align-items:center;margin:10px 0;flex-wrap:wrap;">' +
                    '<div>' +
                        '<div style="font-size:12px;color:var(--text3)">목표</div>' +
                        '<div style="font-size:20px;font-weight:900;font-family:var(--mono)">₩' + fmt(totalTgt) + '원</div>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-size:12px;color:var(--text3)">누적 실적</div>' +
                        '<div style="font-size:20px;font-weight:900;font-family:var(--mono);color:var(--success)">₩' + fmt(Math.round(totalAct)) + '원</div>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-size:12px;color:var(--text3)">달성률</div>' +
                        '<div style="font-size:24px;font-weight:900;color:' + (p>=100?'var(--success)':p>=70?'var(--warn)':'var(--danger)') + '">' + p + '%</div>' +
                    '</div>' +
                '</div>' +
                '<div class="stat-bar" style="height:8px"><div class="stat-fill fill-' + color + '" style="width:' + p + '%"></div></div>' +
            '</div>';
    }

    // ── 분기 목표 카드 ────────────────────────────────────────────
    const qWrap = document.getElementById('revQuarterlyWrap');
    if (qWrap) {
        const color = team === 'cert' ? 'cert' : 'med';
        qWrap.innerHTML = '<div class="stat-grid" style="margin-bottom:20px">' +
            ['q1','q2','q3','q4'].map((q, i) => {
                const tgt = Number(target[q]||0);
                const act = Math.round(actual[q]||0);
                const p   = tgt ? Math.min(Math.round(act/tgt*100), 100) : 0;
                // 월별 목표 = 분기목표 ÷ 3
                const mTgt = Math.round(tgt / 3);
                return '<div class="stat-card">' +
                    '<div class="stat-label">' + (i+1) + '분기 목표</div>' +
                    '<div style="font-size:16px;font-weight:800;font-family:var(--mono);margin:6px 0;">₩' + fmt(tgt) + '원</div>' +
                    '<div style="font-size:12px;color:var(--text3);margin-bottom:2px;">월 목표 ₩' + fmt(mTgt) + '원</div>' +
                    '<div style="font-size:13px;font-weight:700;color:var(--success);margin-bottom:6px;">실적 ₩' + fmt(act) + '원 (' + p + '%)</div>' +
                    '<div class="stat-bar"><div class="stat-fill fill-' + color + '" style="width:' + p + '%"></div></div>' +
                    '<input class="m-input" type="number" value="' + tgt + '" placeholder="목표 입력" onchange="updateTargetFromInput(this)" data-team="' + team + '" data-q="' + q + '" style="margin-top:8px">' +
                    '</div>';
            }).join('') +
        '</div>';
    }

    // ── 월별 카드 ─────────────────────────────────────────────────
    const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    const mCards = document.getElementById('mCards');
    const rows = team === 'med' ? medRows : team === 'cert' ? certRows : [...medRows, ...certRows];
    const monthly = Array(12).fill(0);
    rows.forEach(r => {
        (r.billing||[]).forEach((amt, i) => {
            const d = (r.billingDates||[])[i];
            if (!d || new Date(d).getFullYear() !== y) return;
            const m = new Date(d).getMonth();
            monthly[m] += toKRW(Number(amt||0), (r.billingCurrencies||[])[i]||'KRW');
        });
    });

    if (mCards) {
        // 월별 목표 = 해당 분기목표 ÷ 3
        const monthlyTarget = Array(12).fill(0).map((_, mi) => {
            const q = ['q1','q1','q1','q2','q2','q2','q3','q3','q3','q4','q4','q4'][mi];
            return Math.round(Number(target[q]||0) / 3);
        });
        mCards.innerHTML = monthly.map((v, i) => {
            const tgt = monthlyTarget[i];
            const p = tgt ? Math.min(Math.round(v/tgt*100), 100) : 0;
            return '<div class="m-card">' +
                '<div class="m-label">' + MONTHS[i] + '</div>' +
                '<div style="font-size:11px;color:var(--text3)">목표 ' + fmtMil(tgt) + '</div>' +
                '<div class="m-actual">₩' + fmt(Math.round(v)) + '</div>' +
                '<div style="font-size:11px;color:' + (p>=100?'var(--success)':p>0?'var(--warn)':'var(--text3)') + '">' + (tgt?p+'%':'') + '</div>' +
            '</div>';
        }).join('');
    }

    // ── 계약별 수입 결산 테이블 ───────────────────────────────────
    const tbody = document.querySelector('#revContractTable tbody');
    if (tbody) {
        const tableRows = team === 'med'
            ? medRows.filter(r => r.year === y).map(r => ({...r, _team:'의료기기팀', _item: r.biztype||r.product||''}))
            : team === 'cert'
            ? certRows.filter(r => r.year === y).map(r => ({...r, _team:'제품환경인증팀', _item: r.certtype||''}))
            : [
                ...medRows.filter(r => r.year === y).map(r => ({...r, _team:'의료기기팀', _item: r.biztype||r.product||''})),
                ...certRows.filter(r => r.year === y).map(r => ({...r, _team:'제품환경인증팀', _item: r.certtype||''})),
              ];

        if (!tableRows.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">데이터가 없습니다.</td></tr>';
        } else {
            tbody.innerHTML = tableRows.map((r, i) => {
                const paid   = (r.billing||[]).reduce((s,v,bi) => s + toKRW(Number(v||0),(r.billingCurrencies||[])[bi]||'KRW'), 0);
                const total  = toKRW(Number(r.amount||0), r.amountCurrency||'KRW');
                const remain = total - paid;
                return '<tr>' +
                    '<td>' + (i+1) + '</td>' +
                    '<td><span class="badge ' + (r._team==='의료기기팀'?'badge-med':'badge-cert') + '">' + r._team + '</span></td>' +
                    '<td>' + (r.client||'') + '</td>' +
                    '<td>' + (r._item||'') + '</td>' +
                    '<td>' + (r.startdate||r.contractdate||'') + '</td>' +
                    '<td>₩' + fmt(r.amount||0) + ' ' + (r.amountCurrency||'KRW') + '</td>' +
                    '<td style="color:var(--success);font-weight:700">₩' + fmt(Math.round(paid)) + '</td>' +
                    '<td style="color:' + (remain>0?'var(--warn)':'var(--text3)') + '">₩' + fmt(Math.round(remain)) + '</td>' +
                    '<td>' + (r.manager||'') + '</td>' +
                '</tr>';
            }).join('');
        }
    }

    renderRevenueCharts(actual, target, team, rows, y);
    renderServiceChart(rows, y);
}

function renderRevenueCharts(actual, target, team, rows, y) {
    if (typeof Chart === 'undefined') return;
    const color = team === 'cert' ? 'rgba(25,168,118,0.7)' : 'rgba(91,110,245,0.7)';
    const colorTgt = team === 'cert' ? 'rgba(25,168,118,0.3)' : 'rgba(91,110,245,0.3)';

    const ctx1 = document.getElementById('chartRevMixed');
    if (!ctx1) return;
    if (chartRevMixed) chartRevMixed.destroy();

    if (revChartMode === 'month') {
        // ── 월별 차트 ──────────────────────────────────────────
        const MONTHS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
        const monthly = Array(12).fill(0);
        rows.forEach(r => {
            (r.billing||[]).forEach((amt, i) => {
                const d = (r.billingDates||[])[i];
                if (!d || new Date(d).getFullYear() !== y) return;
                monthly[new Date(d).getMonth()] += toKRW(Number(amt||0),(r.billingCurrencies||[])[i]||'KRW');
            });
        });
        const monthlyTarget = Array(12).fill(0).map((_, mi) => {
            const q = ['q1','q1','q1','q2','q2','q2','q3','q3','q3','q4','q4','q4'][mi];
            return Math.round(Number(target[q]||0) / 3);
        });
        let cumAct = 0, cumTgt = 0;
        const cumActual = monthly.map(v => { cumAct += v; return Math.round(cumAct); });
        const cumTarget = monthlyTarget.map(v => { cumTgt += v; return cumTgt; });

        chartRevMixed = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: MONTHS.map(m => m+'월'),
                datasets: [
                    { type:'bar', label:'월 목표', data: monthlyTarget, backgroundColor: colorTgt, yAxisID:'y' },
                    { type:'bar', label:'월 실적', data: monthly.map(v=>Math.round(v)), backgroundColor: color, yAxisID:'y' },
                    { type:'line', label:'누적 목표', data: cumTarget, borderColor:'rgba(255,255,255,0.4)', borderDash:[5,5], backgroundColor:'transparent', pointRadius:2, yAxisID:'y1' },
                    { type:'line', label:'누적 실적', data: cumActual, borderColor:'#F5A623', backgroundColor:'transparent', pointRadius:3, yAxisID:'y1' },
                ]
            },
            options: {
                responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ labels:{ color:'#BAC0CB', font:{size:11} } } },
                scales:{
                    y:{ ticks:{ color:'#BAC0CB', callback: v => fmtMil(v) }, grid:{ color:'rgba(255,255,255,0.05)' } },
                    y1:{ position:'right', ticks:{ color:'#F5A623', callback: v => fmtMil(v) }, grid:{ display:false } },
                    x:{ ticks:{ color:'#BAC0CB' }, grid:{ display:false } }
                }
            }
        });
    } else {
        // ── 분기 차트 ──────────────────────────────────────────
        const QS = ['q1','q2','q3','q4'];
        const qActual = QS.map(q => Math.round(actual[q]||0));
        const qTarget = QS.map(q => Number(target[q]||0));
        let cAct = 0, cTgt = 0;
        const cumActual = qActual.map(v => { cAct += v; return cAct; });
        const cumTarget = qTarget.map(v => { cTgt += v; return cTgt; });

        chartRevMixed = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: ['1분기','2분기','3분기','4분기'],
                datasets: [
                    { type:'bar', label:'분기 목표', data: qTarget, backgroundColor: colorTgt, yAxisID:'y' },
                    { type:'bar', label:'분기 실적', data: qActual, backgroundColor: color, yAxisID:'y' },
                    { type:'line', label:'누적 목표', data: cumTarget, borderColor:'rgba(255,255,255,0.4)', borderDash:[5,5], backgroundColor:'transparent', pointRadius:4, yAxisID:'y1' },
                    { type:'line', label:'누적 실적', data: cumActual, borderColor:'#F5A623', backgroundColor:'transparent', pointRadius:4, yAxisID:'y1' },
                ]
            },
            options: {
                responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ labels:{ color:'#BAC0CB', font:{size:11} } } },
                scales:{
                    y:{ ticks:{ color:'#BAC0CB', callback: v => fmtMil(v) }, grid:{ color:'rgba(255,255,255,0.05)' } },
                    y1:{ position:'right', ticks:{ color:'#F5A623', callback: v => fmtMil(v) }, grid:{ display:false } },
                    x:{ ticks:{ color:'#BAC0CB' }, grid:{ display:false } }
                }
            }
        });
    }
}

function renderServiceChart(rows, y) {
    if (typeof Chart === 'undefined') return;
    const ctx2 = document.getElementById('chartTopServices');
    if (!ctx2) return;
    if (chartTopServices) chartTopServices.destroy();

    const svcMap = {};
    rows.filter(r => r.year === y).forEach(r => {
        let key;
        if (serviceChartMode === 'manager') {
            const mgr = r.manager || '미지정';
            const isKR = !CN_MANAGERS.includes(mgr);
            key = isKR ? '국내 (' + mgr + ')' : '중국 (' + mgr + ')';
        } else {
            key = r.certtype || r.biztype || r.product || '기타';
        }
        svcMap[key] = (svcMap[key]||0) + toKRW(Number(r.amount||0), r.amountCurrency||'KRW');
    });

    const sorted = Object.entries(svcMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
    chartTopServices = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: sorted.map(([k])=>k),
            datasets: [{ data: sorted.map(([,v])=>Math.round(v)),
                backgroundColor: ['#5B6EF5','#19A876','#F5A623','#E8652A','#4FC3F7','#AB47BC','#26A69A','#EF5350','#66BB6A','#EC407A'],
                borderWidth:0 }]
        },
        options: {
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{ position:'bottom', labels:{ color:'#BAC0CB', font:{size:11} } } }
        }
    });
}

window.renderRevenue        = renderRevenue;
window.switchRevTeam        = switchRevTeam;
window.switchRevChartMode   = switchRevChartMode;
window.switchServiceChartMode = switchServiceChartMode;
