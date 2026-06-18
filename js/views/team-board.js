// js/views/team-board.js

import { getState, getCurrentYear, getCurrentUser } from '../core/store.js';
import { fmt, tt, sanitize } from '../core/utils.js';

const getBody = id => {
    const t = document.getElementById(id);
    return t?.tagName === 'TABLE' ? (t.querySelector('tbody') || t) : t;
};

// ── 완료 자동판정 헬퍼 ────────────────────────────────────────────
// 제품환경인증팀 계약
export function renderCertContract() {
    const tbody = getBody('certContractTable');
    if (!tbody) return;
    const state = getState();
    const year = getCurrentYear();
    const data = (state.cert || []).filter(x => x.year === year && x.recordType === 'contract' && !isCompleted(x));
    const done = (state.cert || []).filter(x => x.year === year && x.recordType === 'contract' && isCompleted(x));

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
    } else {
        tbody.innerHTML = data.map((r, i) => {
            const amt  = fmt(r.amount || 0);
            const paid = fmt(r.billing ? r.billing.reduce((a,b)=>a+Number(b||0),0) : 0);
            return `<tr>
                <td>${i+1}</td>
                <td class="client-name">${sanitize(r.client)}</td>
                <td>${sanitize(r.certtype||'')}</td>
                <td>${sanitize(r.etcMemo||r.certtypeRaw||'')}</td>
                <td>${sanitize(r.manager||'')}</td>
                <td>${sanitize(r.contractdate||'')}</td>
                <td>${sanitize(r.issuedate||'')}</td>
                <td>${amt} ${r.amountCurrency||'KRW'}</td>
                <td>${paid}</td>
                <td style="color:${Number(r.amount||0)-Number((r.billing||[]).reduce((a,b)=>a+Number(b||0),0))>0?'var(--warn)':'var(--text3)'}">
                    ${fmt(Math.max(0, Number(r.amount||0)-Number((r.billing||[]).reduce((a,b)=>a+Number(b||0),0))))}
                </td>
                <td>${sanitize(r.stage||'')}</td>
                <td>
                    <button class="btn btn-sm" onclick="editCert('${r.id}')">${tt('수정','修改')}</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCert('${r.id}')">${tt('삭제','删除')}</button>
                </td>
            </tr>`;
        }).join('');
    }

    const doneBody = getBody('certContractDoneTable');
    if (doneBody) {
        doneBody.innerHTML = !done.length
            ? `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text3)">없음</td></tr>`
            : done.map((r, i) => {
                const amt  = fmt(r.amount || 0);
                const paid = fmt(r.billing ? r.billing.reduce((a,b)=>a+Number(b||0),0) : 0);
                return `<tr>
                    <td>${i+1}</td>
                    <td class="client-name">${sanitize(r.client)}</td>
                    <td>${sanitize(r.certtype||'')}</td>
                    <td>${sanitize(r.etcMemo||r.certtypeRaw||'')}</td>
                    <td>${sanitize(r.manager||'')}</td>
                    <td>${sanitize(r.contractdate||'')}</td>
                    <td>${sanitize(r.issuedate||'')}</td>
                    <td>${amt} ${r.amountCurrency||'KRW'}</td>
                    <td>${paid}</td>
                    <td>${sanitize(r.stage||'')}</td>
                    <td>
                        <button class="btn btn-sm" onclick="editCert('${r.id}')">${tt('수정','修改')}</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteCert('${r.id}')">${tt('삭제','删除')}</button>
                    </td>
                </tr>`;
            }).join('');
    }
}

function getCompleteDate(r) {
    const dates = (r.billingDates || []).filter(d => d);
    if (!dates.length) return '-';
    return dates.sort().reverse()[0];
}

