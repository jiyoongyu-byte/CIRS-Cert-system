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
    const SUPER_ADMIN = '지윤규';
    const ADMIN_USERS = window.ADMIN_USERS || ['지윤규','엄태호','유재용'];
    const MED_TEAM    = ['유재용','윤미령','차상호','Zhao Lijie'];
    const CERT_TEAM   = ['엄태호','Lyu Cuicui','박성재'];

    const medRows  = (state.med  || []).filter(r => r.recordType === 'contract');
    const certRows = (state.cert || []).filter(r => r.recordType === 'contract');

    const { qs: medActual  } = getBilledActual(medRows,  y);
    const { qs: certActual } = getBilledActual(certRows, y);

    const medTotal   = Object.values(medActual).reduce((a,b)=>a+b,0);
    const certTotal  = Object.values(certActual).reduce((a,b)=>a+b,0);
    const grandTotal = medTotal + certTotal;

    // ── 통계 카드 ────────────────────────────────────────────────
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

    // ── 수/발신 업무 (업무지시) ───────────────────────────────────
    // 지윤규: 전체 / 팀장(유재용,엄태호): 본인팀 전체 / 일반: 본인 관련만 / 대표이사: 본인 작성만
    const myTasksList = document.getElementById('myTasksList');
    if (myTasksList) {
        let tasks = (state.tasks || []).filter(t => !t.completedDate);

        if (user === SUPER_ADMIN) {
            // 지윤규: 전체 업무지시 표시
        } else if (user === (window.REP_USER || '대표이사')) {
            tasks = tasks.filter(t => t.from === user);
        } else if (MED_TEAM.includes(user) && ADMIN_USERS.includes(user)) {
            // 팀장(유재용): 의료기기팀 전체
            tasks = tasks.filter(t => t.team === '의료기기팀' || t.team === '공통' || t.to === user || t.from === user);
        } else if (CERT_TEAM.includes(user) && ADMIN_USERS.includes(user)) {
            // 팀장(엄태호): 제품환경인증팀 전체
            tasks = tasks.filter(t => t.team === '제품환경인증팀' || t.team === '공통' || t.to === user || t.from === user);
        } else {
            // 일반 직원: 본인 관련만
            tasks = tasks.filter(t => t.to === user || t.from === user);
        }

        tasks = tasks.slice(0, 5);
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

    // ── 진행중 계약 모니터링 ──────────────────────────────────────
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

    // ── 현재 상담 진행 현황 ───────────────────────────────────────
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

    // ── 다가오는 수금 및 인증 만료 ────────────────────────────────
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
                if (dt >= today && dt <= d30)
                    alerts.push({ client: r.client, date: r.expiredate, amt: '', type: '인증만료' });
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
    let cum = 0;
    const cumLine = medMonthly.map((v,i) => { cum += Math.round(v + certMonthly[i]); return cum; });

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

// ── 브리핑 모달 ───────────────────────────────────────────────────
export function showBriefing() {
    const state = getState();
    const user  = getCurrentUser();
    if (user !== '지윤규') return;

    const lastSeen = localStorage.getItem('cirs_briefing_seen') || '';
    const now      = new Date().toISOString();

    // 변경사항 수집
    const changes = [];
    const cutoff  = lastSeen || new Date(Date.now() - 7*24*60*60*1000).toISOString();

    // 최근 추가/수정된 계약
    const recentContracts = [...(state.med||[]),...(state.cert||[])]
        .filter(r => r.recordType === 'contract')
        .slice(0, 5);
    if (recentContracts.length)
        changes.push({ title: '최근 계약 현황', items: recentContracts.map(r => `${r.client} (${r.manager||'-'})`) });

    // 미완료 업무지시
    const pendingTasks = (state.tasks||[]).filter(t => !t.completedDate);
    if (pendingTasks.length)
        changes.push({ title: `미완료 업무지시 ${pendingTasks.length}건`, items: pendingTasks.slice(0,3).map(t => `${t.to||'-'}: ${t.content?.slice(0,30)||''}`) });

    // 30일 내 수금/만료
    const today = new Date();
    const d30   = new Date(today); d30.setDate(d30.getDate()+30);
    const alerts = [];
    [...(state.med||[]),...(state.cert||[])].filter(r=>r.recordType==='contract').forEach(r => {
        if (r.expiredate && new Date(r.expiredate) >= today && new Date(r.expiredate) <= d30)
            alerts.push(`인증만료: ${r.client} (${r.expiredate})`);
    });
    if (alerts.length)
        changes.push({ title: '30일 내 인증 만료', items: alerts });

    const list = document.getElementById('briefingList');
    if (list) {
        list.innerHTML = changes.length
            ? changes.map(c => `
                <div style="margin-bottom:16px;">
                    <div style="font-weight:700;color:var(--med);margin-bottom:6px;">📌 ${c.title}</div>
                    ${c.items.map(i => `<div style="font-size:12px;color:var(--text2);padding:3px 0;border-bottom:1px solid var(--border)">• ${i}</div>`).join('')}
                </div>`).join('')
            : '<div style="color:var(--text3);font-size:13px">변경사항이 없습니다.</div>';
    }

    document.getElementById('modal-briefing')?.classList.add('open');
    localStorage.setItem('cirs_briefing_seen', now);
}

export function closeBriefing() {
    document.getElementById('modal-briefing')?.classList.remove('open');
}

window.renderDashboard = renderDashboard;
window.showBriefing    = showBriefing;
window.closeBriefing   = closeBriefing;
