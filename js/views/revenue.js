// js/views/revenue.js — 수입계획 및 실적 뷰

import { getState, getCurrentYear, getRevTeam, setRevTeam, ensureRevYear } from '../core/store.js';
import { toKRW, fmtM, fmtMil, getBilledActual, tt } from '../core/utils.js';

let chartRevMixed = null;
let chartTopServices = null;

export function switchRevTeam(team, el) {
    setRevTeam(team);
    document.querySelectorAll('#revTeamSelector .team-tab').forEach(b => {
        b.className = 'team-tab';
    });
    if (el) el.className = 'team-tab ' + (team === 'med' ? 'active-med' : team === 'cert' ? 'active-cert' : 'active-med');
    renderRevenue();
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

    // 분기 목표 카드
    const qWrap = document.getElementById('revQuarterlyWrap');
    if (qWrap) {
        qWrap.innerHTML = `<div class="stat-grid" style="margin-bottom:20px">
            ${['q1','q2','q3','q4'].map((q,i) => {
                const tgt = Number(target[q]||0);
                const act = Math.round(actual[q]||0);
                const p   = tgt ? Math.min(Math.round(act/tgt*100),100) : 0;
                return `<div class="stat-card">
                    <div class="stat-label">${i+1}분기 목표</div>
                    <div class="stat-value">${fmtM(tgt)}</div>
                    <div style="font-size:12px;color:var(--success);margin-top:4px">실적 ${fmtM(act)} (${p}%)</div>
                    <div class="stat-bar"><div class="stat-fill fill-${team==='cert'?'cert':'med'}" style="width:${p}%"></div></div>
                    <input class="m-input" type="number" value="${tgt}" placeholder="목표 입력"
                        onchange="updateTarget('${team}','${q}',this.value)" style="margin-top:8px">
                </div>`;
            }).join('')}
        </div>`;
    }

    // 월별 카드
    const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    const mCards = document.getElementById('mCards');
    if (mCards) {
        const rows = team === 'med' ? medRows : team === 'cert' ? certRows : [...medRows, ...certRows];
        const monthly = Array(12).fill(0);
        rows.forEach(r => {
            (r.billing||[]).forEach((amt,i) => {
                const d = (r.billingDates||[])[i];
                if (!d || new Date(d).getFullYear() !== y) return;
                const m = new Date(d).getMonth();
                monthly[m] += toKRW(Number(amt||0), (r.billingCurrencies||[])[i]||'KRW');
            });
        });
        mCards.innerHTML = monthly.map((v,i) =>
            `<div class="m-card">
                <div class="m-label">${MONTHS[i]}</div>
                <div class="m-actual">${fmtMil(Math.round(v))}</div>
            </div>`
        ).join('');
    }

    // 계약별 수입 결산 테이블
    const tbody = document.querySelector('#revContractTable tbody');
    if (tbody) {
        const rows = team === 'med'
            ? medRows.filter(r => r.year === y).map(r => ({...r, _team:'의료기기팀', _item: r.biztype||r.product||''}))
            : team === 'cert'
            ? certRows.filter(r => r.year === y).map(r => ({...r, _team:'제품환경인증팀', _item: r.certtype||''}))
            : [
                ...medRows.filter(r => r.year === y).map(r => ({...r, _team:'의료기기팀', _item: r.biztype||r.product||''})),
                ...certRows.filter(r => r.year === y).map(r => ({...r, _team:'제품환경인증팀', _item: r.certtype||''})),
              ];

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">데이터가 없습니다.</td></tr>`;
        } else {
            tbody.innerHTML = rows.map((r,i) => {
                const paid = (r.billing||[]).reduce((s,v,bi) => s + toKRW(Number(v||0),(r.billingCurrencies||[])[bi]||'KRW'), 0);
                const total = toKRW(Number(r.amount||0), r.amountCurrency||'KRW');
                const remain = total - paid;
                return `<tr>
                    <td>${i+1}</td>
                    <td><span class="badge ${r._team==='의료기기팀'?'badge-med':'badge-cert'}">${r._team}</span></td>
                    <td>${r.client||''}</td>
                    <td>${r._item}</td>
                    <td>${r.startdate||r.contractdate||''}</td>
                    <td>${fmtM(r.amount||0)} ${r.amountCurrency||'KRW'}</td>
                    <td style="color:var(--success);font-weight:700">${fmtM(Math.round(paid))}</td>
                    <td style="color:${remain>0?'var(--warn)':'var(--text3)'}">${fmtM(Math.round(remain))}</td>
                    <td>${r.manager||''}</td>
                </tr>`;
            }).join('');
        }
    }

    renderRevenueCharts(actual, target, team, medRows, certRows, y);
}