// 의료기기팀 계약
export function renderMedContract() {
    const tbody = getBody('medContractTable');
    if (!tbody) return;
    const state = getState();
    const year = getCurrentYear();
    const data = (state.med || []).filter(x => x.year === year && x.recordType === 'contract' && !isCompleted(x));
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:20px;color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map((r, i) => {
        const amt = fmt(r.amount || 0);
        const paid = fmt(r.billing ? r.billing.reduce((a,b)=>a+Number(b||0),0) : 0);
        return `<tr>
            <td>${i+1}</td>
            <td class="client-name">${sanitize(r.client)}</td>
            <td>${sanitize(r.product||'')}</td>
            <td>${sanitize(r.biztype||'')}</td>
            <td>${sanitize(r.manager||'')}</td>
            <td>${sanitize(r.startdate||'')}</td>
            <td>${sanitize(r.duedate||'')}</td>
            <td>${amt} ${r.amountCurrency||'KRW'}</td>
            <td>${paid}</td>
            <td style="color:${Number(r.amount||0)-Number((r.billing||[]).reduce((a,b)=>a+Number(b||0),0))>0?'var(--warn)':'var(--text3)'}">
                ${fmt(Math.max(0, Number(r.amount||0)-Number((r.billing||[]).reduce((a,b)=>a+Number(b||0),0))))}
            </td>
            <td>${sanitize(r.stage||'')}</td>            <td><span class="badge ${r.status==='완료'?'badge-success':'badge-med'}">${sanitize(r.status||'')}</span></td>
            <td>
                <button class="btn btn-sm" onclick="editMed('${r.id}')">${tt('수정','修改')}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteMed('${r.id}')">${tt('삭제','删除')}</button>
            </td>
        </tr>`;
    }).join('');
}

// 의료기기팀 상담
export function renderMedConsult() {
    const tbody = getBody('medConsultTable');
    if (!tbody) return;
    const state = getState();
    const year = getCurrentYear();
    const data = (state.med || []).filter(x => x.year === year && x.recordType === 'consult' && x.consultStatus !== '계약보류');
    const archive = (state.med || []).filter(x => x.year === year && x.recordType === 'consult' && x.consultStatus === '계약보류');

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
    } else {
        tbody.innerHTML = data.map((r, i) => `<tr>
            <td>${i+1}</td>
            <td class="client-name">${sanitize(r.client)}</td>
            <td>${sanitize(r.grade||'')}</td>
            <td>${sanitize(r.product||'')}</td>
            <td>${sanitize(r.biztype||'')}</td>
            <td>${sanitize(r.manager||'')}</td>
            <td>${sanitize(r.startdate||'')}</td>
            <td><span class="badge badge-med">${sanitize(r.consultStatus||'')}</span></td>
            <td>${sanitize(r.quoteDate||'')}</td>
            <td>${sanitize(r.note||'')}</td>
            <td>
                <button class="btn btn-sm" onclick="editMed('${r.id}')">${tt('수정','修改')}</button>
                <button class="btn btn-sm btn-success" onclick="convertToContract('med','${r.id}')">${tt('계약전환','转为合同')}</button>
            </td>
        </tr>`).join('');
    }

    const archiveBody = getBody('medConsultArchiveTable');
    if (archiveBody) {
        archiveBody.innerHTML = !archive.length
            ? `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text3)">없음</td></tr>`
            : archive.map((r, i) => `<tr>
                <td>${i+1}</td>
                <td class="client-name">${sanitize(r.client)}</td>
                <td>${sanitize(r.grade||'')}</td>
                <td>${sanitize(r.product||'')}</td>
                <td>${sanitize(r.biztype||'')}</td>
                <td>${sanitize(r.manager||'')}</td>
                <td>${sanitize(r.startdate||'')}</td>
                <td><span class="badge badge-med">${sanitize(r.consultStatus||'')}</span></td>
                <td>${sanitize(r.quoteDate||'')}</td>
                <td>${sanitize(r.failReason||'')}</td>
                <td>
                    <button class="btn btn-sm" onclick="editMed('${r.id}')">${tt('수정','修改')}</button>
                </td>
            </tr>`).join('');
    }
}

