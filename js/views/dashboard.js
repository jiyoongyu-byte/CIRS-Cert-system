// js/views/dashboard.js — 전체 현황 대시보드

import { getState, getCurrentYear, getCurrentUser } from '../core/store.js';
import { fmt, fmtM, toKRW } from '../core/utils.js';

// 차트 인스턴스 보관 (중복 생성 방지)
let dashChartInstance = null;

// ── 메인 렌더링 함수 ──────────────────────────────────────────────
export function renderDashboard() {
    const dbView = document.getElementById('view-dashboard');
    if (!dbView) return;

    const state    = getState();
    const year     = getCurrentYear();
    const user     = getCurrentUser();
    const EXECS    = window.EXECS    || ['대표이사', '지윤규'];
    const isExec   = EXECS.includes(user);
    const userTeam = window.getUserTeam ? window.getUserTeam(user) : '관리자';
    const isRep    = user === (window.REP_USER || '대표이사');

    // ── 팀 필터링: 팀원은 자기 팀 데이터만 ──────────────────────
    let medData  = (state.med  || []).filter(r => r.year === year);
    let certData = (state.cert || []).filter(r => r.year === year);

    if (!isExec) {
        if (userTeam === '의료기기팀')       certData = [];
        else if (userTeam === '제품환경인증팀') medData = [];
    }

    // 계약 (완료/취소 제외한 진행중)
    const medContracts  = medData.filter(r  => r.recordType === 'contract' && r.status !== '완료' && r.status !== '취소');
    const certContracts = certData.filter(r => r.recordType === 'contract' && r.stage  !== '완료');
    const allContracts  = [...medContracts, ...certContracts];

    // 상담 (보류 제외한 진행중)
    const medConsults   = medData.filter(r  => r.recordType === 'consult' && r.consultStatus !== '계약보류');
    const certConsults  = certData.filter(r => r.recordType === 'consult' && r.contracted    !== '계약보류');
    const allConsults   = [...medConsults, ...certConsults];

    // 수입 실적 합계
    const calcBilled = rows => rows.reduce((s, r) =>
        s + (r.billing || []).reduce((bs, amt, i) =>
            bs + toKRW(Number(amt || 0), (r.billingCurrencies || [])[i] || 'KRW'), 0), 0);
    const totalBilled = calcBilled(allContracts);

    // 계약 금액 합계
    const totalContractAmt = allContracts.reduce((s, r) =>
        s + toKRW(Number(r.amount || 0), r.amountCurrency || 'KRW'), 0);

    // 금액 표시 여부 (EXECS 또는 팀원 = 자기 팀 금액은 표시)
    const showMoney = isExec || (userTeam !== '열람전용');

    // ── 1. 통계 카드 ─────────────────────────────────────────────
    renderStats(allContracts, allConsults, totalContractAmt, totalBilled, showMoney, year);

    // ── 2. 수/발신 업무 ──────────────────────────────────────────
    renderMyTasks(state, user, isExec);

    // ── 3. 진행중 계약 모니터링 ──────────────────────────────────
    renderActiveProjects(allContracts, showMoney);

    // ── 4. 상담 진행 현황 ────────────────────────────────────────
    renderConsults(allConsults);

    // ── 5. 병목 분석 ─────────────────────────────────────────────
    renderBottleneck(allContracts);

    // ── 6. 수금/만료 알림 ────────────────────────────────────────
    renderBillingAlerts(allContracts, showMoney);

    // ── 7. 연도 표시 ─────────────────────────────────────────────
    const dashYear = document.getElementById('dashYear');
    if (dashYear) dashYear.textContent = `(${year}년)`;

    // ── 8. 월별 수입 차트 ────────────────────────────────────────
    if (typeof Chart === 'undefined') {
        console.warn('⚠️ Chart.js가 아직 로드되지 않았습니다.');
        return;
    }
    renderDashChart(state, year, allContracts, showMoney);
}

