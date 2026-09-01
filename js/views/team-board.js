// js/views/team-board.js — 팀별 계약/상담/완료대장 렌더링

import { getState, getCurrentYear, getCurrentUser } from '../core/store.js';
import { fmt, fmtM, tt, sanitize, toKRW, getRates } from '../core/utils.js';

const getBody = id => {
    const t = document.getElementById(id);
    return t?.tagName === 'TABLE' ? (t.querySelector('tbody') || t) : t;
};

// ── 금액 표기: 통화 앞, 콤마 포맷, 좌측 정렬 ───────────────────────
function fmtAmt(amount, currency) {
    return `<td style="text-align:right;white-space:nowrap">${fmt(amount || 0)} ${currency || 'KRW'}</td>`;
}

// ── 잔금 계산 (계약금액 - 수입실적), 좌측 정렬 ────────────────────
function fmtRemain(r) {
    const cur = r.amountCurrency || 'KRW';
    const amt = Number(r.amount || 0);
    const today = new Date().toISOString().slice(0, 10);

    // 잔금은 환산하지 않음 — 계약 통화 기준으로 직접 차감
    let paidSame = 0, mixed = false;
    (r.billing || []).forEach((v, i) => {
        const bd = (r.billingDates || [])[i] || '';
        if (bd && bd > today) return;                    // 미래 수입 예정 제외
        const bc = (r.billingCurrencies || [])[i] || 'KRW';
        if (!Number(v || 0)) return;
        if (bc === cur) paidSame += Number(v);
        else mixed = true;                               // 계약 통화와 다른 수금 존재
    });
    const remain = amt - paidSame;
    const color  = remain > 0 ? 'var(--warn)' : 'var(--text3)';
    const mark   = mixed ? ' <span style="color:var(--danger)" title="계약 통화와 다른 통화의 수입 내역이 있어 잔금이 부정확할 수 있습니다">※</span>' : '';
    return `<td style="text-align:right;white-space:nowrap;color:${color};font-weight:600">${fmt(remain)} ${cur}${mark}</td>`;
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
    // 계약 시작일 기준: 선택 연도 이하에 시작된 진행중 계약 모두 표시 (연도 무관 진행중 포함)
    const data = (state.med || []).filter(x => {
        if (x.recordType !== 'contract') return false;
        if (x.status === '완료' || x.status === '취소') return false;
        // startdate(YYYY-MM-DD) → 연도 추출, 없으면 x.year, 둘 다 없으면 현재연도
        const rawYear = x.startdate ? parseInt(x.startdate.toString().slice(0, 4))
                      : x.year      ? parseInt(x.year)
                      : year;
        return !isNaN(rawYear) && rawYear <= year;
    });

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:20px;color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
        renderContractTotal('medContractTable', [], 8);
        return;
    }

    tbody.innerHTML = data.map((r, i) => {
        return `<tr>
            <td>${i + 1}</td>
            <td class="client-name" style="white-space:normal;word-break:break-word;max-width:160px">${sanitize(r.client)}</td>
            <td style="white-space:normal;word-break:break-word;max-width:110px">${sanitize(r.grade || '')}</td>
            <td>${sanitize(r.biztype || '')}</td>
            <td style="white-space:normal;word-break:break-word;max-width:180px">${sanitize(r.product || '')}</td>
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

    renderContractTotal('medContractTable', data, 8, 'startdate');
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

    // 계약전환율: 해당 연도 계약 건수 / (계약 + 상담) 전체 × 100%
    const allMedYear = (state.med || []).filter(x => x.year === year);
    const cntContract = allMedYear.filter(x => x.recordType === 'contract').length;
    const cntConsult  = allMedYear.filter(x => x.recordType === 'consult').length;
    const total = cntContract + cntConsult;
    const rateEl = document.getElementById('medConsultRate');
    if (rateEl) {
        if (total > 0) {
            const rate = Math.round(cntContract / total * 100);
            rateEl.textContent = `계약전환율 ${rate}% (${cntContract}/${total})`;
            rateEl.style.display = '';
        } else {
            rateEl.style.display = 'none';
        }
    }

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
    // 계약 시작일 기준: 선택 연도 이하에 시작된 진행중 계약 모두 표시
    const data = (state.cert || []).filter(x => {
        if (x.recordType !== 'contract') return false;
        if (x.stage === '완료') return false;
        const rawYear = x.contractdate ? parseInt(x.contractdate.toString().slice(0, 4))
                      : x.startdate    ? parseInt(x.startdate.toString().slice(0, 4))
                      : x.year         ? parseInt(x.year)
                      : year;
        return !isNaN(rawYear) && rawYear <= year;
    });

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
        renderContractTotal('certContractTable', []);
        return;
    }

    tbody.innerHTML = data.map((r, i) => {
        const itemCol = [certLabel(r), r.etcMemo].filter(Boolean).join(' / ');
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

    renderContractTotal('certContractTable', data, 6, 'contractdate');
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

    // 계약전환율: 해당 연도 계약 건수 / (계약 + 상담) 전체 × 100%
    const allCertYear = (state.cert || []).filter(x => x.year === year);
    const cntContract = allCertYear.filter(x => x.recordType === 'contract').length;
    const cntConsult  = allCertYear.filter(x => x.recordType === 'consult').length;
    const total = cntContract + cntConsult;
    const rateEl = document.getElementById('certConsultRate');
    if (rateEl) {
        if (total > 0) {
            const rate = Math.round(cntContract / total * 100);
            rateEl.textContent = `계약전환율 ${rate}% (${cntContract}/${total})`;
            rateEl.style.display = '';
        } else {
            rateEl.style.display = 'none';
        }
    }

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
    } else {
        tbody.innerHTML = data.map((r, i) => `<tr>
            <td>${i + 1}</td>
            <td class="client-name">${sanitize(r.client)}</td>
            <td>${sanitize(certLabel(r))}</td>
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
                <td>${sanitize(certLabel(r))}</td>
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
        <td>${sanitize(certLabel(r))}</td>
        <td>${sanitize(r.etcMemo || '')}</td>
        <td>${sanitize(r.manager || '')}</td>
        <td>${sanitize(r.contractdate || '')}</td>
        <td>${sanitize(r.issuedate || '')}</td>
        ${fmtAmt(r.amount, r.amountCurrency)}
        ${manageBtns(`editCert('${r.id}')`, `deleteCert('${r.id}')`)}
    </tr>`).join('');
}

// ═══════════════════════════════════════════════════════════════
// 인증 종류 표기 — '기타'는 인증명칭을 괄호로 병기 (예: 기타(KCs))
function certLabel(r) {
    const t = r.certtype || '';
    return (t === '기타' && r.certtypeRaw) ? `기타(${r.certtypeRaw})` : t;
}

// ── 표 하단 합계 행 (진행 건수 / 계약금액 / 잔금 — 모두 KRW 환산) ──────
function renderContractTotal(tableId, rows, labelSpan = 6, dateKey = 'startdate') {
    const table = document.getElementById(tableId);
    if (!table || table.tagName !== 'TABLE') return;
    let tfoot = table.querySelector('tfoot');
    if (!tfoot) { tfoot = document.createElement('tfoot'); table.appendChild(tfoot); }
    if (!rows.length) { tfoot.innerHTML = ''; return; }

    let total = 0;
    const remainByCur = {};                              // 잔금은 통화별로 집계 (환산 없음)
    rows.forEach(r => {
        const k = calcKRW(r, r[dateKey] || '');
        total += k.total;
        remainByCur[k.cur] = (remainByCur[k.cur] || 0) + k.remainOrig;
    });
    const remainTxt = Object.entries(remainByCur)
        .filter(([, v]) => Math.round(v) !== 0)
        .map(([c, v]) => `${fmt(Math.round(v))} ${c}`)
        .join('<br>') || '0';

    tfoot.innerHTML = `<tr style="background:var(--surface);font-weight:700">
        <td colspan="${labelSpan}" style="text-align:right">합계 · ${rows.length}건</td>
        <td style="text-align:right;white-space:nowrap">${fmt(total)} KRW</td>
        <td style="text-align:right;white-space:nowrap;color:var(--warn)">${remainTxt}</td>
        <td colspan="3"></td>
    </tr>`;
}

// ── 계약업체 엑셀 다운로드 (화면 표 그대로 1시트) ────────────────
// ═══════════════════════════════════════════════════════════════

// 화면 목록과 동일한 필터 (renderMedContract / renderCertContract 기준)
function pickContractRows(team, state, year) {
    if (team === 'med') {
        return (state.med || []).filter(x => {
            if (x.recordType !== 'contract') return false;
            if (x.status === '완료' || x.status === '취소') return false;
            const y = x.startdate ? parseInt(x.startdate.toString().slice(0, 4))
                    : x.year      ? parseInt(x.year) : year;
            return !isNaN(y) && y <= year;
        });
    }
    return (state.cert || []).filter(x => {
        if (x.recordType !== 'contract') return false;
        if (x.stage === '완료') return false;
        const y = x.contractdate ? parseInt(x.contractdate.toString().slice(0, 4))
                : x.startdate    ? parseInt(x.startdate.toString().slice(0, 4))
                : x.year         ? parseInt(x.year) : year;
        return !isNaN(y) && y <= year;
    });
}

// 계약금액=계약일 분기 환율, 수금액=수금일 분기 환율, 잔금=원화폐(환산 없음)
function calcKRW(r, contractDate) {
    const cur = r.amountCurrency || 'KRW';
    const today = new Date().toISOString().slice(0, 10);

    // 계약금액 → 계약일 분기 환율 (참고치)
    const total = Math.round(toKRW(Number(r.amount || 0), cur, contractDate));

    // 수금액 → 각 수금일 분기 환율 (확정치)
    let paid = 0, paidSame = 0;
    (r.billing || []).forEach((v, i) => {
        const bd = (r.billingDates || [])[i] || '';
        if (bd && bd > today) return;                    // 미래 수입 예정 제외
        const bc = (r.billingCurrencies || [])[i] || 'KRW';
        const n  = Number(v || 0);
        if (!n) return;
        paid += toKRW(n, bc, bd);
        if (bc === cur) paidSame += n;
    });
    return {
        cur,
        total,
        paid: Math.round(paid),
        remainOrig: Number(r.amount || 0) - paidSame,    // 원화폐 잔금 (환산 없음)
    };
}

export function exportContractExcel(team) {
    if (typeof XLSX === 'undefined') { alert('엑셀 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'); return; }

    const year  = getCurrentYear();
    const rows  = pickContractRows(team, getState(), year);
    const isMed = team === 'med';
    const label = isMed ? '의료기기팀' : '제품환경인증팀';
    if (!rows.length) { alert(`${label} 계약업체 목록이 없습니다.`); return; }

    // 화면 표와 동일한 열 구성 (관리 버튼 열은 제외, 금액은 원화폐 + KRW 환산 병기)
    const sheet = rows.map((r, i) => {
        const k = calcKRW(r, (isMed ? r.startdate : r.contractdate) || '');
        return {
            '순번': i + 1,
            '업체명': r.client || '',
            ...(isMed
                ? { '등급/분류': r.grade || '', '업무유형': r.biztype || '', '제품명/모델': r.product || '' }
                : { '인증종류/품목': [certLabel(r), r.etcMemo].filter(Boolean).join(' / ') }),
            '담당자': r.manager || '',
            '계약일': (isMed ? r.startdate : r.contractdate) || '',
            '완료목표': (isMed ? r.duedate : r.issuedate) || '',
            '통화': k.cur,
            '계약금액(원화폐)': Number(r.amount || 0),
            '계약금액(KRW)': k.total,
            '잔금(원화폐)': k.remainOrig,
            '진행단계': r.stage || '',
            '상태': (isMed ? r.status : r.contracted) || '',
        };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), '계약업체');
    XLSX.writeFile(wb, `${label}_계약업체_${year}.xlsx`);
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.exportContractExcel = exportContractExcel;
window.renderMedContract  = renderMedContract;
window.renderMedConsult   = renderMedConsult;
window.renderMedDone      = renderMedDone;
window.renderCertContract = renderCertContract;
window.renderCertConsult  = renderCertConsult;
window.renderCertDone     = renderCertDone;
