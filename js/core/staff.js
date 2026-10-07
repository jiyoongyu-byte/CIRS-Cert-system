// js/core/staff.js — 구성원 명단 관리 (Supabase staff 테이블)
// - 구성원은 영구 삭제하지 않고 '상태'(재직/본사 전출/휴직/퇴사/기타)로 관리함
// - 재직이 아닌 구성원: 로그인·조직도·신규 선택 목록에서 제외, 기존 기록의 담당자명은 그대로 유지
// - 지윤규(이사)·대표이사는 고정 임원으로 staff 테이블에 넣지 않음

import { initSb, logAudit } from './api.js';

export const EXEC_DIRECTOR = '지윤규';
export const STATUS_LIST   = ['재직', '본사 전출', '휴직', '퇴사', '기타'];
export const TEAMS         = ['의료기기팀', '제품환경인증팀'];
const RESERVED = ['지윤규', '대표이사'];

// DB 조회 실패 시 비상 명단 (2026-10-07 기준)
const FALLBACK = [
    { name:'엄태호',     team:'제품환경인증팀', position:'팀 장', is_lead:true,  sort_order:10, status:'재직' },
    { name:'Lyu Cuicui', team:'제품환경인증팀', position:'책 임', is_lead:false, sort_order:20, status:'재직' },
    { name:'박성재',     team:'제품환경인증팀', position:'선 임', is_lead:false, sort_order:30, status:'재직' },
    { name:'유재용',     team:'의료기기팀',     position:'수 석', is_lead:true,  sort_order:10, status:'재직' },
    { name:'윤미령',     team:'의료기기팀',     position:'책 임', is_lead:false, sort_order:20, status:'본사 전출' },
    { name:'차상호',     team:'의료기기팀',     position:'선 임', is_lead:false, sort_order:30, status:'재직' },
    { name:'Zhao Lijie', team:'의료기기팀',     position:'선 임', is_lead:false, sort_order:40, status:'재직' },
];

let staff  = FALLBACK.map(s => ({ ...s }));
let loaded = false;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const sortFn = (a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name, 'ko');

// ── 조회 ─────────────────────────────────────────────────────────
export async function loadStaff() {
    const client = initSb();
    if (!client) return false;
    try {
        const { data, error } = await client.from('staff').select('*');
        if (error || !Array.isArray(data) || !data.length) throw (error || new Error('staff 비어 있음'));
        staff  = data.sort(sortFn);
        loaded = true;
    } catch (e) {
        console.warn('staff 로드 실패 — 비상 명단 사용:', e);
        loaded = false;
    }
    applyLoginList();
    refreshSelects();
    return loaded;
}

export const getStaff  = () => staff;
export const isLoaded  = () => loaded;
const find             = n => staff.find(s => s.name === n);
export const teamOf    = n => find(n)?.team || null;
export const statusOf  = n => find(n)?.status || '재직';   // 명단 밖(임원)은 재직 취급
export const isActive  = n => statusOf(n) === '재직';
export const label     = n => isActive(n) ? n : `${n} (${statusOf(n)})`;

// 팀별 재직 구성원 (exec: 'first' | 'last' | 'none' — 지윤규 포함 위치)
export function activeMembers(team, exec = 'last') {
    const list = staff.filter(s => s.team === team && s.status === '재직').sort(sortFn).map(s => s.name);
    if (exec === 'first') return [EXEC_DIRECTOR, ...list];
    if (exec === 'last')  return [...list, EXEC_DIRECTOR];
    return list;
}
// 전체 재직 구성원 (지윤규 → 의료기기팀 → 제품환경인증팀)
export const allActive = () =>
    [EXEC_DIRECTOR, ...activeMembers('의료기기팀', 'none'), ...activeMembers('제품환경인증팀', 'none')];
// 이력 조회용 전체 명단 (상태 무관)
export const allNames = () =>
    [EXEC_DIRECTOR, ...staff.filter(s => s.team === '의료기기팀').sort(sortFn).map(s => s.name),
                    ...staff.filter(s => s.team === '제품환경인증팀').sort(sortFn).map(s => s.name)];