// ── 통계 카드 렌더링 ──────────────────────────────────────────────
function renderStats(allContracts, allConsults, totalAmt, totalBilled, showMoney, year) {
    const el = document.getElementById('dashStats');
    if (!el) return;

    const contractPct = totalAmt > 0 ? Math.min(Math.round(totalBilled / totalAmt * 100), 100) : 0;
    const cntPct      = Math.min(allContracts.length * 4, 100);
    const consPct     = Math.min(allConsults.length * 5, 100);

    el.innerHTML = `
        <div class="stat-card">
            <div class="stat-label">진행중 계약 건수 (${year}년)</div>
            <div class="stat-value">${allContracts.length}<span style="font-size:12px;color:var(--text3);margin-left:4px">건</span></div>
            <div class="stat-bar"><div class="stat-fill fill-med" style="width:${cntPct}%"></div></div>
        </div>
        <div class="stat-card">
            <div class="stat-label">${year}년 계약 금액 합계</div>
            <div class="stat-value" style="font-size:16px">${showMoney ? fmtM(totalAmt) : '***'}</div>
            <div class="stat-bar"><div class="stat-fill fill-cert" style="width:100%"></div></div>
        </div>
        <div class="stat-card">
            <div class="stat-label">${year}년 수입 실적 (달성률 ${showMoney ? contractPct + '%' : '***'})</div>
            <div class="stat-value" style="font-size:16px">${showMoney ? fmtM(totalBilled) : '***'}</div>
            <div class="stat-bar"><div class="stat-fill fill-success" style="width:${showMoney ? contractPct : 0}%"></div></div>
        </div>
        <div class="stat-card">
            <div class="stat-label">진행중 상담 건수 (${year}년)</div>
            <div class="stat-value">${allConsults.length}<span style="font-size:12px;color:var(--text3);margin-left:4px">건</span></div>
            <div class="stat-bar"><div class="stat-fill fill-accent" style="width:${consPct}%"></div></div>
        </div>
    `;
}

// ── 수/발신 업무 리스트 ──────────────────────────────────────────
function renderMyTasks(state, user, isExec) {
    const el = document.getElementById('myTasksList');
    if (!el) return;

    const today = new Date().toISOString().slice(0, 10);
    const PCOLOR = { '긴급':'var(--danger)', '일반':'var(--warn)', '낮음':'var(--success)' };

    // 지윤규: 전체 미완료 | 나머지: 본인 발신+수신 미완료
    const tasks = (state.tasks || []).filter(t => {
        if (!t.completedDate === false) return false; // 완료된 것 제외
        if (t.completedDate) return false;
        if (user === (window.SUPER_ADMIN || '지윤규')) return true;
        return t.from === user || t.to === user;
    }).slice(0, 8);

    if (!tasks.length) {
        el.innerHTML = `<div style="color:var(--text3);font-size:12px;padding:8px 0">진행중 업무가 없습니다.</div>`;
        return;
    }

    el.innerHTML = tasks.map(t => {
        const overdue  = t.due && t.due < today;
        const pc       = PCOLOR[t.priority] || 'var(--border2)';
        const isOrder  = (t.type || 'order') === 'order';
        const isMine   = t.from === user;
        return `<div class="ws-item" style="border-left:3px solid ${pc}; cursor:default">
            <div style="flex:1; min-width:0">
                <div class="ws-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${isMine ? '📤' : '📥'} ${t.to || '-'} ← ${t.from || '-'}
                </div>
                <div class="ws-meta">
                    ${isOrder ? '📋 업무지시' : '🤝 협조요청'} · ${t.date || '-'}
                    ${overdue ? ' <span style="color:var(--danger);font-weight:700">⚠기한초과</span>' : (t.due ? ' | ~' + t.due : '')}
                </div>
            </div>
            <span style="font-size:10px;font-weight:700;color:${pc};white-space:nowrap;flex-shrink:0">${t.priority || '일반'}</span>
        </div>`;
    }).join('');
}

// ── 진행중 계약 모니터링 ─────────────────────────────────────────
function renderActiveProjects(allContracts, showMoney) {
    const el = document.getElementById('myProjectsList');
    if (!el) return;

    const today = new Date().toISOString().slice(0, 10);
    const sorted = [...allContracts]
        .sort((a, b) => {
            const da = a.duedate || a.issuedate || '9999';
            const db = b.duedate || b.issuedate || '9999';
            return da > db ? 1 : -1;
        })
        .slice(0, 8);

    if (!sorted.length) {
        el.innerHTML = `<div style="color:var(--text3);font-size:12px;padding:8px 0">진행중 계약이 없습니다.</div>`;
        return;
    }

    el.innerHTML = sorted.map(r => {
        const dueDate   = r.duedate || r.issuedate || '';
        const overdue   = dueDate && dueDate < today;
        const isCert    = r.certtype !== undefined;
        const teamColor = isCert ? 'var(--cert)' : 'var(--med)';
        const remain    = toKRW(Number(r.amount || 0), r.amountCurrency || 'KRW')
            - (r.billing || []).reduce((s, v, i) =>
                s + toKRW(Number(v || 0), (r.billingCurrencies || [])[i] || 'KRW'), 0);
        const typeLabel = r.certtype || r.biztype || '';

        return `<div class="ws-item" style="border-left:3px solid ${teamColor}; cursor:default">
            <div style="flex:1; min-width:0">
                <div class="ws-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.client || ''}</div>
                <div class="ws-meta">
                    ${typeLabel} · ${r.manager || ''}
                    ${dueDate ? (overdue
                        ? ' · <span style="color:var(--danger);font-weight:700">⚠ ' + dueDate + '</span>'
                        : ' · ' + dueDate) : ''}
                </div>
            </div>
            <div style="font-size:11px;text-align:right;color:${remain > 0 ? 'var(--warn)' : 'var(--text3)'};font-weight:600;white-space:nowrap;flex-shrink:0">
                ${showMoney ? fmt(Math.round(remain)) : '***'}
            </div>
        </div>`;
    }).join('');
}