// 제품환경인증팀 계약
// 제품환경인증팀 계약
export function renderCertContract() {
    const tbody = getBody('certContractTable');
    if (!tbody) return;
    const state = getState();
    const year = getCurrentYear();
    const data = (state.cert || []).filter(x => x.year === year && x.recordType === 'contract' && !isCompleted(x));
    const done = (state.cert || []).filter(x => x.year === year && x.recordType === 'contract' && isCompleted(x));

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
    } else {
        tbody.innerHTML = data.map((r, i) => {
            const amt  = fmt(r.amount || 0);
            const paid = fmt(r.billing ? r.billing.reduce((a,b)=>a+Number(b||0),0) : 0);
            return `<tr>
                <td>${i+1}</td>
                <td class="client-name">${sanitize(r.client)}</td>
                <td>${sanitize(r.certtype||'')}</td>
                <td>${sanitize(r.etcMemo||r.certtypeRaw||'')}</td>
                <td>${sanitize(r.manager||'')}</td>
                <td>${sanitize(r.contractdate||'')}</td>
                <td>${sanitize(r.issuedate||'')}</td>
                <td>${amt} ${r.amountCurrency||'KRW'}</td>
                <td>${paid}</td>
                <td style="color:${Number(r.amount||0)-Number((r.billing||[]).reduce((a,b)=>a+Number(b||0),0))>0?'var(--warn)':'var(--text3)'}">
                    ${fmt(Math.max(0, Number(r.amount||0)-Number((r.billing||[]).reduce((a,b)=>a+Number(b||0),0))))}
                </td>
                <td>${sanitize(r.stage||'')}</td>
                <td>
                    <button class="btn btn-sm" onclick="editCert('${r.id}')">${tt('수정','修改')}</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCert('${r.id}')">${tt('삭제','删除')}</button>
                </td>
            </tr>`;
        }).join('');
    }

    const doneBody = getBody('certContractDoneTable');
    if (doneBody) {
        doneBody.innerHTML = !done.length
            ? `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text3)">없음</td></tr>`
            : done.map((r, i) => {
                const amt  = fmt(r.amount || 0);
                const paid = fmt(r.billing ? r.billing.reduce((a,b)=>a+Number(b||0),0) : 0);
                return `<tr>
                    <td>${i+1}</td>
                    <td class="client-name">${sanitize(r.client)}</td>
                    <td>${sanitize(r.certtype||'')}</td>
                    <td>${sanitize(r.etcMemo||r.certtypeRaw||'')}</td>
                    <td>${sanitize(r.manager||'')}</td>
                    <td>${sanitize(r.contractdate||'')}</td>
                    <td>${sanitize(r.issuedate||'')}</td>
                    <td>${amt} ${r.amountCurrency||'KRW'}</td>
                    <td>${paid}</td>
                    <td>${sanitize(r.stage||'')}</td>
                    <td>
                        <button class="btn btn-sm" onclick="editCert('${r.id}')">${tt('수정','修改')}</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteCert('${r.id}')">${tt('삭제','删除')}</button>
                    </td>
                </tr>`;
            }).join('');
    }
}
    const tbody = getBody('certContractTable');
    if (!tbody) return;
    const state = getState();
    const year = getCurrentYear();
    const data = (state.cert || []).filter(x => x.year === year && x.recordType === 'contract' && !isCompleted(x));
    const done = (state.cert || []).filter(x => x.year === year && x.recordType === 'contract' && isCompleted(x));

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
    } else {
        tbody.innerHTML = data.map((r, i) => {
            const amt = fmt(r.amount || 0);
            const paid = fmt(r.billing ? r.billing.reduce((a,b)=>a+Number(b||0),0) : 0);
            return `<tr>
                <td>${i+1}</td>
                <td class="client-name">${sanitize(r.client)}</td>
                <td>${sanitize(r.certtype||'')}</td>
                <td>${sanitize(r.product||'')}</td>
                <td>${sanitize(r.manager||'')}</td>
                <td>${sanitize(r.contractdate||'')}</td>
                <td>${sanitize(r.issuedate||'')}</td>
                <td>${amt} ${r.amountCurrency||'KRW'}</td>
                <td>${paid}</td>
                <td style="color:${Number(r.amount||0)-Number((r.billing||[]).reduce((a,b)=>a+Number(b||0),0))>0?'var(--warn)':'var(--text3)'}">
                    ${fmt(Math.max(0, Number(r.amount||0)-Number((r.billing||[]).reduce((a,b)=>a+Number(b||0),0))))}
                </td>
                <td>${sanitize(r.stage||'')}</td>
                <td>
                    <button class="btn btn-sm" onclick="editCert('${r.id}')">${tt('수정','修改')}</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCert('${r.id}')">${tt('삭제','删除')}</button>
                </td>
            </tr>`;
        }).join('');
    }

    const doneBody = getBody('certContractDoneTable');
    if (doneBody) {
        doneBody.innerHTML = !done.length
            ? `<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--text3)">없음</td></tr>`
            : done.map((r, i) => {
                const amt = fmt(r.amount || 0);
                const paid = fmt(r.billing ? r.billing.reduce((a,b)=>a+Number(b||0),0) : 0);
                return `<tr>
                    <td>${i+1}</td>
                    <td class="client-name">${sanitize(r.client)}</td>
                    <td>${sanitize(r.certtype||'')}</td>
                    <td>${sanitize(r.manager||'')}</td>
                    <td>${sanitize(r.contractdate||'')}</td>
                    <td>${sanitize(r.issuedate||'')}</td>
                    <td>${amt} ${r.amountCurrency||'KRW'}</td>
                    <td>${paid}</td>
                    <td>${sanitize(r.stage||'')}</td>
                    <td>
                        <button class="btn btn-sm" onclick="editCert('${r.id}')">${tt('수정','修改')}</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteCert('${r.id}')">${tt('삭제','删除')}</button>
                    </td>
                </tr>`;
            }).join('');
    }
}