// ── select 채우기 ────────────────────────────────────────────────
// 첫 번째 '선택' 옵션은 유지, keep 값이 목록에 없으면 상태 표기와 함께 추가 (기존 기록 담당자 보존)
export function fillSelect(id, names, keep) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur  = keep !== undefined ? keep : sel.value;
    const head = sel.options[0] && sel.options[0].value === '' ? sel.options[0].outerHTML : '';
    const list = [...names];
    if (cur && !list.includes(cur)) list.push(cur);
    sel.innerHTML = head + list.map(n => `<option value="${esc(n)}">${esc(label(n))}</option>`).join('');
    sel.value = cur || '';
}

const SELECT_MAP = {
    'm-manager':       () => activeMembers('의료기기팀', 'last'),
    'c-manager':       () => activeMembers('제품환경인증팀', 'last'),
    'edu-member':      () => allActive(),
    'qual-member-sel': () => allActive(),
    'eduMemberSel':    () => allNames(),    // 교육 이력 필터 — 비재직자 이력도 조회 가능
};
export function refreshSelects() {
    Object.entries(SELECT_MAP).forEach(([id, fn]) => fillSelect(id, fn()));
}
// 수정 모달: 해당 select를 재직자 목록 + 기존 담당자로 재구성
export function ensureOption(id, value) {
    const fn = SELECT_MAP[id];
    if (fn) fillSelect(id, fn(), value || '');
}

// ── 로그인 목록 (index.html 인라인 LOGIN_TEAM_USERS 갱신) ─────────
export function applyLoginList() {
    const L = window.LOGIN_TEAM_USERS;
    if (!L) return;
    L['의료기기팀']     = activeMembers('의료기기팀', 'last');
    L['제품환경인증팀'] = activeMembers('제품환경인증팀', 'last');
    const team = document.getElementById('loginTeam')?.value;
    if (team && typeof window.updateLoginUsers === 'function') {
        const userSel = document.getElementById('loginUser');
        const prev = userSel?.value;
        window.updateLoginUsers();
        if (userSel && prev && L[team]?.includes(prev)) userSel.value = prev;
    }
}

