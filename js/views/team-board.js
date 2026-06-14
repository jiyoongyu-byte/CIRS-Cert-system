// [모듈화 파트 3의 2번째 작업] - /js/views/team-board.js

// 1. 코어(Core) 모듈 불러오기
import { getState, getCurrentYear, getCurrentUser } from '../core/store.js';
import { fmt, tt, sanitize } from '../core/utils.js';
// ID 브릿지 — HTML 테이블 ID와 연결
const getBody = id => {
    const t = document.getElementById(id);
    return t?.tagName === 'TABLE' ? (t.querySelector('tbody') || t) : t;
};
// 2. 의료기기팀 계약 리스트 렌더링
export function renderMedContract() {
    const tbody = getBody('medContractTable');
    if (!tbody) return; // [사전 차단 로직] 화면에 표가 없으면 백화현상 방지를 위해 즉시 종료

    const state = getState();
    const year = getCurrentYear();
    // 해당 연도의 계약(contract) 건만 필터링
    const data = (state.med || []).filter(x => x.year === year && x.recordType === 'contract');
    
    let html = '';
    data.forEach((r, i) => {
        // 금액 권한 및 콤마 포맷팅
        const amt = fmt(r.amount || 0);
        html += `
        <tr>
            <td>${i + 1}</td>
            <td class="client-name">${sanitize(r.client)}</td>
            <td>${sanitize(r.product)}</td>
            <td><span class="badge ${r.status === '완료' ? 'badge-success' : 'badge-med'}">${sanitize(r.status)}</span></td>
            <td>${sanitize(r.startdate)}</td>
            <td>${amt} ${r.amountCurrency || 'KRW'}</td>
            <td>
                <button class="btn btn-sm" onclick="editMed('${r.id}')">${tt('수정','修改')}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteMed('${r.id}')">${tt('삭제','删除')}</button>
            </td>
        </tr>`;
    });
    
    tbody.innerHTML = html || `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
}

// 3. 의료기기팀 상담 리스트 렌더링
export function renderMedConsult() {
    const tbody = getBody('medConsultTable');
    if (!tbody) return;

    const state = getState();
    const year = getCurrentYear();
    const data = (state.med || []).filter(x => x.year === year && x.recordType === 'consult');
    
    let html = '';
    data.forEach((r, i) => {
        html += `
        <tr>
            <td>${i + 1}</td>
            <td class="client-name">${sanitize(r.client)}</td>
            <td>${sanitize(r.product)}</td>
            <td>${sanitize(r.consultStatus)}</td>
            <td>
                <button class="btn btn-sm" onclick="editMed('${r.id}')">${tt('수정','修改')}</button>
                <button class="btn btn-sm btn-success" onclick="convertToContract('med', '${r.id}')">${tt('계약전환','转为合同')}</button>
            </td>
        </tr>`;
    });
    
    tbody.innerHTML = html || `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
}

// 4. 제품환경인증팀 계약 리스트 렌더링
export function renderCertContract() {
    const tbody = getBody('certContractTable');
    if (!tbody) return;

    const state = getState();
    const year = getCurrentYear();
    const data = (state.cert || []).filter(x => x.year === year && x.recordType === 'contract');
    
    let html = '';
    data.forEach((r, i) => {
        const amt = fmt(r.amount || 0);
        html += `
        <tr>
            <td>${i + 1}</td>
            <td class="client-name">${sanitize(r.client)}</td>
            <td>${sanitize(r.certtype)}</td>
            <td><span class="badge ${r.contracted === '완료' ? 'badge-success' : 'badge-cert'}">${sanitize(r.contracted)}</span></td>
            <td>${sanitize(r.contractdate)}</td>
            <td>${amt} ${r.amountCurrency || 'KRW'}</td>
            <td>
                <button class="btn btn-sm" onclick="editCert('${r.id}')">${tt('수정','修改')}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteCert('${r.id}')">${tt('삭제','删除')}</button>
            </td>
        </tr>`;
    });
    
    tbody.innerHTML = html || `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
}

// 5. 제품환경인증팀 상담 리스트 렌더링
export function renderCertConsult() {
    const tbody = getBody('certConsultTable');
    if (!tbody) return;

    const state = getState();
    const year = getCurrentYear();
    const data = (state.cert || []).filter(x => x.year === year && x.recordType === 'consult');
    
    let html = '';
    data.forEach((r, i) => {
        html += `
        <tr>
            <td>${i + 1}</td>
            <td class="client-name">${sanitize(r.client)}</td>
            <td>${sanitize(r.certtype)}</td>
            <td>${sanitize(r.contracted)}</td>
            <td>
                <button class="btn btn-sm" onclick="editCert('${r.id}')">${tt('수정','修改')}</button>
                <button class="btn btn-sm btn-success" onclick="convertToContract('cert', '${r.id}')">${tt('계약전환','转为合同')}</button>
            </td>
        </tr>`;
    });
    
    tbody.innerHTML = html || `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text3)">${tt('데이터가 없습니다.','暂无数据。')}</td></tr>`;
}

// [사전 차단 로직] 클릭 증발 에러 방지 브릿지
// HTML 상의 버튼들이 이 함수들을 찾을 수 있도록 window 전역 객체에 등록합니다.
window.renderMedContract = renderMedContract;
window.renderMedConsult = renderMedConsult;
window.renderCertContract = renderCertContract;
window.renderCertConsult = renderCertConsult;
