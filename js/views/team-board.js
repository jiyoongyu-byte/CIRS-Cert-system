// js/views/team-board.js — 팀별 계약/상담/완료대장 렌더링

import { getState, getCurrentYear, getCurrentUser } from '../core/store.js';
import { fmt, tt, sanitize, toKRW } from '../core/utils.js';

const getBody = id => {
    const t = document.getElementById(id);
    return t?.tagName === 'TABLE' ? (t.querySelector('tbody') || t) : t;
};

// ── 금액 표기: 통화 + 콤마 포맷, 우측 정렬 ───────────────────────
function fmtAmt(amount, currency) {
    return `<td style="text-align:right;white-space:nowrap">${currency || 'KRW'} ${fmt(amount || 0)}</td>`;
}

// ── 잔금 계산 (계약금액 - 수입실적), 우측 정렬 ────────────────────
function fmtRemain(r) {
    const total  = toKRW(Number(r.amount || 0), r.amountCurrency || 'KRW');
    const paid   = (r.billing || []).reduce((s, v, i) =>
        s + toKRW(Number(v || 0), (r.billingCurrencies || [])[i] || 'KRW'), 0);
    const remain = Math.round(total - paid);
    const color  = remain > 0 ? 'var(--warn)' : 'var(--text3)';
    return `<td style="text-align:right;white-space:nowrap;color:${color};font-weight:600">${fmt(remain)}</td>`;
}

// ── 상태 배지 ────────────────────────────────────────────────────
function statusBadge(status, teamColor) {
    const colorMap = {
        '협의중':   teamColor,
        '계약완료': 'badge-success',
        '보류':     'badge-amber',
        '계약불가': 'badge-red',
        '완료':     'badge-success',
        '미계약':   'badge-gray',
        '진행중':   teamColor,
        '취소':     'badge-red',
    };
    return `<span class="badge ${colorMap[status] || 'badge-gray'}">${sanitize(status || '')}</span>`;
}

// ── 대표이사 여부 확인 ────────────────────────────────────────────
function isRepUser() {
    return getCurrentUser() === (window.REP_USER || '대표이사');
}

// ── 관리 버튼 (대표이사에게는 미표시) ─────────────────────────────
function manageBtns(editFn, deleteConfirm) {
    if (isRepUser()) return '<td></td>';
    return `<td style="white-space:nowrap">
        <button class="btn btn-sm" onclick="${editFn}">${tt('수정','修改')}</button>
        <button class="btn btn-sm btn-danger" onclick="${deleteConfirm}">${tt('삭제','删除')}</button>
    </td>`;
}

// ══════════════════════════════════════════════════════════════════
// ── 의료기기팀 계약업체 (완료/취소 제외한 진행중만 표시) ───────────
// ══════════════════════════════════════════════════════════════════
export function renderMedContract() {
    const tbody = getBody('medContractTable');
    if (!tbody) return;

    const state = getState();
    const year  = getCurrentYear();

    // 완료(status='완료') 및 취소 건은 완료대장으로 이관 → 여기서 제외
    const data = (state.med || []).filter(x =>
        x.year === year && x.recordType === 'contract' &&
        x.status !== '완료' && x.status !== '취소'
    );

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map((r, i) => {
        const itemCol = [r.product, r.biztype].filter(Boolean).join(' / ');
        return `<tr>
            <td>${i + 1}</td>
            <td class="client-name" style="white-space:normal;word-break:break-word;max-width:160px">${sanitize(r.client)}</td>
            <td style="white-space:normal;word-break:break-word;max-width:160px">${sanitize(itemCol)}</td>
            <td>${sanitize(r.manager || '')}</td>
            <td>${sanitize(r.startdate || '')}</td>
            <td>${sanitize(r.duedate || '')}</td>
            ${fmtAmt(r.amount, r.amountCurrency)}
            ${fmtRemain(r)}
            <td>${sanitize(r.stage || '')}</td>
            <td>${statusBadge(r.status, 'badge-med')}</td>
            ${manageBtns(`editMed('${r.id}')`, `deleteMed('${r.id}')`)}
        </tr>`;
    }).join('');
}

