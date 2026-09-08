// js/views/tasks.js — 업무지시서 뷰

import { getState, getCurrentUser, setEditingTaskId, setCompletingTaskId,
         getEditingTaskId } from '../core/store.js';

// ── 업무지시서 렌더링 ─────────────────────────────────────────────
export function renderTasks() {
    const state       = getState();
    const currentUser = getCurrentUser();
    const ADMIN_USERS = window.ADMIN_USERS  || ['지윤규','엄태호','유재용'];
    const SUPER_ADMIN = window.SUPER_ADMIN  || '지윤규';
    const REP_USER    = window.REP_USER     || '대표이사';

    const badge = document.getElementById('taskUserBadge');
    const warn  = document.getElementById('taskLoginWarn');
    if (badge) badge.textContent = currentUser || '(이름 미선택)';
    if (warn)  warn.style.display = currentUser ? 'none' : '';

    // 대표이사 포함 모든 사용자가 업무지시 작성 가능
    const orderBtn  = document.getElementById('taskOrderBtn');
    const collabBtn = document.getElementById('taskCollabBtn');
    if (orderBtn)  orderBtn.style.display  = currentUser ? '' : 'none';
    if (collabBtn) collabBtn.style.display = currentUser ? '' : 'none';

    const typeF  = document.getElementById('taskTypeFilter')?.value  || '';
    const prioF  = document.getElementById('taskPrioFilter')?.value  || '';
    const statF  = document.getElementById('taskStatusFilter')?.value || '';
    const sortBy = document.getElementById('taskSortSel')?.value     || 'date';

    // ── 열람 권한 필터 ─────────────────────────────────────────────
    // 지윤규: 전체 열람
    // 나머지: 본인이 발신(from) 또는 수신(to)인 것만 → 타인 간 업무지시 열람 불가
    let tasks = (state.tasks || []).filter(t => {
        // 지윤규: 전체 열람
        if (currentUser === SUPER_ADMIN) {
            // 타입/우선순위/상태 필터만 적용
        } else {
            // 본인 관련(발신+수신)만, 타인 간 업무지시 차단
            if (t.from !== currentUser && t.to !== currentUser) return false;
        }

        // 공통 필터 (유형, 우선순위, 완료 여부)
        if (typeF && (t.type || 'order') !== typeF) return false;
        if (prioF && t.priority !== prioF)           return false;
        if (statF) {
            const done = !!t.completedDate;
            if (statF === '완료'   && !done) return false;
            if (statF === '진행중' && done)  return false;
        }
        return true;
    });

    // ── 정렬: 관리자 선택 순 ──
    tasks.sort((a, b) => {
        if (sortBy === 'name') return (a.to || '').localeCompare(b.to || '', 'ko');
        return (b.date || '').localeCompare(a.date || '');
    });

    const container = document.getElementById('taskList');
    if (!container) return;

    if (!tasks.length) {
        container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:var(--text3)">
            ${!currentUser ? '로그인 후 이름을 선택하세요.' : '등록된 업무지시서/협조요청이 없습니다.'}
        </div></div>`;
        return;
    }

    const PCOLOR = { '긴급':'var(--danger)', '일반':'var(--warn)', '낮음':'var(--success)' };
    const PLABEL = { '긴급':'🔴 긴급', '일반':'🟡 일반', '낮음':'🟢 낮음' };
    const today  = new Date().toISOString().slice(0, 10);

    const card = t => {
        const isDone    = !!t.completedDate;
        const isOrder   = (t.type || 'order') === 'order';
        const pc        = PCOLOR[t.priority] || 'var(--text3)';
        const overdue   = !isDone && t.due && t.due < today;
        const canEdit   = ADMIN_USERS.includes(currentUser) || t.to === currentUser;
        const canDelete = ADMIN_USERS.includes(currentUser);
        // 완료 보고: 회신 정확성은 지시자가 판단 → 발신자 본인 또는 최고관리자
        const canComplete = currentUser && !isDone &&
                            (t.from === currentUser || currentUser === SUPER_ADMIN);
        // 확인 처리: 발행자 본인 또는 최고관리자
        const canConfirm = isDone && !t.confirmedDate &&
                           (t.from === currentUser || currentUser === SUPER_ADMIN);

        return `<div class="card" style="margin-bottom:10px;border-left:4px solid ${isDone ? 'var(--border)' : pc};opacity:${isDone ? 0.72 : 1}">
            <div style="padding:13px 15px">
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px">
                    <span style="font-size:11px;font-weight:700;color:${pc}">${PLABEL[t.priority] || t.priority}</span>
                    <span class="badge ${isOrder ? 'badge-cert' : 'badge-med'}" style="font-size:10px">
                        ${isOrder ? '📋 업무지시' : '🤝 협조요청'}
                    </span>
                    <span class="badge badge-gray" style="font-size:10px">${t.team || '공통'}</span>
                    ${overdue ? '<span class="badge badge-red" style="font-size:10px">⚠ 기한초과</span>' : ''}
                    ${isDone  ? '<span class="badge badge-green" style="font-size:10px">✓ 완료</span>' : ''}
                    <span style="margin-left:auto;font-size:10px;color:var(--text3)">
                        지시일: ${t.date || '-'}${t.due ? ' | 기한: ' + t.due : ''}
                    </span>
                </div>
                <div style="font-size:13px;font-weight:500;line-height:1.6;margin-bottom:7px;white-space:pre-wrap">${t.content || ''}</div>
                <div style="display:flex;gap:14px;font-size:11px;color:var(--text3);margin-bottom:7px">
                    <span>📤 <strong style="color:var(--text2)">${t.from || '-'}</strong></span>
                    <span>📥 <strong style="color:${isDone ? 'var(--success)' : 'var(--accent)'}">${t.to || '-'}</strong></span>
                </div>
                ${isDone ? `<div style="font-size:11px;padding:7px 11px;background:var(--success-light);border-radius:6px;color:var(--success);margin-bottom:7px">
                    ✅ 완료 (${t.completedDate}): ${t.completeNote || ''}
                </div>` : ''}
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    ${canComplete ? `<button class="btn btn-cert btn-sm" onclick="openTaskComplete('${t.id}')">완료 보고</button>` : ''}
                    ${canConfirm ? `<span style="font-size:10px;color:var(--text3)">확인일</span>
                        <input type="date" id="cfmDate-${t.id}" value="${today}" style="font-size:11px;padding:3px 6px">
                        <button class="btn btn-sm" style="border-color:var(--med);color:var(--med)" onclick="confirmTask('${t.id}')">✓ 확인 처리</button>` : ''}
                    ${t.confirmedDate ? `<span style="font-size:10px;color:var(--text3)">확인: ${t.confirmedDate}</span>` : ''}
                    ${canEdit && !isDone ? `<button class="btn btn-sm" onclick="openTaskEdit('${t.id}')">수정</button>` : ''}
                    ${canDelete ? `<button class="btn btn-sm btn-danger" onclick="deleteTask('${t.id}')">삭제</button>` : ''}
                </div>
            </div>
        </div>`;
    };

    // ── 기한 내 진행건 / 기한경과 미완료 / 수행완료 3분할 ──
    const active  = tasks.filter(t => !t.completedDate && !(t.due && t.due < today));
    const ongoing = tasks.filter(t => !t.completedDate &&   t.due && t.due < today);
    const done    = tasks.filter(t =>  t.completedDate);

    const col = (title, list, color) => `<div>
        <div style="font-size:12px;font-weight:700;color:${color};margin-bottom:8px">${title} (${list.length})</div>
        ${list.length ? list.map(card).join('')
            : '<div class="card"><div style="padding:18px;text-align:center;font-size:12px;color:var(--text3)">해당 없음</div></div>'}
    </div>`;

    container.innerHTML = active.map(card).join('') +
        ((ongoing.length || done.length) ? `
        <div style="margin:22px 0 12px;padding-top:16px;border-top:1px solid var(--border);font-size:14px;font-weight:700">
            작업지시 기한경과 및 수행결과
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            ${col('작업수행이행중', ongoing, 'var(--danger)')}
            ${col('작업수행완료',   done,    'var(--success)')}
        </div>` : '');
}

// ── 수신자 선택 옵션 업데이트 ─────────────────────────────────────
export function updateTaskToOptions(team) {
    const TEAM_MEMBERS = {
        '의료기기팀':     ['지윤규','유재용','윤미령','차상호','Zhao Lijie'],
        '제품환경인증팀': ['지윤규','엄태호','Lyu Cuicui','박성재'],
        '공통':           ['지윤규','유재용','윤미령','차상호','Zhao Lijie','엄태호','Lyu Cuicui','박성재'],
    };
    const members = TEAM_MEMBERS[team] || TEAM_MEMBERS['공통'];
    const sel     = document.getElementById('task-to');
    if (!sel) return;
    const cur = getCurrentUser();
    sel.innerHTML = '<option value="">담당자 선택</option>' +
        members.filter(m => m !== cur).map(m => `<option value="${m}">${m}</option>`).join('');
}

// ── 업무지시 수정 모달 열기 ─────────────────────────────────────
export function openTaskEdit(id) {
    const t = getState().tasks?.find(x => x.id === id);
    if (!t) return;
    setEditingTaskId(id);
    const modal = document.getElementById('modal-task');
    if (!modal) return;
    modal.classList.add('open');
    document.getElementById('taskModalTitle')?.setAttribute('data-val', t.type === 'order' ? '📋 업무지시서 수정' : '🤝 협조요청 수정');
    document.getElementById('task-type-hidden')?.setAttribute('value', t.type || 'order');
    ['task-from','task-date','task-due','task-content'].forEach(id => {
        const el  = document.getElementById(id);
        const key = id.replace('task-', '').replace('-', '');
        if (el) el.value = t[id.replace('task-', '')] || t[key] || '';
    });
    if (document.getElementById('task-team')) {
        document.getElementById('task-team').value = t.team || '공통';
        updateTaskToOptions(t.team || '공통');
    }
    if (document.getElementById('task-to'))       document.getElementById('task-to').value = t.to || '';
    if (document.getElementById('task-priority')) document.getElementById('task-priority').value = t.priority || '일반';
    if (document.getElementById('task-content'))  document.getElementById('task-content').value = t.content || '';
    // task-project 드롭다운 채우기 + 기존 선택값 복원
    const projSel = document.getElementById('task-project');
    if (projSel) {
        const state2 = getState();
        const clients = new Set();
        (state2.med  || []).forEach(r => r.client && clients.add(r.client));
        (state2.cert || []).forEach(r => r.client && clients.add(r.client));
        projSel.innerHTML =
            '<option value="">관련 업체 선택 (없음)</option>' +
            '<option value="CIRS Group Korea">🏢 CIRS Group Korea (내부업무)</option>' +
            Array.from(clients).sort((a, b) => a.localeCompare(b, 'ko'))
                .map(c => `<option value="${c}">${c}</option>`).join('');
        projSel.value = t.project || '';
    }
}

// ── 완료 보고 모달 열기 ─────────────────────────────────────────
export function openTaskComplete(id) {
    setCompletingTaskId(id);
    const today = new Date().toISOString().slice(0, 10);
    if (document.getElementById('task-complete-date')) document.getElementById('task-complete-date').value = today;
    if (document.getElementById('task-complete-note')) document.getElementById('task-complete-note').value = '';
    document.getElementById('modal-task-complete')?.classList.add('open');
}

// ── 업무 삭제 ─────────────────────────────────────────────────
export async function deleteTask(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    const state = getState();
    state.tasks = state.tasks.filter(x => x.id !== id);
    const { saveState } = await import('../core/store.js');
    await saveState();
    renderTasks();
}

// ── 발행자 확인 처리 (확인일자 지정) ─────────────────────────────
export async function confirmTask(id) {
    const t = getState().tasks?.find(x => x.id === id);
    if (!t) return;
    const picked = document.getElementById(`cfmDate-${id}`)?.value;
    const date   = picked || new Date().toISOString().slice(0, 10);
    if (!confirm(`확인일자 ${date} 로 확인 처리하시겠습니까?`)) return;
    t.confirmedDate = date;
    const { saveState } = await import('../core/store.js');
    await saveState();
    renderTasks();
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.renderTasks         = renderTasks;
window.updateTaskToOptions = updateTaskToOptions;
window.openTaskEdit        = openTaskEdit;
window.openTaskComplete    = openTaskComplete;
window.deleteTask          = deleteTask;
window.confirmTask         = confirmTask;
