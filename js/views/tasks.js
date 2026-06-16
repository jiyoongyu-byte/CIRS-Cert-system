// js/views/tasks.js — 업무지시서 뷰

import { getState, getCurrentUser, setEditingTaskId, setCompletingTaskId,
         getEditingTaskId } from '../core/store.js';

// ── 업무지시서 렌더링 ─────────────────────────────────────────────
export function renderTasks() {
    const state       = getState();
    const currentUser = getCurrentUser();
    const ADMIN_USERS = window.ADMIN_USERS || ['지윤규','엄태호','유재용'];

    const badge = document.getElementById('taskUserBadge');
    const warn  = document.getElementById('taskLoginWarn');
    if (badge) badge.textContent = currentUser || '(이름 미선택)';
    if (warn)  warn.style.display = currentUser ? 'none' : '';

    const REP_USER = window.REP_USER || '대표이사';
    const isRep    = currentUser === REP_USER;
    const orderBtn = document.getElementById('taskOrderBtn');
    const collabBtn= document.getElementById('taskCollabBtn');
    // 대표이사도 업무지시 작성 가능
    if (orderBtn)  orderBtn.style.display  = currentUser ? '' : 'none';
    if (collabBtn) collabBtn.style.display = currentUser ? '' : 'none';

    const typeF  = document.getElementById('taskTypeFilter')?.value || '';
    const prioF  = document.getElementById('taskPrioFilter')?.value || '';
    const statF  = document.getElementById('taskStatusFilter')?.value || '';
    const sortBy = document.getElementById('taskSortSel')?.value || 'date';

    const REP_USER2 = window.REP_USER || '대표이사';
    const isRep2    = currentUser === REP_USER2;
    const userTeam  = getUserTeam(currentUser);
    let tasks = (state.tasks || []).filter(t => {
        // 대표이사: 본인이 작성한(from) 업무지시만 확인
        if (isRep2) return t.from === currentUser;
        if (currentUser && userTeam !== '관리자' && userTeam !== '열람전용') {
            if (t.team !== '공통' && t.team !== userTeam) return false;
        }
        if (typeF && (t.type || 'order') !== typeF) return false;
        if (prioF && t.priority !== prioF) return false;
        if (statF) {
            const done = !!t.completedDate;
            if (statF === '완료' && !done) return false;
            if (statF === '진행중' && done) return false;
        }
        return true;
    });

    tasks.sort((a, b) => {
        const ar = a.confirmedDate ? 2 : a.completedDate ? 1 : 0;
        const br = b.confirmedDate ? 2 : b.completedDate ? 1 : 0;
        if (ar !== br) return ar - br;
        if (sortBy === 'name') return (a.to || '').localeCompare(b.to || '', 'ko');
        return (b.date || '').localeCompare(a.date || '');
    });

    const container = document.getElementById('taskList');
    if (!container) return;
    if (!tasks.length) {
        container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:var(--text3)">
            ${!currentUser ? '로그인 후 이름을 선택하세요.' : '등록된 업무지시/협조요청이 없습니다.'}
        </div></div>`;
        return;
    }

    const PCOLOR = { '긴급':'var(--danger)', '일반':'var(--warn)', '낮음':'var(--success)' };
    const PLABEL = { '긴급':'🔴 긴급', '일반':'🟡 일반', '낮음':'🟢 낮음' };
    const today  = new Date().toISOString().slice(0, 10);

    container.innerHTML = tasks.map(t => {
        const isDone    = !!t.completedDate;
        const isOrder   = (t.type || 'order') === 'order';
        const pc        = PCOLOR[t.priority] || 'var(--text3)';
        const overdue   = !isDone && t.due && t.due < today;
        const canEdit   = ADMIN_USERS.includes(currentUser) || t.to === currentUser;
        const canDelete = ADMIN_USERS.includes(currentUser);
        const canComplete = currentUser && !isDone;

        return `<div class="card" style="margin-bottom:10px;border-left:4px solid ${isDone?'var(--border)':pc};opacity:${isDone?0.72:1}">
            <div style="padding:13px 15px">
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px">
                    <span style="font-size:11px;font-weight:700;color:${pc}">${PLABEL[t.priority]||t.priority}</span>
                    <span class="badge ${isOrder?'badge-cert':'badge-med'}" style="font-size:10px">
                        ${isOrder?'📋 업무지시':'🤝 협조요청'}
                    </span>
                    <span class="badge badge-gray" style="font-size:10px">${t.team||'공통'}</span>
                    ${overdue?'<span class="badge badge-red" style="font-size:10px">⚠ 기한초과</span>':''}
                    ${isDone?'<span class="badge badge-green" style="font-size:10px">✓ 완료</span>':''}
                    <span style="margin-left:auto;font-size:10px;color:var(--text3)">
                        지시일: ${t.date||'-'}${t.due?' | 기한: '+t.due:''}
                    </span>
                </div>
                <div style="${isDone?'text-decoration:line-through;color:var(--text3);':''}font-size:13px;font-weight:500;line-height:1.6;margin-bottom:7px;white-space:pre-wrap">${t.content||''}</div>
                <div style="display:flex;gap:14px;font-size:11px;color:var(--text3);margin-bottom:7px">
                    <span>📤 <strong style="color:var(--text2)">${t.from||'-'}</strong></span>
                    <span>📥 <strong style="color:${isDone?'var(--success)':'var(--accent)'}">${t.to||'-'}</strong></span>
                </div>
                ${isDone?`<div style="font-size:11px;padding:7px 11px;background:var(--success-light);border-radius:6px;color:var(--success);margin-bottom:7px">
                    ✅ 완료 (${t.completedDate}): ${t.completeNote||''}
                </div>`:''}
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    ${canComplete?`<button class="btn btn-cert btn-sm" onclick="openTaskComplete('${t.id}')">완료 보고</button>`:''}
                    ${isDone&&!t.confirmedDate&&ADMIN_USERS.includes(currentUser)
                        ?`<button class="btn btn-sm" style="border-color:var(--med);color:var(--med)" onclick="confirmTask('${t.id}')">✓ 관리자 확인</button>`:''}
                    ${t.confirmedDate?`<span style="font-size:10px;color:var(--text3)">확인: ${t.confirmedDate}</span>`:''}
                    ${canEdit&&!isDone?`<button class="btn btn-sm" onclick="openTaskEdit('${t.id}')">수정</button>`:''}
                    ${canDelete?`<button class="btn btn-sm btn-danger" onclick="deleteTask('${t.id}')">삭제</button>`:''}
                </div>
            </div>
        </div>`;
    }).join('');
}

function getUserTeam(user) {
    if (user === '지윤규') return '관리자';
    if (user === (window.REP_USER || '대표이사')) return '대표이사'; // 본인 작성만
    if (['유재용','윤미령','차상호','Zhao Lijie'].includes(user)) return '의료기기팀';
    if (['엄태호','Lyu Cuicui','박성재'].includes(user)) return '제품환경인증팀';
    return '관리자';
}

export function updateTaskToOptions(team) {
    const TEAM_MEMBERS = {
        '의료기기팀':     ['지윤규','유재용','윤미령','차상호','Zhao Lijie'],
        '제품환경인증팀': ['지윤규','엄태호','Lyu Cuicui','박성재'],
        '공통':           ['지윤규','유재용','윤미령','차상호','Zhao Lijie','엄태호','Lyu Cuicui','박성재'],
    };
    const members = TEAM_MEMBERS[team] || TEAM_MEMBERS['공통'];
    const sel = document.getElementById('task-to');
    if (!sel) return;
    const cur = getCurrentUser();
    sel.innerHTML = '<option value="">담당자 선택</option>' +
        members.filter(m => m !== cur).map(m => `<option value="${m}">${m}</option>`).join('');
}

export function openTaskEdit(id) {
    const t = getState().tasks?.find(x => x.id === id);
    if (!t) return;
    setEditingTaskId(id);
    const modal = document.getElementById('modal-task');
    if (!modal) return;
    modal.classList.add('open');
    document.getElementById('taskModalTitle')?.setAttribute('data-val', t.type === 'order' ? '📋 업무지시 수정' : '🤝 협조요청 수정');
    document.getElementById('task-type-hidden')?.setAttribute('value', t.type || 'order');
    ['task-from','task-date','task-due','task-content'].forEach(id => {
        const el = document.getElementById(id);
        const key = id.replace('task-','').replace('-','');
        if (el) el.value = t[id.replace('task-','')] || t[key] || '';
    });
    if (document.getElementById('task-team')) {
        document.getElementById('task-team').value = t.team || '공통';
        updateTaskToOptions(t.team || '공통');
    }
    if (document.getElementById('task-to'))       document.getElementById('task-to').value = t.to || '';
    if (document.getElementById('task-priority')) document.getElementById('task-priority').value = t.priority || '일반';
    if (document.getElementById('task-content'))  document.getElementById('task-content').value = t.content || '';
}

export function openTaskComplete(id) {
    setCompletingTaskId(id);
    document.getElementById('task-complete-date')?.setAttribute('value', new Date().toISOString().slice(0,10));
    if (document.getElementById('task-complete-date')) document.getElementById('task-complete-date').value = new Date().toISOString().slice(0,10);
    if (document.getElementById('task-complete-note')) document.getElementById('task-complete-note').value = '';
    document.getElementById('modal-task-complete')?.classList.add('open');
}

export async function deleteTask(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    const state = getState();
    state.tasks = state.tasks.filter(x => x.id !== id);
    const { saveState } = await import('../core/store.js');
    await saveState();
    renderTasks();
}

export async function confirmTask(id) {
    const t = getState().tasks?.find(x => x.id === id);
    if (!t) return;
    t.confirmedDate = new Date().toISOString().slice(0, 10);
    const { saveState } = await import('../core/store.js');
    await saveState();
    renderTasks();
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.renderTasks       = renderTasks;
window.updateTaskToOptions = updateTaskToOptions;
window.openTaskEdit      = openTaskEdit;
window.openTaskComplete  = openTaskComplete;
window.deleteTask        = deleteTask;
window.confirmTask       = confirmTask;