// ── 의료기기팀 상담 ───────────────────────────────────────────────
export function renderMedConsult() {
    const tbody = getBody('medConsultTable');
    if (!tbody) return;

    const state   = getState();
    const year    = getCurrentYear();
    const data    = (state.med || []).filter(x => x.year === year && x.recordType === 'consult' && x.consultStatus !== '계약보류');
    const archive = (state.med || []).filter(x => x.year === year && x.recordType === 'consult' && x.consultStatus === '계약보류');
    const isRep   = isRepUser();

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
    } else {
        tbody.innerHTML = data.map((r, i) => `<tr>
            <td>${i + 1}</td>
            <td class="client-name">${sanitize(r.client)}</td>
            <td>${sanitize(r.grade || '')}</td>
            <td>${sanitize(r.product || '')}</td>
            <td>${sanitize(r.biztype || '')}</td>
            <td>${sanitize(r.manager || '')}</td>
            <td>${sanitize(r.startdate || '')}</td>
            <td>${statusBadge(r.consultStatus, 'badge-med')}</td>
            <td>${sanitize(r.quoteDate || '')}</td>
            <td>${sanitize(r.note || '')}</td>
            <td style="white-space:nowrap">
                ${!isRep ? `<button class="btn btn-sm" onclick="editMed('${r.id}')">${tt('수정','修改')}</button>
                <button class="btn btn-sm btn-success" onclick="convertToContract('med','${r.id}')">${tt('계약전환','转为合同')}</button>` : ''}
            </td>
        </tr>`).join('');
    }

    const archiveBody = getBody('medConsultArchiveTable');
    if (archiveBody) {
        archiveBody.innerHTML = !archive.length
            ? `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text3)">없음</td></tr>`
            : archive.map((r, i) => `<tr>
                <td>${i + 1}</td>
                <td class="client-name">${sanitize(r.client)}</td>
                <td>${sanitize(r.grade || '')}</td>
                <td>${sanitize(r.product || '')}</td>
                <td>${sanitize(r.biztype || '')}</td>
                <td>${sanitize(r.manager || '')}</td>
                <td>${sanitize(r.startdate || '')}</td>
                <td>${statusBadge(r.consultStatus, 'badge-med')}</td>
                <td>${sanitize(r.quoteDate || '')}</td>
                <td>${sanitize(r.failReason || '')}</td>
                <td>${!isRep ? `<button class="btn btn-sm" onclick="editMed('${r.id}')">${tt('수정','修改')}</button>` : ''}</td>
            </tr>`).join('');
    }
}

