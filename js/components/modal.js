// js/components/modal.js — 모달 열기/닫기 + 수입내역 그리드 제어

import { getState, setMedEditId, setCertEditId, getMedEditId,
         setMedIsContract, setCertIsContract } from '../core/store.js';
import { toKRW, fmt, fmtM } from '../core/utils.js';

const BILL_LABELS = ['1','2','3','4','5'];

// ── 공통 닫기 ────────────────────────────────────────────────────
export function closeModal(id) {
    document.getElementById('modal-' + id)?.classList.remove('open');
}

// ── 수입 내역 분할 그리드 생성 ────────────────────────────────────
export function buildBillingGrid(contId, totalId, prefix, bArr, bDates, bCur) {
    const el = document.getElementById(contId);
    if (!el) return;
    el.innerHTML = BILL_LABELS.map((l, i) => {
        const cur = (bCur || [])[i] || 'KRW';
        return `<div class="billing-item">
            <label>${l}차 수입</label>
            <select id="${prefix}-bc${i}" onchange="calcBilling('${prefix}','${totalId}')">
                <option value="KRW" ${cur==='KRW'?'selected':''}>KRW</option>
                <option value="RMB" ${cur==='RMB'?'selected':''}>RMB</option>
                <option value="USD" ${cur==='USD'?'selected':''}>USD</option>
            </select>
            <input type="number" value="${(bArr||[])[i]||''}" id="${prefix}-b${i}"
                oninput="calcBilling('${prefix}','${totalId}')">
            <input type="date" id="${prefix}-bd${i}" value="${(bDates||[])[i]||''}">
        </div>`;
    }).join('');
    calcBilling(prefix, totalId);
}

export function calcBilling(p, tId) {
    const amtEl = document.getElementById(p === 'm' ? 'm-amount' : 'c-amount');
    const curEl = document.getElementById(p === 'm' ? 'm-amount-currency' : 'c-amount-currency');
    const tAmt = Number(amtEl?.value || 0);
    const tCur = curEl?.value || 'KRW';
    const tKRW = toKRW(tAmt, tCur);
    let bKRW = 0;
    for (let i = 0; i < 5; i++) {
        bKRW += toKRW(
            Number(document.getElementById(`${p}-b${i}`)?.value || 0),
            document.getElementById(`${p}-bc${i}`)?.value || 'KRW'
        );
    }
    const el = document.getElementById(tId);
    if (el) el.innerHTML =
        `<span>계약총액 <strong>${fmt(tAmt)} ${tCur}</strong></span>` +
        `<span>수입합계 <strong>${fmtM(Math.round(bKRW))}</strong></span>` +
        `<span class="billing-remain ${tKRW-bKRW<=0&&tKRW>0?'ok':'none'}">` +
        `잔액 ${fmtM(Math.round(tKRW - bKRW))}</span>`;
}

export function getBillingValues(p) {
    return Array.from({length:5}, (_,i) => Number(document.getElementById(`${p}-b${i}`)?.value || 0));
}
export function getBillingDates(p) {
    return Array.from({length:5}, (_,i) => document.getElementById(`${p}-bd${i}`)?.value || '');
}
export function getBillingCurrencies(p) {
    return Array.from({length:5}, (_,i) => document.getElementById(`${p}-bc${i}`)?.value || 'KRW');
}

// ── 의료기기팀 모달 ───────────────────────────────────────────────
export function openMedModal(type) {
    setMedEditId(null);
    setMedIsContract(type === 'contract');
    const isContract = type === 'contract';
    document.getElementById('modal-med')?.classList.add('open');
    ['m-client','m-product','m-grade','m-biztype','m-manager','m-startdate','m-duedate',
     'm-status','m-progress','m-amount','m-amount-currency','m-consult-status',
     'm-fail-reason','m-consult-etc','m-quote-date','m-quote-amount','m-quote-file',
     'm-contact-name','m-contact-phone','m-contact-email','m-note','m-renewcycle','m-expiredate']
        .forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    const sw = document.getElementById('m-stage-wrap');
    if (sw) sw.innerHTML = '';
    buildBillingGrid('medBillingGrid','medBillingTotal','m',[],[],[]);
    // 의료기기 '상담'은 계약이 아니므로 계약금액/지출비용/수입분할 섹션 숨김
    document.querySelectorAll('.contract-only-med').forEach(el => {
        el.style.display = isContract ? '' : 'none';
    });
}

export function updateMedStageOptions() {
    const b = document.getElementById('m-biztype')?.value;
    const w = document.getElementById('m-stage-wrap');
    if (!w) return;
    const stages = {
        '인허가': ['자료수집 및 규제검토','기술문서 작성','신청서 제출','시험 검사','심사 및 보완','인허가 완료'],
        'QMS':    ['현황분석','절차서 작성','직원교육','내부감사','인증심사','CGMP 완료'],
    }[b] || [];
    if (!stages.length) {
        w.innerHTML = '<span style="font-size:12px;color:var(--text3)">업무 유형을 먼저 선택하세요</span>';
        return;
    }
    const cur = getMedEditId()
        ? (getState().med.find(r => r.id === getMedEditId())?.stages || [])
        : [];
    w.innerHTML = stages.map(st =>
        `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;padding:6px 12px;border:1px solid var(--border2);border-radius:8px;background:${cur.includes(st)?'var(--med-light)':'var(--surface)'};color:${cur.includes(st)?'var(--med)':'var(--text2)'};font-weight:600;">
            <input type="checkbox" value="${st}" ${cur.includes(st)?'checked':''} style="display:none"
                onchange="this.parentElement.style.background=this.checked?'var(--med-light)':'var(--surface)';this.parentElement.style.color=this.checked?'var(--med)':'var(--text2)'">${st}
        </label>`
    ).join('');
}

