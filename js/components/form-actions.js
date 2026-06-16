// js/components/form-actions.js — 폼 저장/삭제/전환 로직 전담

import { getState, getCurrentYear, getCurrentUser, getMedEditId, getCertEditId,
         getMedIsContract, getCertIsContract, setMedEditId, setCertEditId,
         getEditingTaskId, setEditingTaskId, getCompletingTaskId,
         getEditingEduId, setEditingEduId, saveState, getQualData } from '../core/store.js';
import { uid, sanitize, toKRW, fmt, fmtM, quarter } from '../core/utils.js';
import { saveMedRecord, saveCertRecord, deleteMedRecord, deleteCertRecord } from '../core/api.js';
import { getBillingValues, getBillingDates, getBillingCurrencies } from './modal.js';

// ── 의료기기팀 저장 ───────────────────────────────────────────────
export async function saveMed() {
    const clientEl = document.getElementById('m-client');
    if (!clientEl?.value?.trim()) { alert('업체명을 입력하세요.'); return; }

    const state  = getState();
    const editId = getMedEditId();
    const isContract = getMedIsContract();
    const id     = editId || uid();
    const y      = editId
        ? (state.med.find(x => x.id === editId)?.year || getCurrentYear())
        : getCurrentYear();
    const startdate = document.getElementById('m-startdate')?.value || '';

    const record = {
        id, year: y,
        recordType: isContract ? 'contract' : 'consult',
        client:       sanitize(document.getElementById('m-client')?.value || ''),
        product:      sanitize(document.getElementById('m-product')?.value || ''),
        grade:        document.getElementById('m-grade')?.value || '',
        biztype:      document.getElementById('m-biztype')?.value || '',
        stages:       Array.from(document.querySelectorAll('#m-stage-wrap input:checked')).map(x => x.value),
        stage:        Array.from(document.querySelectorAll('#m-stage-wrap input:checked')).map(x => x.value).join(', '),
        progress:     document.getElementById('m-progress')?.value || '',
        manager:      document.getElementById('m-manager')?.value || '',
        startdate, duedate: document.getElementById('m-duedate')?.value || '',
        status:       document.getElementById('m-status')?.value || '진행중',
        amount:       isContract ? Number(document.getElementById('m-amount')?.value || 0) : 0,
        amountCurrency: document.getElementById('m-amount-currency')?.value || 'KRW',
        billing:        isContract ? getBillingValues('m') : [0,0,0,0,0],
        billingDates:   isContract ? getBillingDates('m')  : ['','','','',''],
        billingCurrencies: isContract ? getBillingCurrencies('m') : ['KRW','KRW','KRW','KRW','KRW'],
        renewcycle:   document.getElementById('m-renewcycle')?.value || '',
        expiredate:   document.getElementById('m-expiredate')?.value || '',
        consultStatus: document.getElementById('m-consult-status')?.value || '',
        failReason:   document.getElementById('m-fail-reason')?.value || '',
        note:         sanitize(document.getElementById('m-note')?.value || ''),
        contactName:  sanitize(document.getElementById('m-contact-name')?.value || ''),
        contactPhone: sanitize(document.getElementById('m-contact-phone')?.value || ''),
        contactEmail: sanitize(document.getElementById('m-contact-email')?.value || ''),
        quoteDate:    document.getElementById('m-quote-date')?.value || '',
        quoteAmount:  Number(document.getElementById('m-quote-amount')?.value || 0),
        quoteFile:    sanitize(document.getElementById('m-quote-file')?.value || ''),
        expense:      Number(String(document.getElementById('m-expense')?.value || '0').replace(/,/g,'')),
        q: quarter(startdate) || 1,
    };

    if (editId) {
        const i = state.med.findIndex(x => x.id === editId);
        if (i >= 0) state.med[i] = record; else state.med.push(record);
    } else {
        state.med.push(record);
    }

    await saveMedRecord(record);
    window.closeModal?.('med');
    isContract ? window.renderMedContract?.() : window.renderMedConsult?.();
}

export async function deleteMed(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    const state = getState();
    state.med = state.med.filter(x => x.id !== id);
    await deleteMedRecord(id);
    window.renderMedContract?.();
    window.renderMedConsult?.();
}