// ── 조직도 렌더링 ────────────────────────────────────────────────
function cardHtml(s, color) {
    const lead   = !!s.is_lead;
    const border = lead ? `var(--${color})` : 'var(--border2)';
    const posCol = lead ? `var(--${color})` : `var(--${color}-mid)`;
    const btnId  = 'orgBtn_' + s.name.replace(/ /g, '_');
    const nameJs = esc(s.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
    return `<div style="background:var(--card);border:1px solid ${border};border-left:4px solid var(--${color});border-radius:8px;padding:10px 16px;width:100%;text-align:left;">
        <div style="font-size:10px;color:${posCol};font-weight:800;">${esc(s.position)}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px;">
          <div style="font-size:14px;font-weight:700;color:var(--text1);">${esc(s.name)}</div>
          <button class="btn btn-sm" style="font-size:10px;padding:3px 8px;" onclick="openPersonKpi('${nameJs}')" id="${esc(btnId)}">성과 뷰</button>
        </div>
      </div>`;
}
export function renderOrgChart() {
    const map = { '제품환경인증팀': ['org-members-cert', 'cert'], '의료기기팀': ['org-members-med', 'med'] };
    Object.entries(map).forEach(([team, [id, color]]) => {
        const box = document.getElementById(id);
        if (!box) return;
        const list = staff.filter(s => s.team === team && s.status === '재직').sort(sortFn);
        box.innerHTML = list.length
            ? list.map(s => cardHtml(s, color)).join('')
            : '<div style="font-size:12px;color:var(--text3);padding:8px">구성원 없음</div>';
    });
    const btn = document.getElementById('btnStaffManage');
    const cur = window._store?.getCurrentUser?.() || '';
    if (btn) btn.style.display = cur === EXEC_DIRECTOR ? '' : 'none';
}

// ── 구성원 관리 모달 (지윤규 전용) ───────────────────────────────
function ensureModal() {
    if (document.getElementById('modal-staff')) return;
    const el = document.createElement('div');
    el.className = 'modal-overlay';
    el.id = 'modal-staff';
    el.innerHTML = `<div class="modal-wrapper"><div class="modal" style="max-width:1120px">
      <div class="modal-header"><span class="modal-title">👥 구성원 관리</span>
        <button class="modal-close" onclick="closeModal('staff')">×</button></div>
      <div class="modal-body">
        <div style="font-size:12px;color:var(--text3);margin-bottom:12px;line-height:1.6">
          구성원은 삭제하지 않고 상태로 관리합니다. '재직'이 아닌 구성원은 로그인·조직도·신규 담당자 선택에서 제외되며,
          기존 계약·상담·교육·업무지시 기록의 담당자명은 그대로 유지됩니다. 이름은 기록 연결 기준이므로 등록 후 변경할 수 없습니다.
        </div>
        <div id="staffList"></div>
        <hr style="border:none;border-top:1px solid var(--border);margin:18px 0">
        <div style="font-weight:700;font-size:13px;margin-bottom:10px">+ 신규 구성원 추가</div>
        <div style="display:grid;grid-template-columns:1.4fr 1.2fr 1fr .7fr auto;gap:8px;align-items:end">
          <div><label class="form-label">이름</label><input class="form-input" id="staff-new-name" placeholder="예: 홍길동"></div>
          <div><label class="form-label">팀</label><select class="form-select" id="staff-new-team">
            ${TEAMS.map(t => `<option>${t}</option>`).join('')}</select></div>
          <div><label class="form-label">직급</label><input class="form-input" id="staff-new-pos" placeholder="예: 선 임"></div>
          <div><label class="form-label">표시순서</label><input class="form-input" id="staff-new-order" type="number" value="50"></div>
          <button class="btn btn-primary" onclick="staffAdd()">추가</button>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:8px">신규 구성원의 초기 비밀번호는 기존과 동일(cirs2026!)하며, 일반 권한으로 시작합니다.</div>
        <div id="staffMsg" style="font-size:12px;margin-top:10px;min-height:16px"></div>
      </div>
      <div class="modal-footer"><button class="btn" onclick="closeModal('staff')">닫기</button></div>
    </div></div>`;
    document.body.appendChild(el);
}

const CMP = 'padding:6px 8px;font-size:12px;';   // 목록 입력칸 축소 스타일
function renderStaffList() {
    const box = document.getElementById('staffList');
    if (!box) return;
    const rows = [...staff].sort((a, b) => a.team.localeCompare(b.team, 'ko') || sortFn(a, b));
    box.innerHTML = `<div class="table-wrap"><table style="width:100%;font-size:12px">
      <thead><tr><th>이름</th><th>팀</th><th>직급</th><th>순서</th><th>상태</th><th>변경일</th><th>메모</th><th></th></tr></thead>
      <tbody>${rows.map((s, i) => `<tr data-name="${esc(s.name)}" style="${s.status !== '재직' ? 'opacity:.6' : ''}">
        <td style="font-weight:700;white-space:nowrap">${esc(s.name)}</td>
        <td><select class="form-select" data-f="team" style="${CMP}width:128px">${TEAMS.map(t =>
            `<option ${t === s.team ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><input class="form-input" data-f="position" value="${esc(s.position)}" style="${CMP}width:70px"></td>
        <td><input class="form-input" data-f="sort_order" type="number" value="${Number(s.sort_order) || 0}" style="${CMP}width:56px"></td>
        <td><select class="form-select" data-f="status" style="${CMP}width:100px">${STATUS_LIST.map(t =>
            `<option ${t === s.status ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><input class="form-input" data-f="status_date" type="date" value="${esc(s.status_date || '')}" style="${CMP}width:128px"></td>
        <td><input class="form-input" data-f="status_memo" value="${esc(s.status_memo || '')}" style="${CMP}width:100%;min-width:110px"></td>
        <td><button class="btn btn-sm btn-primary" onclick="staffSaveRow(${i})">저장</button></td>
      </tr>`).join('')}</tbody></table></div>`;
    box._rows = rows;
}

function msg(text, ok = true) {
    const el = document.getElementById('staffMsg');
    if (el) { el.textContent = text; el.style.color = ok ? 'var(--success)' : 'var(--danger)'; }
}

function isSuper() { return (window._store?.getCurrentUser?.() || '') === EXEC_DIRECTOR; }

export function openStaffModal() {
    if (!isSuper()) { alert('구성원 관리는 관리자만 사용할 수 있습니다.'); return; }
    ensureModal();
    renderStaffList();
    msg('');
    document.getElementById('modal-staff')?.classList.add('open');
}

async function afterChange() {
    await loadStaff();          // 명단·로그인 목록·select 갱신
    renderOrgChart();
    renderStaffList();
}

export async function staffSaveRow(i) {
    if (!isSuper()) return;
    const box = document.getElementById('staffList');
    const s   = box?._rows?.[i];
    const tr  = box?.querySelectorAll('tbody tr')[i];
    if (!s || !tr) return;
    const v = f => tr.querySelector(`[data-f="${f}"]`)?.value ?? '';
    const upd = {
        team: v('team'), position: v('position').trim(),
        sort_order: parseInt(v('sort_order')) || 0,
        status: v('status'), status_date: v('status_date') || null,
        status_memo: v('status_memo').trim(), updated_at: new Date().toISOString(),
    };
    if (upd.status !== s.status && upd.status !== '재직') {
        if (!confirm(`${s.name}님을 '${upd.status}'(으)로 변경합니다.\n로그인·조직도·신규 담당자 선택에서 제외되며, 기존 기록은 그대로 유지됩니다.\n진행할까요?`)) return;
        if (!upd.status_date) upd.status_date = new Date().toISOString().slice(0, 10);
    }
    const client = initSb();
    if (!client) { msg('DB 연결 실패', false); return; }
    const { error } = await client.from('staff').update(upd).eq('name', s.name);
    if (error) { msg('저장 실패: ' + error.message, false); return; }
    await logAudit('구성원 수정', `${s.name}: ${s.team}/${s.status} → ${upd.team}/${upd.status}`, EXEC_DIRECTOR);
    await afterChange();
    msg(`${s.name} 저장 완료`);
}

export async function staffAdd() {
    if (!isSuper()) return;
    const name  = (document.getElementById('staff-new-name')?.value || '').trim();
    const team  = document.getElementById('staff-new-team')?.value || '';
    const pos   = (document.getElementById('staff-new-pos')?.value || '').trim();
    const order = parseInt(document.getElementById('staff-new-order')?.value) || 50;
    if (!name)                     { msg('이름을 입력하세요.', false); return; }
    if (RESERVED.includes(name))   { msg('임원 이름은 추가할 수 없습니다.', false); return; }
    if (find(name))                { msg(`'${name}'은(는) 이미 등록되어 있습니다. 상태 변경으로 복원하세요.`, false); return; }
    if (!TEAMS.includes(team))     { msg('팀을 선택하세요.', false); return; }
    const client = initSb();
    if (!client) { msg('DB 연결 실패', false); return; }
    const { error } = await client.from('staff').insert({
        name, team, position: pos, is_lead: false, sort_order: order, status: '재직',
    });
    if (error) { msg('추가 실패: ' + error.message, false); return; }
    await logAudit('구성원 추가', `${name} (${team}/${pos})`, EXEC_DIRECTOR);
    ['staff-new-name', 'staff-new-pos'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    await afterChange();
    msg(`${name} 추가 완료`);
}

// ── 초기 로드 및 전역 등록 ───────────────────────────────────────
export const ready = loadStaff();

window._staff = {
    ready, loadStaff, getStaff, isLoaded, teamOf, statusOf, isActive, label,
    activeMembers, allActive, allNames, fillSelect, refreshSelects, ensureOption,
    applyLoginList, renderOrgChart,
};
window.openStaffModal = openStaffModal;
window.staffSaveRow   = staffSaveRow;
window.staffAdd       = staffAdd;