// ── 상담 진행 현황 ────────────────────────────────────────────────
function renderConsults(allConsults) {
    const el = document.getElementById('speedStarList');
    if (!el) return;

    const items = allConsults.slice(0, 8);
    if (!items.length) {
        el.innerHTML = `<div style="color:var(--text3);font-size:12px;padding:8px 0">진행중 상담이 없습니다.</div>`;
        return;
    }

    el.innerHTML = items.map(r => {
        const isCert    = r.certtype !== undefined;
        const teamColor = isCert ? 'var(--cert)' : 'var(--med)';
        const status    = r.consultStatus || r.contracted || '상담중';
        const typeLabel = r.certtype || r.biztype || r.grade || '';

        return `<div class="ws-item" style="border-left:3px solid ${teamColor}; cursor:default">
            <div style="flex:1; min-width:0">
                <div class="ws-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.client || ''}</div>
                <div class="ws-meta">${typeLabel} · ${r.manager || ''}</div>
            </div>
            <span class="badge badge-gray" style="font-size:10px;flex-shrink:0">${status}</span>
        </div>`;
    }).join('');
}

// ── 병목 구간 분석 ────────────────────────────────────────────────
function renderBottleneck(allContracts) {
    const box  = document.getElementById('dashBottleneckBox');
    const list = document.getElementById('bottleneckList');
    if (!box || !list) return;

    const today   = new Date().toISOString().slice(0, 10);
    const delayed = allContracts.filter(r => {
        const due = r.duedate || r.issuedate || '';
        return due && due < today;
    });

    if (!delayed.length) {
        box.style.display = 'none';
        return;
    }
    box.style.display = '';
    list.innerHTML = delayed.map(r => {
        const due = r.duedate || r.issuedate || '-';
        return `<div class="ws-item" style="cursor:default">
            <div style="flex:1; min-width:0">
                <div class="ws-title">${r.client}</div>
                <div class="ws-meta">${r.progress || r.stage || ''} · ${r.manager || ''} · 목표: ${due}</div>
            </div>
            <span class="badge badge-red" style="font-size:10px;flex-shrink:0">⚠ 지연</span>
        </div>`;
    }).join('');
}

// ── 수금/만료 알림 ────────────────────────────────────────────────
function renderBillingAlerts(allContracts, showMoney) {
    const el = document.getElementById('billingAlertList');
    if (!el) return;

    const today   = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const soonDate = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
    const soonStr  = soonDate.toISOString().slice(0, 10);

    const alerts = [];

    allContracts.forEach(r => {
        // 수금 예정일 알림
        (r.billingDates || []).forEach((d, i) => {
            if (!d || d < todayStr || d > soonStr) return;
            const amt = toKRW(Number((r.billing || [])[i] || 0), (r.billingCurrencies || [])[i] || 'KRW');
            if (amt > 0) {
                alerts.push({ type:'수금', date:d, client:r.client, label:`${i+1}차 수금`, amount:amt, color:'var(--med)' });
            }
        });
        // 인증 만료 알림
        if (r.expiredate && r.expiredate >= todayStr && r.expiredate <= soonStr) {
            alerts.push({ type:'만료', date:r.expiredate, client:r.client, label:'인증 만료', amount:0, color:'var(--warn)' });
        }
    });

    alerts.sort((a, b) => a.date > b.date ? 1 : -1);

    if (!alerts.length) {
        el.innerHTML = `<div style="color:var(--text3);font-size:12px;padding:8px 0;grid-column:1/-1">60일 내 수금 예정 및 인증 만료 일정이 없습니다.</div>`;
        return;
    }

    el.innerHTML = alerts.slice(0, 12).map(a => `
        <div style="background:var(--surface);border:1px solid var(--border);border-left:4px solid ${a.color};border-radius:8px;padding:10px 14px;">
            <div style="font-size:11px;color:${a.color};font-weight:700;margin-bottom:4px">
                ${a.type === '수금' ? '💰' : '⚠️'} ${a.label}
            </div>
            <div style="font-size:13px;font-weight:600">${a.client}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">
                ${a.date}${a.amount && showMoney ? ' | ' + fmt(Math.round(a.amount)) + '원' : (a.amount ? ' | ***' : '')}
            </div>
        </div>
    `).join('');
}

