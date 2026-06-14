// js/views/kpi.js — KPI 현황 뷰 (자격·법정교육, 교육이력)

import { getState, getCurrentYear, getCurrentUser, setKpiTab, getKpiTab,
         getQualData, saveState } from '../core/store.js';

// ── KPI 메인 렌더링 ───────────────────────────────────────────────
export function renderKpi() {
    const el = document.getElementById('kpiYear');
    if (el) el.textContent = getCurrentYear() + '년';
    const tab = getKpiTab();
    if (tab === 'qual') renderKpiQual();
    else if (tab === 'edu') renderKpiEdu();
    else if (tab === 'profit') renderKpiProfit();
}

export function switchKpiTab(tab, el) {
    setKpiTab(tab);
    document.querySelectorAll('[id^="kpi-tab-"]').forEach(b => b.className = 'team-tab');
    if (el) el.className = 'team-tab active-cert';
    const sects = { qual:'kpi-sect-qual', edu:'kpi-sect-edu', profit:'kpi-sect-profit' };
    Object.entries(sects).forEach(([k, id]) => {
        const s = document.getElementById(id);
        if (s) s.style.display = k === tab ? '' : 'none';
    });
    renderKpi();
}

// ── 자격·법정교육 렌더링 ─────────────────────────────────────────
export function renderKpiQual() {
    const y    = getCurrentYear();
    const cont = document.getElementById('qualCards');
    if (!cont) return;
    const QUAL_MASTER = window.QUAL_MASTER || {};
    const state = getState();
    const base  = JSON.parse(JSON.stringify(QUAL_MASTER));
    if (state.qualData) Object.keys(state.qualData).forEach(m => {
        if (state.qualData[m]?.length > 0) base[m] = state.qualData[m];
    });
    Object.assign(getQualData(), base);

    const getEduDone = (m, qn) => (state.kpiEdu || {})[`${m}__${qn}__${y}`] || '';

    cont.innerHTML = Object.keys(base).map(m => {
        const quals  = base[m] || [];
        const legal  = quals.filter(q => q.edu);
        const allDone = legal.every(q => getEduDone(m, q.name));
        const ls     = !legal.length ? null : allDone ? 'done' : 'pending';
        return `<div class="card" style="margin-bottom:20px;border-top:4px solid var(--border2)">
            <div class="card-header">
                <div style="display:flex;align-items:center;gap:12px">
                    <span style="font-weight:900;font-size:16px">${m}</span>
                    <span class="badge badge-gray">${quals.length}개 보유</span>
                </div>
                ${ls==='pending'?`<span class="badge badge-red">⚠ ${y}년 법정교육 미이수</span>`:
                  ls==='done'  ?`<span class="badge badge-green">✓ 이수완료</span>`:'' }
            </div>
            <div class="card-body" style="padding:0"><div class="table-wrap"><table>
                <thead><tr>
                    <th>자격·허가명</th><th>취득일</th><th>발급기관</th>
                    <th>교육주기</th><th>비고 (해당 업무)</th><th>${y}년 이수일</th>
                </tr></thead>
                <tbody>${quals.map((q, qi) => {
                    const done = q.edu ? getEduDone(m, q.name) : '';
                    const canEdit = getCurrentUser() === m || (window.ADMIN_USERS||[]).includes(getCurrentUser());
                    const remarkCell = canEdit
                        ? `<input type="text" value="${q.remark||''}" onchange="updateQualRemark('${m}',${qi},this.value)"
                              style="border:none;background:transparent;color:var(--text1);width:100%;">`
                        : (q.remark || '-');
                    const eduCell = q.edu
                        ? `<input type="date" value="${done}"
                              onchange="setEduDateRecord('${m}','${q.name}','${y}',this.value)"
                              style="border:1px solid ${done?'var(--success)':'var(--border2)'};border-radius:5px;padding:4px;font-size:11px;background:${done?'var(--success-light)':'var(--bg)'};color:#fff;color-scheme:dark;">`
                        : '-';
                    return `<tr>
                        <td><strong>${q.name}</strong></td>
                        <td>${q.date||'-'}</td>
                        <td>${q.org||'-'}</td>
                        <td>${q.edu?q.edu.cycle:'-'}</td>
                        <td>${remarkCell}</td>
                        <td>${eduCell}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table></div></div>
        </div>`;
    }).join('');
}

export function setEduDateRecord(m, qn, y, v) {
    const state = getState();
    if (!state.kpiEdu) state.kpiEdu = {};
    state.kpiEdu[`${m}__${qn}__${y}`] = v;
    saveState();
    renderKpiQual();
}

// ── 교육 이력 렌더링 ──────────────────────────────────────────────
export function renderKpiEdu() {
    const y       = getCurrentYear();
    const state   = getState();
    const memberF = document.getElementById('eduMemberSel')?.value || '';
    const typeF   = document.getElementById('eduTypeSel')?.value   || '';
    const records = (state.eduRecords || []).filter(r => {
        const inY = r.dateStart?.startsWith(String(y));
        return inY && (!memberF || r.member === memberF) && (!typeF || r.type === typeF);
    }).sort((a, b) => (a.dateStart || '').localeCompare(b.dateStart || ''));

    const cont = document.getElementById('eduList');
    if (!cont) return;
    if (!records.length) {
        cont.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;color:var(--text3);padding:32px">${y}년 교육 이력이 없습니다.</div></div>`;
        return;
    }
    const typeColor = { '역량강화':'badge-med', '직무교육':'badge-cert', '보수교육':'badge-amber' };
    const dc = { '높음':'var(--success)', '보통':'var(--warn)', '낮음':'var(--text3)' };
    const ADMIN_USERS = window.ADMIN_USERS || [];
    const cur = getCurrentUser();

    cont.innerHTML = `<div class="card"><div class="card-body" style="padding:0"><div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:var(--bg)">
                <th>#</th><th>유형</th><th>성명</th><th>교육 내용</th>
                <th>교육일</th><th>기관</th><th>수료증</th><th>직무연계</th><th>관리</th>
            </tr></thead>
            <tbody>${records.map((r, i) => {
                const dateRange = r.dateStart + (r.dateEnd && r.dateEnd !== r.dateStart ? ' ~ ' + r.dateEnd : '');
                const canAct = ADMIN_USERS.includes(cur) || r.member === cur;
                return `<tr style="border-bottom:1px solid var(--border)">
                    <td style="text-align:center;color:var(--text3)">${i+1}</td>
                    <td><span class="badge ${typeColor[r.type]||'badge-gray'}">${r.type||'-'}</span></td>
                    <td><strong>${r.member||'-'}</strong></td>
                    <td>${r.content||'-'}</td>
                    <td style="white-space:nowrap">${dateRange||'-'}</td>
                    <td>${r.org||'-'}</td>
                    <td style="text-align:center;font-weight:700;color:${r.cert==='있음'?'var(--success)':'var(--text3)'}">${r.cert==='있음'?'O':'X'}</td>
                    <td>직접: <strong style="color:${dc[r.direct]||'var(--text2)'}">${r.direct||'-'}</strong></td>
                    <td style="white-space:nowrap">
                        ${canAct?`<button class="btn btn-sm" onclick="openEduAddModal('${r.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteEduRecord('${r.id}')">삭제</button>`:'-'}
                    </td>
                </tr>`;
            }).join('')}</tbody>
        </table>
    </div></div></div>`;
}

// ── 개인 수익률 렌더링 ────────────────────────────────────────────
export function renderKpiProfit() {
    const y    = getCurrentYear();
    const state = getState();
    const cur  = getCurrentUser();
    const ADMIN_USERS = window.ADMIN_USERS || [];
    const isAdmin = ADMIN_USERS.includes(cur);
    const { toKRW, fmtM, fmt } = window._utils || {};
    if (!toKRW) return;

    const rows = [...(state.med||[]),...(state.cert||[])].filter(r => r.recordType==='contract' && r.year===y);
    const stats = {};
    rows.forEach(r => {
        const m = r.manager || '미지정';
        if (!stats[m]) stats[m] = { count:0, amt:0, exp:0 };
        stats[m].count++;
        stats[m].amt += toKRW(r.amount, r.amountCurrency);
        stats[m].exp += toKRW(r.expense||0, r.expenseCurrency||'KRW');
    });
    let arr = Object.keys(stats).map(m => ({ name:m, ...stats[m], profit: stats[m].amt-stats[m].exp, margin: stats[m].amt>0?Math.round((stats[m].amt-stats[m].exp)/stats[m].amt*100):0 }));
    if (!isAdmin) arr = arr.filter(s => s.name === cur);
    else arr.sort((a,b) => b.profit - a.profit);

    const cont = document.getElementById('kpi-profit-content');
    if (!cont) return;
    cont.innerHTML = `<div class="card"><div class="card-body" style="padding:0"><div class="table-wrap"><table>
        <thead><tr style="background:var(--bg)"><th>순위</th><th>담당자</th><th>계약건수</th><th>계약총액</th><th>순이익금</th><th>마진율</th></tr></thead>
        <tbody>${arr.map((s,i) => `<tr>
            <td>${i+1}</td><td><strong>${s.name}</strong></td><td>${s.count}건</td>
            <td>${fmtM?.(s.amt)||s.amt}</td>
            <td style="color:var(--success);font-weight:700">${fmtM?.(s.profit)||s.profit}</td>
            <td><span class="margin-badge">${s.margin}%</span></td>
        </tr>`).join('')}</tbody>
    </table></div></div></div>`;
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.renderKpi      = renderKpi;
window.switchKpiTab   = switchKpiTab;
window.renderKpiQual  = renderKpiQual;
window.renderKpiEdu   = renderKpiEdu;
window.renderKpiProfit = renderKpiProfit;
window.setEduDateRecord = setEduDateRecord;