// ── 인증팀 저장 ───────────────────────────────────────────────────
export async function saveCert() {
    const clientEl = document.getElementById('c-client');
    if (!clientEl?.value?.trim()) { alert('업체명을 입력하세요.'); return; }

    const state  = getState();
    const editId = getCertEditId();
    const isContract = getCertIsContract();
    const id     = editId || uid();
    const y      = editId
        ? (state.cert.find(x => x.id === editId)?.year || getCurrentYear())
        : getCurrentYear();
    const certtype = document.getElementById('c-certtype')?.value || '';
    const certtypeRaw = certtype === '기타'
        ? document.getElementById('c-certtype-etc')?.value || certtype
        : certtype;
    const contractdate = document.getElementById('c-contractdate')?.value || '';
    const consultdate  = document.getElementById('c-date')?.value || '';

    const record = {
        id, year: y,
        recordType: isContract ? 'contract' : 'consult',
        client:     sanitize(clientEl.value),
        certtype, certtypeRaw,
        stdNo:      document.getElementById('c-std-no')?.value || '',
        product:    document.getElementById('c-product')?.value || '',
        manager:    document.getElementById('c-manager')?.value || '',
        contracted: isContract ? '계약완료' : (document.getElementById('c-contracted')?.value || '미계약'),
        amount:     isContract ? Number(document.getElementById('c-amount')?.value || 0) : 0,
        amountCurrency: document.getElementById('c-amount-currency')?.value || 'KRW',
        contractdate, date: consultdate,
        stage:      isContract ? (document.getElementById('c-stage')?.value || '') : '',
        issuedate:  document.getElementById('c-issuedate')?.value || '',
        billing:        isContract ? getBillingValues('c') : [0,0,0,0,0],
        billingDates:   isContract ? getBillingDates('c')  : ['','','','',''],
        billingCurrencies: isContract ? getBillingCurrencies('c') : ['KRW','KRW','KRW','KRW','KRW'],
        renewcycle: document.getElementById('c-renewcycle')?.value || '',
        expiredate: document.getElementById('c-expiredate')?.value || '',
        failReason: document.getElementById('c-fail-reason')?.value || '',
        note:       sanitize(document.getElementById('c-note')?.value || ''),
        etcMemo:    sanitize(document.getElementById('c-etc-memo')?.value || ''),
        contactName:  sanitize(document.getElementById('c-contact-name')?.value || ''),
        contactPhone: sanitize(document.getElementById('c-contact-phone')?.value || ''),
        contactEmail: sanitize(document.getElementById('c-contact-email')?.value || ''),
        quoteDate:  document.getElementById('c-quote-date')?.value || '',
        quoteAmount: Number(document.getElementById('c-quote-amount')?.value || 0),
        quoteFile:  sanitize(document.getElementById('c-quote-file')?.value || ''),
        expense:    Number(String(document.getElementById('c-expense')?.value || '0').replace(/,/g,'')),
        q: quarter(contractdate || consultdate) || 1,
    };

    if (editId) {
        const i = state.cert.findIndex(x => x.id === editId);
        if (i >= 0) state.cert[i] = record; else state.cert.push(record);
    } else {
        state.cert.push(record);
    }

    await saveCertRecord(record);
    window.closeModal?.('cert');
    isContract ? window.renderCertContract?.() : window.renderCertConsult?.();
}

export async function deleteCert(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    const state = getState();
    state.cert = state.cert.filter(x => x.id !== id);
    await deleteCertRecord(id);
    window.renderCertContract?.();
    window.renderCertConsult?.();
}

// ── 상담 → 계약 전환 ─────────────────────────────────────────────
export async function convertToContract(team, id) {
    if (!confirm('해당 상담 건을 계약으로 전환하시겠습니까?')) return;
    const state  = getState();
    const record = state[team].find(x => x.id === id);
    if (!record) return;
    record.recordType = 'contract';
    const today = new Date().toISOString().slice(0, 10);
    if (team === 'med') {
        record.status = '진행중'; record.startdate = today; record.consultStatus = '계약완료';
        await saveMedRecord(record);
        window.renderMedConsult?.(); window.renderMedContract?.();
    } else {
        record.contracted = '계약완료'; record.contractdate = today; record.stage = '신청서 작성';
        await saveCertRecord(record);
        window.renderCertConsult?.(); window.renderCertContract?.();
    }
    alert('✅ 계약으로 전환되었습니다.');
}