// ── 월별 수입 달성률 차트 ─────────────────────────────────────────
function renderDashChart(state, year, contracts, showMoney) {
    const ctx = document.getElementById('chartDashMixed');
    if (!ctx) return;

    if (dashChartInstance) {
        dashChartInstance.destroy();
        dashChartInstance = null;
    }

    const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

    // 월별 실적: billing 날짜 기준 집계
    const monthlyActual = new Array(12).fill(0);
    contracts.forEach(r => {
        (r.billingDates || []).forEach((d, i) => {
            if (!d) return;
            const dt = new Date(d);
            if (dt.getFullYear() !== year) return;
            const m   = dt.getMonth();
            const amt = toKRW(Number((r.billing || [])[i] || 0), (r.billingCurrencies || [])[i] || 'KRW');
            monthlyActual[m] += amt;
        });
    });

    // 월별 계획: revenue_plan 분기 → 월 등분
    const revYear = state.revenue?.[year] || {};
    const medPlan  = revYear.med  || { q1:0, q2:0, q3:0, q4:0 };
    const certPlan = revYear.cert || { q1:0, q2:0, q3:0, q4:0 };
    const qPlan = {
        q1: Number(medPlan.q1 || 0) + Number(certPlan.q1 || 0),
        q2: Number(medPlan.q2 || 0) + Number(certPlan.q2 || 0),
        q3: Number(medPlan.q3 || 0) + Number(certPlan.q3 || 0),
        q4: Number(medPlan.q4 || 0) + Number(certPlan.q4 || 0),
    };
    const monthlyPlan = [
        qPlan.q1/3, qPlan.q1/3, qPlan.q1/3,
        qPlan.q2/3, qPlan.q2/3, qPlan.q2/3,
        qPlan.q3/3, qPlan.q3/3, qPlan.q3/3,
        qPlan.q4/3, qPlan.q4/3, qPlan.q4/3,
    ];

    // 누적 계산
    const cumActual = monthlyActual.map((_, i) => monthlyActual.slice(0, i+1).reduce((s,v) => s+v, 0));
    const cumPlan   = monthlyPlan.map((_, i) => monthlyPlan.slice(0, i+1).reduce((s,v) => s+v, 0));

    // 억원 단위 변환
    const toOk = v => Math.round(v / 100000000 * 10) / 10;
    const zero = new Array(12).fill(0);

    dashChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: MONTHS,
            datasets: [
                {
                    type: 'bar',
                    label: '월별 수입 실적',
                    data: showMoney ? monthlyActual.map(toOk) : zero,
                    backgroundColor: 'rgba(91, 110, 245, 0.75)',
                    borderRadius: 4,
                    yAxisID: 'yBar',
                },
                {
                    type: 'line',
                    label: '누적 실적',
                    data: showMoney ? cumActual.map(toOk) : zero,
                    borderColor: '#19A876',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointBackgroundColor: '#19A876',
                    pointRadius: 3,
                    tension: 0.3,
                    yAxisID: 'yLine',
                },
                {
                    type: 'line',
                    label: '누적 계획',
                    data: showMoney ? cumPlan.map(toOk) : zero,
                    borderColor: '#F5A623',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointBackgroundColor: '#F5A623',
                    pointRadius: 3,
                    tension: 0.3,
                    yAxisID: 'yLine',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { color: '#BAC0CB', font: { size: 12 } } },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}억원`,
                    },
                },
            },
            scales: {
                x: {
                    ticks: { color: '#BAC0CB' },
                    grid:  { color: 'rgba(255,255,255,0.05)' },
                },
                yBar: {
                    type: 'linear',
                    position: 'left',
                    ticks: { color: '#BAC0CB', callback: v => v + '억' },
                    grid:  { color: 'rgba(255,255,255,0.05)' },
                },
                yLine: {
                    type: 'linear',
                    position: 'right',
                    ticks: { color: '#BAC0CB', callback: v => v + '억' },
                    grid:  { display: false },
                },
            },
        },
    });
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.renderDashboard = renderDashboard;