// ── 의료기기팀 완료대장 (status='완료' 건만) ──────────────────────
export function renderMedDone() {
    const tbody = getBody('medDoneTable');
    if (!tbody) return;

    const state = getState();
    const year  = getCurrentYear();

    const data = (state.med || []).filter(x =>
        x.year === year && x.recordType === 'contract' && x.status === '완료'
    );

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">완료된 계약이 없습니다.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map((r, i) => `<tr>
        <td>${i + 1}</td>
        <td class="client-name" style="white-space:normal;word-break:break-word;max-width:160px">${sanitize(r.client)}</td>
        <td>${sanitize(r.biztype || '')}</td>
        <td>${sanitize(r.product || '')}</td>
        <td>${sanitize(r.manager || '')}</td>
        <td>${sanitize(r.startdate || '')}</td>
        <td>${sanitize(r.duedate || '')}</td>
        ${fmtAmt(r.amount, r.amountCurrency)}
        ${manageBtns(`editMed('${r.id}')`, `deleteMed('${r.id}')`)}
    </tr>`).join('');
}

// ══════════════════════════════════════════════════════════════════
// ── 제품환경인증팀 계약업체 (stage='완료' 제외 — 완료대장으로 이관) ─
// ══════════════════════════════════════════════════════════════════
export function renderCertContract() {
    const tbody = getBody('certContractTable');
    if (!tbody) return;

    const state = getState();
    const year  = getCurrentYear();

    // stage='완료' 건은 완료대장(view-certDone)으로 이관 → 여기서 제외
    const data = (state.cert || []).filter(x =>
        x.year === year && x.recordType === 'contract' && x.stage !== '완료'
    );

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map((r, i) => {
        const itemCol = [r.certtype, r.etcMemo].filter(Boolean).join(' / ');
        return `<tr>
            <td>${i + 1}</td>
            <td class="client-name" style="white-space:normal;word-break:break-word;max-width:160px">${sanitize(r.client)}</td>
            <td style="white-space:normal;word-break:break-word;max-width:160px">${sanitize(itemCol)}</td>
            <td>${sanitize(r.manager || '')}</td>
            <td>${sanitize(r.contractdate || '')}</td>
            <td>${sanitize(r.issuedate || '')}</td>
            ${fmtAmt(r.amount, r.amountCurrency)}
            ${fmtRemain(r)}
            <td>${sanitize(r.stage || '')}</td>
            <td>${statusBadge(r.contracted, 'badge-cert')}</td>
            ${manageBtns(`editCert('${r.id}')`, `deleteCert('${r.id}')`)}
        </tr>`;
    }).join('');
}

// ── 제품환경인증팀 상담 ───────────────────────────────────────────
export function renderCertConsult() {
    const tbody = getBody('certConsultTable');
    if (!tbody) return;

    const state   = getState();
    const year    = getCurrentYear();
    const data    = (state.cert || []).filter(x => x.year === year && x.recordType === 'consult' && x.contracted !== '계약보류');
    const archive = (state.cert || []).filter(x => x.year === year && x.recordType === 'consult' && x.contracted === '계약보류');
    const isRep   = isRepUser();

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
    } else {
        tbody.innerHTML = data.map((r, i) => `<tr>
            <td>${i + 1}</td>
            <td class="client-name">${sanitize(r.client)}</td>
            <td>${sanitize(r.certtype || '')}</td>
            <td>${sanitize(r.manager || '')}</td>
            <td>${sanitize(r.date || '')}</td>
            <td>${statusBadge(r.contracted, 'badge-cert')}</td>
            <td>${sanitize(r.quoteDate || '')}</td>
            <td>${sanitize(r.note || '')}</td>
            <td style="white-space:nowrap">
                ${!isRep ? `<button class="btn btn-sm" onclick="editCert('${r.id}')">${tt('수정','修改')}</button>
                <button class="btn btn-sm btn-success" onclick="convertToContract('cert','${r.id}')">${tt('계약전환','转为合同')}</button>` : ''}
            </td>
        </tr>`).join('');
    }

    const archiveBody = getBody('certConsultArchiveTable');
    if (archiveBody) {
        archiveBody.innerHTML = !archive.length
            ? `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">없음</td></tr>`
            : archive.map((r, i) => `<tr>
                <td>${i + 1}</td>
                <td class="client-name">${sanitize(r.client)}</td>
                <td>${sanitize(r.certtype || '')}</td>
                <td>${sanitize(r.manager || '')}</td>
                <td>${sanitize(r.date || '')}</td>
                <td>${statusBadge(r.contracted, 'badge-cert')}</td>
                <td>${sanitize(r.quoteDate || '')}</td>
                <td>${sanitize(r.failReason || '')}</td>
                <td>${!isRep ? `<button class="btn btn-sm" onclick="editCert('${r.id}')">${tt('수정','修改')}</button>` : ''}</td>
            </tr>`).join('');
    }
}

// ── 제품환경인증팀 완료대장 (stage='완료' 건만) ───────────────────
export function renderCertDone() {
    const tbody = getBody('certDoneTable');
    if (!tbody) return;

    const state = getState();
    const year  = getCurrentYear();

    const data = (state.cert || []).filter(x =>
        x.year === year && x.recordType === 'contract' && x.stage === '완료'
    );

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">완료된 계약이 없습니다.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map((r, i) => `<tr>
        <td>${i + 1}</td>
        <td class="client-name" style="white-space:normal;word-break:break-word;max-width:160px">${sanitize(r.client)}</td>
        <td>${sanitize(r.certtype || '')}</td>
        <td>${sanitize(r.etcMemo || '')}</td>
        <td>${sanitize(r.manager || '')}</td>
        <td>${sanitize(r.contractdate || '')}</td>
        <td>${sanitize(r.issuedate || '')}</td>
        ${fmtAmt(r.amount, r.amountCurrency)}
        ${manageBtns(`editCert('${r.id}')`, `deleteCert('${r.id}')`)}
    </tr>`).join('');
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.renderMedContract  = renderMedContract;
window.renderMedConsult   = renderMedConsult;
window.renderMedDone      = renderMedDone;
window.renderCertContract = renderCertContract;
window.renderCertConsult  = renderCertConsult;
window.renderCertDone     = renderCertDone;