// 제품환경인증팀 상담
export function renderCertConsult() {
    const tbody = getBody('certConsultTable');
    if (!tbody) return;
    const state = getState();
    const year = getCurrentYear();
    const data = (state.cert || []).filter(x => x.year === year && x.recordType === 'consult' && x.contracted !== '계약보류');
    const archive = (state.cert || []).filter(x => x.year === year && x.recordType === 'consult' && x.contracted === '계약보류');

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
    } else {
        tbody.innerHTML = data.map((r, i) => `<tr>
            <td>${i+1}</td>
            <td class="client-name">${sanitize(r.client)}</td>
            <td>${sanitize(r.certtype||'')}</td>
            <td>${sanitize(r.manager||'')}</td>
            <td>${sanitize(r.date||'')}</td>
            <td><span class="badge badge-cert">${sanitize(r.contracted||'')}</span></td>
            <td>${sanitize(r.quoteDate||'')}</td>
            <td>${sanitize(r.note||'')}</td>
            <td>
                <button class="btn btn-sm" onclick="editCert('${r.id}')">${tt('수정','修改')}</button>
                <button class="btn btn-sm btn-success" onclick="convertToContract('cert','${r.id}')">${tt('계약전환','转为合同')}</button>
            </td>
        </tr>`).join('');
    }

    const archiveBody = getBody('certConsultArchiveTable');
    if (archiveBody) {
        archiveBody.innerHTML = !archive.length
            ? `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">없음</td></tr>`
            : archive.map((r, i) => `<tr>
                <td>${i+1}</td>
                <td class="client-name">${sanitize(r.client)}</td>
                <td>${sanitize(r.certtype||'')}</td>
                <td>${sanitize(r.manager||'')}</td>
                <td>${sanitize(r.date||'')}</td>
                <td><span class="badge badge-cert">${sanitize(r.contracted||'')}</span></td>
                <td>${sanitize(r.quoteDate||'')}</td>
                <td>${sanitize(r.failReason||'')}</td>
                <td>
                    <button class="btn btn-sm" onclick="editCert('${r.id}')">${tt('수정','修改')}</button>
                </td>
            </tr>`).join('');
    }
}

window.renderMedContract  = renderMedContract;
window.renderMedConsult   = renderMedConsult;
window.renderCertContract = renderCertContract;
window.renderCertConsult  = renderCertConsult;

// ── 의료기기팀 완료대장 ───────────────────────────────────────────
export function renderMedDone() {
    const tbody = getBody('medDoneTable');
    if (!tbody) return;
    const state = getState();
    const data  = (state.med || []).filter(r => r.recordType === 'contract' && isCompleted(r));

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">완료된 계약이 없습니다.</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map((r, i) => `<tr>
        <td>${i+1}</td>
        <td class="client-name">${sanitize(r.client||'')}</td>
        <td>${sanitize(r.biztype||'')}</td>
        <td>${sanitize(r.product||'')}</td>
        <td>${sanitize(r.manager||'')}</td>
        <td>${sanitize(r.startdate||'')}</td>
        <td>${sanitize(getCompleteDate(r))}</td>
        <td>${fmt(r.amount||0)} ${r.amountCurrency||'KRW'}</td>
        <td>
            <button class="btn btn-sm" onclick="editMed('${r.id}')">${tt('수정','修改')}</button>
        </td>
    </tr>`).join('');
}

// ── 제품환경인증팀 완료대장 ──────────────────────────────────────
export function renderCertDone() {
    const tbody = getBody('certDoneTable');
    if (!tbody) return;
    const state = getState();
    const data  = (state.cert || []).filter(r => r.recordType === 'contract' && isCompleted(r));

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">완료된 계약이 없습니다.</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map((r, i) => `<tr>
        <td>${i+1}</td>
        <td class="client-name">${sanitize(r.client||'')}</td>
        <td>${sanitize(r.certtype||'')}</td>
        <td>${sanitize(r.product||'')}</td>
        <td>${sanitize(r.manager||'')}</td>
        <td>${sanitize(r.contractdate||'')}</td>
        <td>${sanitize(getCompleteDate(r))}</td>
        <td>${fmt(r.amount||0)} ${r.amountCurrency||'KRW'}</td>
        <td>
            <button class="btn btn-sm" onclick="editCert('${r.id}')">${tt('수정','修改')}</button>
        </td>
    </tr>`).join('');
}

window.renderMedDone  = renderMedDone;
window.renderCertDone = renderCertDone;