// ── 업무지시 저장 ────────────────────────────────────────────────
export async function saveTask() {
    const to      = document.getElementById('task-to')?.value;
    const content = document.getElementById('task-content')?.value?.trim();
    if (!to || !content) { alert('담당자와 업무 내용을 입력하세요.'); return; }

    const state  = getState();
    const editId = getEditingTaskId();
    if (editId) {
        const t = state.tasks.find(x => x.id === editId);
        if (t) {
            t.team     = document.getElementById('task-team')?.value || '공통';
            t.priority = document.getElementById('task-priority')?.value || '일반';
            t.to = to; t.due = document.getElementById('task-due')?.value || '';
            t.content = sanitize(content);
        }
    } else {
        if (!state.tasks) state.tasks = [];
        state.tasks.push({
            id: uid(),
            type:     document.getElementById('task-type-hidden')?.value || 'order',
            team:     document.getElementById('task-team')?.value || '공통',
            priority: document.getElementById('task-priority')?.value || '일반',
            from:     getCurrentUser(),
            to, date: document.getElementById('task-date')?.value || new Date().toISOString().slice(0,10),
            due:      document.getElementById('task-due')?.value || '',
            content:  sanitize(content),
            completedDate: '', completeNote: '', confirmedDate: '',
        });
    }
    setEditingTaskId(null);
    window.closeModal?.('task');
    window.renderTasks?.();
    await saveState().catch(e => console.error('task save:', e));
}

export async function confirmTaskComplete() {
    const id    = getCompletingTaskId();
    const state = getState();
    const t     = state.tasks?.find(x => x.id === id);
    if (!t) return;
    t.completedDate = document.getElementById('task-complete-date')?.value || '';
    t.completeNote  = document.getElementById('task-complete-note')?.value || '';
    await saveState();
    window.closeModal?.('task-complete');
    window.renderTasks?.();
}

// ── 교육 이력 저장 ────────────────────────────────────────────────
export async function saveEduRecord() {
    const member = document.getElementById('edu-member')?.value;
    const type   = document.getElementById('edu-type')?.value;
    if (!member || !type) { alert('구성원과 교육 유형을 선택하세요.'); return; }

    const state  = getState();
    const editId = getEditingEduId();
    const r = {
        id:        editId || uid(),
        member, type,
        dateStart: document.getElementById('edu-date-start')?.value || '',
        dateEnd:   document.getElementById('edu-date-end')?.value || '',
        org:       sanitize(document.getElementById('edu-org')?.value || ''),
        content:   sanitize(document.getElementById('edu-content')?.value || ''),
        cert:      document.getElementById('edu-cert')?.value || '있음',
        license:   document.getElementById('edu-license')?.value || '해당없음',
        licenseName: sanitize(document.getElementById('edu-license-name')?.value || ''),
        direct:    document.getElementById('edu-direct')?.value || '높음',
        indirect:  document.getElementById('edu-indirect')?.value || '높음',
        note:      sanitize(document.getElementById('edu-note')?.value || ''),
    };
    if (!state.eduRecords) state.eduRecords = [];
    if (editId) {
        const i = state.eduRecords.findIndex(x => x.id === editId);
        if (i >= 0) state.eduRecords[i] = r; else state.eduRecords.push(r);
    } else {
        state.eduRecords.push(r);
    }
    setEditingEduId(null);
    await saveState();
    window.closeModal?.('edu-add');
    window.renderKpiEdu?.();
}

export async function deleteEduRecord(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    const state = getState();
    state.eduRecords = state.eduRecords.filter(x => x.id !== id);
    await saveState();
    window.renderKpiEdu?.();
}

// ── 자격 관리 ─────────────────────────────────────────────────────
export function verifyQualAdmin() {
    const pw  = document.getElementById('qual-admin-pw')?.value;
    const msg = document.getElementById('qual-pw-msg');
    if (pw === getState().pw) {
        const area = document.getElementById('qual-edit-area');
        if (area) area.style.display = '';
        if (msg) msg.textContent = '';
    } else {
        if (msg) msg.textContent = '비밀번호가 올바르지 않습니다.';
    }
}

export function loadQualMember() {
    const m    = document.getElementById('qual-member-sel')?.value;
    const list = document.getElementById('qual-member-list');
    if (!m || !list) return;
    const quals = getQualData()[m] || [];
    list.innerHTML = quals.length
        ? quals.map((q, i) =>
            `<div style="margin-bottom:6px;padding:8px 12px;background:var(--surface);border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;font-weight:600">${q.name}</span>
                <button class="btn btn-sm btn-danger" onclick="removeQualItem('${m}',${i})">삭제</button>
            </div>`).join('')
        : '<div style="color:var(--text3);font-size:12px;padding:8px 0">등록된 자격 없음</div>';
}