function renderRevenueCharts(actual, target, team, medRows, certRows, y) {
    if (typeof Chart === 'undefined') return;

    // 월별 바 차트
    const MONTHS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
    const rows = team === 'med' ? medRows : team === 'cert' ? certRows : [...medRows,...certRows];
    const monthly = Array(12).fill(0);
    rows.forEach(r => {
        (r.billing||[]).forEach((amt,i) => {
            const d = (r.billingDates||[])[i];
            if (!d || new Date(d).getFullYear() !== y) return;
            const m = new Date(d).getMonth();
            monthly[m] += toKRW(Number(amt||0),(r.billingCurrencies||[])[i]||'KRW');
        });
    });
    const cumulative = monthly.reduce((acc,v,i) => { acc.push((acc[i-1]||0)+v); return acc; }, []);

    const ctx1 = document.getElementById('chartRevMixed');
    if (ctx1) {
        if (chartRevMixed) chartRevMixed.destroy();
        chartRevMixed = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: MONTHS.map(m => m+'월'),
                datasets: [
                    { type:'bar', label:'월 수입', data: monthly.map(v=>Math.round(v)), backgroundColor: team==='cert'?'rgba(25,168,118,0.6)':'rgba(91,110,245,0.6)', yAxisID:'y' },
                    { type:'line', label:'누적', data: cumulative.map(v=>Math.round(v)), borderColor:'#F5A623', backgroundColor:'transparent', pointRadius:3, yAxisID:'y1' },
                ]
            },
            options: {
                responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ labels:{ color:'#BAC0CB' } } },
                scales:{
                    y:{ ticks:{ color:'#BAC0CB', callback: v => fmtMil(v) }, grid:{ color:'rgba(255,255,255,0.05)' } },
                    y1:{ position:'right', ticks:{ color:'#F5A623', callback: v => fmtMil(v) }, grid:{ display:false } },
                    x:{ ticks:{ color:'#BAC0CB' }, grid:{ display:false } }
                }
            }
        });
    }

    // 서비스별 파이 차트
    const ctx2 = document.getElementById('chartTopServices');
    if (ctx2) {
        if (chartTopServices) chartTopServices.destroy();
        const svcMap = {};
        rows.filter(r => r.year === y).forEach(r => {
            const key = r.certtype || r.biztype || r.product || '기타';
            const amt = toKRW(Number(r.amount||0), r.amountCurrency||'KRW');
            svcMap[key] = (svcMap[key]||0) + amt;
        });
        const sorted = Object.entries(svcMap).sort((a,b)=>b[1]-a[1]).slice(0,8);
        chartTopServices = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: sorted.map(([k])=>k),
                datasets: [{ data: sorted.map(([,v])=>Math.round(v)),
                    backgroundColor: ['#5B6EF5','#19A876','#F5A623','#E8652A','#4FC3F7','#AB47BC','#26A69A','#EF5350'],
                    borderWidth:0 }]
            },
            options: {
                responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ position:'bottom', labels:{ color:'#BAC0CB', font:{size:11} } } }
            }
        });
    }
}

window.renderRevenue   = renderRevenue;
window.switchRevTeam   = switchRevTeam;