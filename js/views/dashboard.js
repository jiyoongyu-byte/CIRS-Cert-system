// js/views/dashboard.js

import { getState, getCurrentYear, getCurrentUser } from '../core/store.js';
import { toKRW, fmtM, fmtMil, getBilledActual, tt } from '../core/utils.js';

let chartDashMixed = null;

export function renderDashboard() {
    const state = getState();
    const y     = getCurrentYear();
    const user  = getCurrentUser();
    const EXECS = ['지윤규','대표이사'];
    const isExec = EXECS.includes(user);

    const medRows  = (state.med  || []).filter(r => r.recordType === 'contract');
    const certRows = (state.cert || []).filter(r => r.recordType === 'contract');

    const { qs: medActual  } = getBilledActual(medRows,  y);
    const { qs: certActual } = getBilledActual(certRows, y);

    const medTotal  = Object.values(medActual).reduce((a,b)=>a+b,0);
    const certTotal = Object.values(certActual).reduce((a,b)=>a+b,0);
    const grandTotal = medTotal + certTotal;

    // 통계 카드
    const dashStats = document.getElementById('dashStats');
    if (dashStats) {
        dashStats.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">의료기기팀 수입실적</div>
                <div class="stat-value">${isExec ? fmtM(Math.round(medTotal)) : '***'}</div>
                <div class="stat-bar"><div class="stat-fill fill-med" style="width:${grandTotal?Math.round(medTotal/grandTotal*100):0}%"></div></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">제품환경인증팀 수입실적</div>
                <div class="stat-value">${isExec ? fmtM(Math.round(certTotal)) : '***'}</div>
                <div class="stat-bar"><div class="stat-fill fill-cert" style="width:${grandTotal?Math.round(certTotal/grandTotal*100):0}%"></div></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">전체 합산 수입실적</div>
                <div class="stat-value">${isExec ? fmtM(Math.round(grandTotal)) : '***'}</div>
                <div class="stat-bar"><div class="stat-fill fill-accent" style="width:100%"></div></div>
            </div>
            <div class="stat-card">
                <div class="stat-label">진행중 계약 건수</div>
                <div class="stat-value">${[...medRows,...certRows].filter(r=>r.year===y&&r.status!=='완료').length}건</div>
                <div class="stat-bar"><div class="stat-fill fill-success" style="width:100%"></div></div>
            </div>`;
    }

    // 수/발신 업무 (업무지시)
    const myTasksList = document.getElementById('myTasksList');
    if (myTasksList) {
        const tasks = (state.tasks || [])
            .filter(t => !t.completedDate && (t.to === user || t.from === user))
            .slice(0, 5);
        myTasksList.innerHTML = !tasks.length
            ? `<div style="color:var(--text3);font-size:12px;padding:8px">진행중 업무가 없습니다.</div>`
            : tasks.map(t => `
                <div class="ws-item" onclick="nav('tasks')">
                    <div>
                        <div class="ws-title">${t.content?.slice(0,30)||''}${(t.content?.length||0)>30?'...':''}</div>
                        <div class="ws-meta">${t.from||''} → ${t.to||''} | ${t.date||''}</div>
                    </div>
                    <span class="badge badge-med">${t.priority||'일반'}</span>
                </div>`).join('');
    }

    // 진행중 계약 모니터링
    const myProjectsList = document.getElementById('myProjectsList');
    if (myProjectsList) {
        const active = [...medRows, ...certRows]
            .filter(r => r.year === y && r.status !== '완료' && r.stage !== '완료')
            .slice(0, 5);
        myProjectsList.innerHTML = !active.length
            ? `<div style="color:var(--text3);font-size:12px;padding:8px">진행중 계약이 없습니다.</div>`
            : active.map(r => `
                <div class="ws-item">
                    <div>
                        <div class="ws-title">${r.client||''}</div>
                        <div class="ws-meta">${r.certtype||r.biztype||r.product||''} | ${r.manager||''} | ${r.stage||''}</div>
                    </div>
                    <span class="badge ${r.certtype?'badge-cert':'badge-med'}">${r.status||'진행중'}</span>
                </div>`).join('');
    }

    // 현재 상담 진행 현황
    const speedStarList = document.getElementById('speedStarList');
    if (speedStarList) {
        const consults = [...(state.med||[]),...(state.cert||[])]
            .filter(r => r.recordType === 'consult' && r.year === y &&
                r.consultStatus !== '계약불가' && r.contracted !== '계약불가')
            .slice(0, 5);
        speedStarList.innerHTML = !consults.length
            ? `<div style="color:var(--text3);font-size:12px;padding:8px">진행중 상담이 없습니다.</div>`
            : consults.map(r => `
                <div class="ws-item">
                    <div>
                        <div class="ws-title">${r.client||''}</div>
                        <div class="ws-meta">${r.certtype||r.biztype||r.product||''} | ${r.manager||''}</div>
                    </div>
                    <span class="badge badge-cert">${r.consultStatus||r.contracted||'상담중'}</span>
                </div>`).join('');
    }

    // 다가오는 수금 및 인증 만료
    const billingAlertList = document.getElementById('billingAlertList');
    if (billingAlertList) {
        const today = new Date();
        const d30   = new Date(today); d30.setDate(d30.getDate()+30);
        const alerts = [];
        [...medRows,...certRows].forEach(r => {
            (r.billingDates||[]).forEach((d,i) => {
                if (!d || !r.billing?.[i]) return;
                const dt = new Date(d);
                if (dt >= today && dt <= d30) {
                    alerts.push({ client: r.client, date: d,
                        amt: fmtM(toKRW(r.billing[i], (r.billingCurrencies||[])[i]||'KRW')),
                        type: '수금' });
                }
            });
            if (r.expiredate) {
                const dt = new Date(r.expiredate);
                if (dt >= today && dt <= d30) {
                    alerts.push({ client: r.client, date: r.expiredate, amt: '', type: '인증만료' });
                }
            }
        });
        billingAlertList.innerHTML = !alerts.length
            ? `<div style="color:var(--text3);font-size:12px;padding:8px">30일 내 예정 항목이 없습니다.</div>`
            : alerts.sort((a,b)=>a.date.localeCompare(b.date)).map(a => `
                <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px">
                    <div style="font-weight:700;font-size:13px">${a.client}</div>
                    <div style="font-size:11px;color:var(--text3);margin-top:4px">${a.type} | ${a.date} ${a.amt}</div>
                </div>`).join('');
    }

    // 통합 월별 차트
    renderDashChart(medRows, certRows, y, isExec);
}

function renderDashChart(medRows, certRows, y, isExec) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('chartDashMixed');
    if (!ctx) return;
    if (chartDashMixed) chartDashMixed.destroy();

    const medMonthly  = Array(12).fill(0);
    const certMonthly = Array(12).fill(0);

    medRows.forEach(r => {
        (r.billing||[]).forEach((amt,i) => {
            const d = (r.billingDates||[])[i];
            if (!d || new Date(d).getFullYear() !== y) return;
            medMonthly[new Date(d).getMonth()] += toKRW(Number(amt||0),(r.billingCurrencies||[])[i]||'KRW');
        });
    });
    certRows.forEach(r => {
        (r.billing||[]).forEach((amt,i) => {
            const d = (r.billingDates||[])[i];
            if (!d || new Date(d).getFullYear() !== y) return;
            certMonthly[new Date(d).getMonth()] += toKRW(Number(amt||0),(r.billingCurrencies||[])[i]||'KRW');
        });
    });

    const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    const cumulative = medMonthly.map((v,i) => Math.round(v + certMonthly[i]));
    let cum = 0;
    const cumLine = cumulative.map(v => { cum+=v; return cum; });

    chartDashMixed = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: MONTHS,
            datasets: [
                { type:'bar', label:'의료기기팀', data: medMonthly.map(v=>Math.round(v)), backgroundColor:'rgba(91,110,245,0.7)', yAxisID:'y' },
                { type:'bar', label:'인증팀', data: certMonthly.map(v=>Math.round(v)), backgroundColor:'rgba(25,168,118,0.7)', yAxisID:'y' },
                { type:'line', label:'누적합계', data: cumLine, borderColor:'#F5A623', backgroundColor:'transparent', pointRadius:3, yAxisID:'y1' },
            ]
        },
        options: {
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{ labels:{ color:'#BAC0CB' } } },
            scales:{
                y:{ stacked:true, ticks:{ color:'#BAC0CB', callback:v=>fmtMil(v) }, grid:{ color:'rgba(255,255,255,0.05)' } },
                y1:{ position:'right', ticks:{ color:'#F5A623', callback:v=>fmtMil(v) }, grid:{ display:false } },
                x:{ stacked:true, ticks:{ color:'#BAC0CB' }, grid:{ display:false } }
            }
        }
    });
}

window.renderDashboard = renderDashboard;