export function addQualItem() {
    const m = document.getElementById('qual-member-sel')?.value;
    if (!m) { alert('구성원을 먼저 선택하세요.'); return; }
    const qualData = getQualData();
    if (!qualData[m]) qualData[m] = [];
    qualData[m].push({ name: '새 자격 (수정요망)', date: '', org: '', edu: null, remark: '' });
    loadQualMember();
}

export function removeQualItem(m, i) {
    if (!confirm('삭제하시겠습니까?')) return;
    const qualData = getQualData();
    qualData[m].splice(i, 1);
    loadQualMember();
}

export async function saveQualData() {
    const state    = getState();
    state.qualData = getQualData();
    await saveState();
    alert('저장되었습니다.');
    window.closeModal?.('qual');
    window.renderKpiQual?.();
}

export function updateQualRemark(member, idx, value) {
    const qualData = getQualData();
    if (!qualData[member]?.[idx]) return;
    qualData[member][idx].remark = value;
    const state = getState();
    if (!state.qualData) state.qualData = {};
    state.qualData[member] = qualData[member];
    saveState();
}

// ── 수입 목표 업데이트 ────────────────────────────────────────────
export async function updateTarget(team, q, val) {
    const { ensureRevYear, getCurrentYear, getState, saveState } = window._store || {};
    const y = getCurrentYear?.() || new Date().getFullYear();
    const state = getState?.();
    if (!state) return;
    ensureRevYear?.(y);
    if (team === 'total') {
        const n = Math.round(Number(val) || 0);
        state.revenue[y].med[q]  = Math.round(n / 2);
        state.revenue[y].cert[q] = Math.round(n / 2);
    } else {
        state.revenue[y][team][q] = Math.round(Number(val) || 0);
    }
    await (window._store?.saveState?.() || saveState?.());
    window.renderRevenue?.();
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.saveMed          = saveMed;
window.deleteMed        = deleteMed;
window.saveCert         = saveCert;
window.deleteCert       = deleteCert;
window.convertToContract = convertToContract;
window.saveTask         = saveTask;
window.confirmTaskComplete = confirmTaskComplete;
window.saveEduRecord    = saveEduRecord;
window.deleteEduRecord  = deleteEduRecord;
window.verifyQualAdmin  = verifyQualAdmin;
window.loadQualMember   = loadQualMember;
window.addQualItem      = addQualItem;
window.removeQualItem   = removeQualItem;
window.saveQualData     = saveQualData;
window.updateQualRemark = updateQualRemark;
window.updateTarget     = updateTarget;
// ── 지출 비용 계산 ────────────────────────────────────────────────
export function calcTotalExpense(team) {
    const p = team === 'med' ? 'm' : 'c';
    const audit = Number(document.getElementById(`${p}-exp-audit`)?.value || 0);
    const test  = Number(document.getElementById(`${p}-exp-test`)?.value  || 0);
    const trip  = Number(document.getElementById(`${p}-exp-trip`)?.value  || 0);

    // 동적으로 추가된 기타 비용 합산
    const dynamicWrap = document.getElementById(`${p}-dynamic-expense-wrap`);
    let dynamic = 0;
    if (dynamicWrap) {
        dynamicWrap.querySelectorAll('input[type=number]').forEach(el => {
            dynamic += Number(el.value || 0);
        });
    }

    const total = audit + test + trip + dynamic;
    const totalEl = document.getElementById(`${p}-expense`);
    if (totalEl) {
    totalEl.type = 'text';
    totalEl.value = total.toLocaleString();
}
}

export function addDynamicExpense(team) {
    const p = team === 'med' ? 'm' : 'c';
    const wrap = document.getElementById(`${p}-dynamic-expense-wrap`);
    if (!wrap) return;
    const idx = wrap.children.length;
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px;';
    div.innerHTML = `
        <input class="form-input" type="text" placeholder="항목명" style="flex:1;">
        <input class="form-input" type="number" placeholder="금액" style="width:140px;"
            oninput="calcTotalExpense('${team}')">
        <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove();calcTotalExpense('${team}')">✕</button>
    `;
    wrap.appendChild(div);
}
window.calcTotalExpense = calcTotalExpense;
window.addDynamicExpense = addDynamicExpense;