export function editMed(id) {
    const r = getState().med.find(x => x.id === id);
    if (!r) return;
    setMedEditId(id);
    setMedIsContract(r.recordType === 'contract');
    document.getElementById('modal-med')?.classList.add('open');
    const fields = {
        'm-client': r.client, 'm-product': r.product, 'm-grade': r.grade,
        'm-biztype': r.biztype, 'm-manager': r.manager, 'm-startdate': r.startdate,
        'm-duedate': r.duedate, 'm-status': r.status || '진행중',
        'm-progress': r.progress, 'm-amount': r.amount || '',
        'm-amount-currency': r.amountCurrency || 'KRW',
        'm-consult-status': r.consultStatus, 'm-fail-reason': r.failReason,
        'm-note': r.note, 'm-quote-amount': r.quoteAmount || '',
        'm-renewcycle': r.renewcycle, 'm-expiredate': r.expiredate,
    };
    Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    });
    updateMedStageOptions();
    (r.stages || []).forEach(st => {
        const cb = document.querySelector(`#m-stage-wrap input[value="${st}"]`);
        if (cb) { cb.checked = true; cb.parentElement.style.background = 'var(--med-light)'; cb.parentElement.style.color = 'var(--med)'; }
    });
    buildBillingGrid('medBillingGrid','medBillingTotal','m', r.billing, r.billingDates, r.billingCurrencies);
    document.querySelectorAll('.contract-only-med').forEach(el => {
        el.style.display = r.recordType === 'contract' ? '' : 'none';
    });
}

// ── 인증팀 모달 ──────────────────────────────────────────────────
export function openCertModal(type) {
    setCertEditId(null);
    setCertIsContract(type === 'contract');
    const isContract = type === 'contract';
    document.getElementById('modal-cert')?.classList.add('open');
    ['c-client','c-certtype','c-certtype-etc','c-manager','c-amount','c-amount-currency',
     'c-contractdate','c-stage','c-issuedate','c-contracted','c-date','c-fail-reason',
     'c-quote-date','c-quote-amount','c-quote-file','c-contact-name','c-contact-phone',
     'c-contact-email','c-etc-memo','c-note','c-renewcycle','c-expiredate']
        .forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    buildBillingGrid('certBillingGrid','certBillingTotal','c',[],[],[]);
    const cf = document.getElementById('certContractFields');
    const cs = document.getElementById('certConsultSection');
    if (cf) cf.style.display = isContract ? 'contents' : 'none';
    if (cs) cs.style.display = isContract ? 'none' : 'contents';
}

export function toggleCertTypeEtc() {
    const v = document.getElementById('c-certtype')?.value;
    const w = document.getElementById('c-certtype-etc-wrap');
    if (w) w.style.display = v === '기타' ? '' : 'none';
}

export function editCert(id) {
    const r = getState().cert.find(x => x.id === id);
    if (!r) return;
    setCertEditId(id);
    setCertIsContract(r.recordType === 'contract');
    document.getElementById('modal-cert')?.classList.add('open');
    const fields = {
        'c-client': r.client, 'c-certtype': r.certtype, 'c-manager': r.manager,
        'c-amount': r.amount || '', 'c-amount-currency': r.amountCurrency || 'KRW',
        'c-contractdate': r.contractdate, 'c-stage': r.stage, 'c-issuedate': r.issuedate,
        'c-contracted': r.contracted, 'c-date': r.date, 'c-fail-reason': r.failReason,
        'c-note': r.note, 'c-etc-memo': r.etcMemo, 'c-quote-amount': r.quoteAmount || '',
        'c-renewcycle': r.renewcycle, 'c-expiredate': r.expiredate,
    };
    Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    });
    toggleCertTypeEtc();
    buildBillingGrid('certBillingGrid','certBillingTotal','c', r.billing, r.billingDates, r.billingCurrencies);
    const cf = document.getElementById('certContractFields');
    const cs = document.getElementById('certConsultSection');
    if (cf) cf.style.display = r.recordType === 'contract' ? 'contents' : 'none';
    if (cs) cs.style.display = r.recordType === 'contract' ? 'none' : 'contents';
}

// ── 기타 모달 ─────────────────────────────────────────────────────
export function openSettings() {
    document.getElementById('modal-settings')?.classList.add('open');
}
export function openQualModal() {
    document.getElementById('modal-qual')?.classList.add('open');
}
export function openEduAddModal(id) {
    document.getElementById('modal-edu-add')?.classList.add('open');
}
export function openTaskModal(type) {
    document.getElementById('modal-task')?.classList.add('open');
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.closeModal = closeModal;
window.buildBillingGrid = buildBillingGrid;
window.calcBilling = calcBilling;
window.openMedModal = openMedModal;
window.openCertModal = openCertModal;
window.editMed = editMed;
window.editCert = editCert;
window.updateMedStageOptions = updateMedStageOptions;
window.toggleCertTypeEtc = toggleCertTypeEtc;
window.openSettings = openSettings;
window.openQualModal = openQualModal;
window.openEduAddModal = openEduAddModal;
window.openTaskModal = openTaskModal;
