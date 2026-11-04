// js/views/alerts.js — 로그인 직후 팝업: ① 계약일 누락 계약 건 ② 인증 갱신(만료 9개월 이내) 대상
// 만료일 = 입력된 만료일, 없으면 인증서 발급일 + 갱신 주기. 갱신 상담을 등록한 건은 제외.

import { getState, getCurrentUser } from '../core/store.js';
import { saveMedRecord, saveCertRecord } from '../core/api.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const todayKst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const addUTC = (ds, fn) => { const d = new Date(ds + 'T00:00:00Z'); fn(d); return d.toISOString().slice(0, 10); };

export function expireOf(r) {
    if (r.expiredate) return r.expiredate;
    const n = parseInt(r.renewcycle);
    if (!n || !r.issuedate) return '';
    return addUTC(r.issuedate, d => d.setUTCFullYear(d.getUTCFullYear() + n));
}

export function collectAlerts(state, today) {
    const lim = addUTC(today, d => d.setUTCMonth(d.getUTCMonth() + 9));
    const all = [...(state.med || []).map(r => ({ ...r, team: 'med' })), ...(state.cert || []).map(r => ({ ...r, team: 'cert' }))]
        .filter(r => r.recordType === 'contract' && r.status !== '취소');
    const missing = all.filter(r => !(r.team === 'med' ? r.startdate : r.contractdate));
    const renew = all.map(r => ({ ...r, exp: expireOf(r) }))
        .filter(r => r.exp && r.exp <= lim && !r.renewConsulted)
        .sort((a, b) => a.exp.localeCompare(b.exp));
    return { missing, renew };
}

export function showDataAlert() {
    if (!getCurrentUser()) return;
    const today = todayKst();
    const { missing, renew } = collectAlerts(getState(), today);
    if (!missing.length && !renew.length) return;
    const canAct = getCurrentUser() !== (window.REP_USER || '대표이사');   // 대표이사는 조회만

    const row = h => `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">${h}</div>`;
    const miss = missing.length ? `<div style="margin-bottom:14px"><div style="font-size:13px;font-weight:700;margin-bottom:4px">📅 계약일 누락 (${missing.length}건)</div>
        ${missing.map(r => row(`<b>${esc(r.client)}</b> 업체 계약일 누락 <span style="color:var(--text3)">(${r.team === 'med' ? '의료기기팀' : '제품환경인증팀'})</span>`)).join('')}</div>` : '';
    const ren = renew.length ? `<div style="margin-bottom:14px"><div style="font-size:13px;font-weight:700;margin-bottom:4px">🔔 인증 갱신 대상 — 만료 9개월 이내 (${renew.length}건)</div>
        ${renew.map(r => row(`<b>${esc(r.client)}</b> · 만료 ${r.exp}${r.exp < today ? ' <span style="color:var(--danger)">(만료됨)</span>' : ''}
            ${canAct ? `<button class="btn btn-sm" style="float:right" onclick="renewConsult('${r.team}','${esc(r.id)}')">상담 등록</button>` : ''}`)).join('')}</div>` : '';

    document.getElementById('data-alert-overlay')?.remove();
    const el = document.createElement('div');
    el.id = 'data-alert-overlay';
    el.className = 'modal-overlay open';
    el.innerHTML = `<div class="modal-wrapper"><div class="modal" style="max-width:520px">
        <div class="modal-header"><span class="modal-title">📢 확인이 필요한 계약 정보</span><button class="modal-close" onclick="closeDataAlert()">×</button></div>
        <div class="modal-body" style="max-height:60vh;overflow-y:auto">${miss}${ren}</div>
        <div class="modal-footer"><button class="btn" onclick="closeDataAlert()">닫기</button></div>
    </div></div>`;
    document.body.appendChild(el);
}
export const closeDataAlert = () => document.getElementById('data-alert-overlay')?.remove();

// [상담 등록]: 해당 업체가 채워진 상담 입력창을 열고, 저장되면 원 계약 건에 '갱신상담 등록됨'을 기록
let _renewFrom = null;
export function renewConsult(team, id) {
    const r = getState()[team]?.find(x => x.id === id);
    if (!r) return;
    _renewFrom = { team, id };
    closeDataAlert();
    if (team === 'med') { window.openMedModal('consult'); document.getElementById('m-client').value = r.client; }
    else { window.openCertModal('consult'); document.getElementById('c-client').value = r.client; }
}

// 상담 저장 성공 후 form-actions에서 호출 (업체명이 같을 때만 표시 — 다른 상담 저장으로 오표시 방지)
export async function markRenewConsulted(team, client) {
    const f = _renewFrom; _renewFrom = null;
    if (!f || f.team !== team) return;
    const r = getState()[team].find(x => x.id === f.id);
    if (!r || r.client !== client) return;
    r.renewConsulted = true;
    await (team === 'med' ? saveMedRecord : saveCertRecord)(r);
}

window.showDataAlert = showDataAlert;
window.closeDataAlert = closeDataAlert;
window.renewConsult = renewConsult;
window.markRenewConsulted = markRenewConsulted;
