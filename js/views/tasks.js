// js/views/tasks.js — 업무지시서 뷰 (work_orders 테이블 + 서버 함수 기반)
// 흐름: 지시 → 확인(수신자) → 처리완료(수신자) → 작업수행완료(지시자) 또는 반려(→ 수신자 재수행)

import { getState, getCurrentUser, setEditingTaskId, setCompletingTaskId } from '../core/store.js';
import { woTransition, woDelete, loadWorkOrders } from '../core/api.js';

const escAll = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escTxt = s => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');   // 저장 시 이미 정화된 본문용
const fmtDt  = iso => { try { return new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16); } catch (_) { return ''; } };
const todayKst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

const ST = {
    '지시':         { cls: 'badge-gray',  label: '🆕 지시' },
    '확인':         { cls: 'badge-med',   label: '👀 확인' },
    '처리완료':     { cls: 'badge-cert',  label: '📨 처리완료 · 확인 대기' },
    '작업수행완료': { cls: 'badge-green', label: '✅ 작업수행완료' },
    '반려':         { cls: 'badge-red',   label: '↩ 반려 · 재수행' },
    '수신자미처리': { cls: 'badge-amber', label: '🚫 수신자 미처리' },
};
const isClosed = t => t.status === '작업수행완료' || t.status === '수신자미처리';   // 종결 건
const isOpen   = t => t.status === '지시' || t.status === '확인' || t.status === '반려';   // 수신자가 처리해야 하는 상태

// 내가 할 수 있는 처리 (서버 함수의 규칙과 동일 — 최종 판단은 서버가 함)
function perms(t, me) {
    const SUPER = window.SUPER_ADMIN || '지윤규';
    const isTo = t.to === me;
    const own  = t.from === me || me === SUPER;
    return {
        ack:     isTo && t.status === '지시',
        report:  isTo && (t.status === '확인' || t.status === '반려'),
        approve: own  && (t.status === '처리완료' || t.status === '반려'),
        reject:  own  && t.status === '처리완료',
        edit:    own  && t.status !== '작업수행완료',
        missed:  own  && isOpen(t) && !!t.due && t.due < todayKst(),
        reopen:  own  && t.status === '수신자미처리',
        del:     me === SUPER,
    };
}

// 내가 처리할 건수: 수신자 — 새 지시·반려(재수행) / 지시자 — 처리완료(확인 대기)
function pendingCounts(tasks, me) {
    let toDo = 0, toReview = 0;
    (tasks || []).forEach(t => {
        if (t.to === me && (t.status === '지시' || t.status === '반려')) toDo++;
        if (t.from === me && t.status === '처리완료') toReview++;
    });
    return { toDo, toReview, total: toDo + toReview };
}

// 사이드바 '업무지시서' 메뉴 배지
export function updateTaskBadge() {
    const nav = document.getElementById('nav-item-tasks');
    if (!nav) return;
    const n = pendingCounts(getState().tasks, getCurrentUser()).total;
    let b = document.getElementById('taskBadge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) {
        b = document.createElement('span');
        b.id = 'taskBadge';
        b.className = 'badge badge-red';
        b.style.cssText = 'margin-left:auto;font-size:10px;font-weight:700';
        nav.appendChild(b);
    }
    b.textContent = n;
}

// ── 업무지시서 렌더링 ─────────────────────────────────────────────
export function renderTasks() {
    const state       = getState();
    const currentUser = getCurrentUser();

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

    // 열람 범위는 서버(RLS)가 이미 걸러서 내려줌 — 여기서는 화면 필터만 적용
    let tasks = (state.tasks || []).filter(t => {
        if (typeF && (t.type || 'order') !== typeF) return false;
        if (prioF && t.priority !== prioF)           return false;
        if (statF) {
            const done = isClosed(t);
            if (statF === '완료'   && !done) return false;
            if (statF === '진행중' && done)  return false;
        }
        return true;
    });

    tasks.sort((a, b) => {
        if (sortBy === 'name') return (a.to || '').localeCompare(b.to || '', 'ko');
        return (b.date || '').localeCompare(a.date || '');
    });

    const container = document.getElementById('taskList');
    if (!container) return;

    if (!tasks.length) {
        container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:32px;color:var(--text3)">
            ${!currentUser ? '로그인 후 이용하세요.' : '등록된 업무지시서/협조요청이 없습니다.'}
        </div></div>`;
        return;
    }

    const PCOLOR = { '긴급':'var(--danger)', '일반':'var(--warn)', '낮음':'var(--success)' };
    const PLABEL = { '긴급':'🔴 긴급', '일반':'🟡 일반', '낮음':'🟢 낮음' };
    const today  = todayKst();

    const card = t => {
        const st      = ST[t.status] || ST['지시'];
        const isDone  = isClosed(t);
        const isOrder = (t.type || 'order') === 'order';
        const pc      = PCOLOR[t.priority] || 'var(--text3)';
        const overdue = !isDone && t.due && t.due < today;
        const p       = perms(t, currentUser);
        const lines   = String(t.content || '').split('\n');
        const first   = lines[0].trim();
        const showBody = lines.length > 1 || first.length > 45;
        const hist    = t.history || [];
        const lastRej = [...hist].reverse().find(h => h.action === '반려');
        const lastMiss = t.status === '수신자미처리' ? [...hist].reverse().find(h => h.action === '수신자미처리') : null;

        const histBody = hist.map(h => `${fmtDt(h.at)} · ${escAll(h.actor_name)} · <b>${escAll(h.action)}</b>` +
            `${h.from_status && h.to_status && h.from_status !== h.to_status ? ` (${escAll(h.from_status)}→${escAll(h.to_status)})` : ''}` +
            `${h.note ? ` — ${escAll(h.note)}` : ''}`).join('<br>');

        // 기한 표시: 초과=빨강, 임박(오늘~D-2)=주황
        const dday  = t.due ? Math.round((Date.parse(t.due) - Date.parse(today)) / 86400000) : null;
        const soon  = !isDone && dday !== null && dday >= 0 && dday <= 2;
        const dueClr = overdue ? 'var(--danger)' : soon ? 'var(--warn)' : 'inherit';
        const dueTxt = t.due
            ? ` | 기한: <b style="color:${dueClr};font-weight:${overdue || soon ? 700 : 400}">${t.due}${overdue ? ' 기한초과' : soon ? (dday === 0 ? ' 오늘' : ' D-' + dday) : ''}</b>`
            : '';
        const btn = 'style="padding:2px 9px;font-size:11px"';

        return `<div class="card" style="margin-bottom:8px;border-left:4px solid ${isDone ? 'var(--border)' : pc};opacity:${isDone ? 0.78 : 1}">
            <div style="padding:8px 14px">
                <div style="display:flex;align-items:center;gap:10px">
                    <div style="flex:1;min-width:0;font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escAll(t.content)}">
                        📥 ${escAll(t.to)} · ${escTxt(first)}
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
                        <span style="font-size:11px;font-weight:700;color:${pc}">${PLABEL[t.priority] || escAll(t.priority)}</span>
                        <span class="badge ${isOrder ? 'badge-cert' : 'badge-med'}" style="font-size:10px">${isOrder ? '📋 업무지시' : '🤝 협조요청'}</span>
                        <span class="badge badge-gray" style="font-size:10px">${escAll(t.team || '공통')}</span>
                        <span class="badge ${st.cls}" style="font-size:10px">${st.label}</span>
                    </div>
                </div>
                ${showBody ? `<div onclick="toggleWoBody(this)" title="클릭하면 펼치기/접기" style="cursor:pointer;margin-top:3px;font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escTxt(t.content)}</div>` : ''}
                ${(t.status === '처리완료' || isDone) && t.completeNote ? `<div style="font-size:11px;padding:5px 10px;margin-top:5px;background:var(--success-light);border-radius:6px;color:var(--success)">
                    ${isDone ? `✅ 작업수행완료 (${t.completedDate})` : `📨 처리완료 보고 (${t.reportDate})`}: ${escAll(t.completeNote)}
                </div>` : ''}
                ${lastMiss ? `<div style="font-size:11px;padding:5px 10px;margin-top:5px;background:var(--danger-light);border-radius:6px;color:var(--danger)">
                    🚫 수신자 미처리 결정 (${fmtDt(lastMiss.at).slice(0, 10)}): ${escAll(lastMiss.note)}
                </div>` : ''}
                ${t.status === '반려' && lastRej ? `<div style="font-size:11px;padding:5px 10px;margin-top:5px;background:var(--danger-light);border-radius:6px;color:var(--danger)">
                    ↩ 반려 (${fmtDt(lastRej.at).slice(0, 10)}): ${escAll(lastRej.note)}
                </div>` : ''}
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:5px">
                    <span style="font-size:11px;color:var(--text3)">${escAll(t.from)} | 지시일: ${t.date || '-'}${dueTxt}</span>
                    <span style="margin-left:auto;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                        ${p.ack     ? `<button class="btn btn-cert btn-sm" ${btn} onclick="ackTask('${t.id}')">확인</button>` : ''}
                        ${p.report  ? `<button class="btn btn-cert btn-sm" ${btn} onclick="openTaskComplete('${t.id}')">처리완료 보고</button>` : ''}
                        ${p.approve ? `<button class="btn btn-cert btn-sm" ${btn} onclick="approveTask('${t.id}')">작업수행완료(승인)</button>` : ''}
                        ${p.reject  ? `<button class="btn btn-sm" style="padding:2px 9px;font-size:11px;border-color:var(--warn);color:var(--warn)" onclick="rejectTask('${t.id}')">↩ 반려</button>` : ''}
                        ${p.missed  ? `<button class="btn btn-sm" style="padding:2px 9px;font-size:11px;border-color:var(--warn);color:var(--warn)" onclick="markMissedTask('${t.id}')">처리하지 않음 결정</button>` : ''}
                        ${p.reopen  ? `<button class="btn btn-sm" ${btn} onclick="reopenTask('${t.id}')">다시 지시</button>` : ''}
                        ${p.edit    ? `<button class="btn btn-sm" ${btn} onclick="openTaskEdit('${t.id}')">수정</button>` : ''}
                        ${p.del     ? `<button class="btn btn-sm btn-danger" ${btn} onclick="deleteTask('${t.id}')">삭제</button>` : ''}
                        ${hist.length ? `<button class="btn btn-sm" style="padding:2px 9px;font-size:11px;color:var(--text3)" onclick="toggleWoEl('wo-h-${t.id}')">이력 ${hist.length}건</button>` : ''}
                    </span>
                </div>
                ${hist.length ? `<div id="wo-h-${t.id}" style="display:none;margin-top:6px;font-size:11px;line-height:1.8;color:var(--text2)">${histBody}</div>` : ''}
            </div>
        </div>`;
    };

    // ── 기한 내 진행건 / 기한경과 미완료 / 수행완료 3분할 ──
    const isDoneT = isClosed;
    const active  = tasks.filter(t => !isDoneT(t) && !(t.due && t.due < today));
    const ongoing = tasks.filter(t => !isDoneT(t) &&   t.due && t.due < today);
    const done    = tasks.filter(isDoneT);

    const col = (title, list, color) => `<div style="min-width:0">
        <div style="font-size:12px;font-weight:700;color:${color};margin-bottom:8px">${title} (${list.length})</div>
        ${list.length ? list.map(card).join('')
            : '<div class="card"><div style="padding:18px;text-align:center;font-size:12px;color:var(--text3)">해당 없음</div></div>'}
    </div>`;

    const pc = pendingCounts(state.tasks, currentUser);
    const banner = pc.total ? `<div class="card" style="margin-bottom:10px;border-left:4px solid var(--accent)">
        <div style="padding:10px 15px;font-size:13px;font-weight:700">
            내가 처리할 건: 확인·재수행 ${pc.toDo}건 / 완료 확인(승인·반려) ${pc.toReview}건
        </div></div>` : '';

    container.innerHTML = banner + active.map(card).join('') +
        ((ongoing.length || done.length) ? `
        <div style="margin:22px 0 12px;padding-top:16px;border-top:1px solid var(--border);font-size:14px;font-weight:700">
            작업지시 기한경과 및 수행결과
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:14px">
            ${col('작업수행이행중', ongoing, 'var(--danger)')}
            ${col('작업수행완료·종결', done,   'var(--success)')}
        </div>` : '');
    updateTaskBadge();
}

// ── 수신자 선택 옵션 업데이트 ─────────────────────────────────────
export function updateTaskToOptions(team, keep) {
    // 재직 구성원만 표시 (staff 테이블 기준), keep: 수정 시 기존 수신자 보존
    const S = window._staff;
    const members = !S ? [] :
        (team === '의료기기팀' || team === '제품환경인증팀') ? S.activeMembers(team, 'first') : S.allActive();
    const sel     = document.getElementById('task-to');
    if (!sel) return;
    const cur  = getCurrentUser();
    const list = members.filter(m => m !== cur);
    if (keep && !list.includes(keep)) list.push(keep);
    const lbl  = m => S ? S.label(m) : m;
    sel.innerHTML = '<option value="">담당자 선택</option>' +
        list.map(m => `<option value="${m}">${lbl(m)}</option>`).join('');
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
        updateTaskToOptions(t.team || '공통', t.to);
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

// ── 처리완료 보고 모달 열기 (완료일은 서버가 기록 → 날짜 입력칸 숨김) ──
export function openTaskComplete(id) {
    setCompletingTaskId(id);
    const dateEl = document.getElementById('task-complete-date');
    if (dateEl) { dateEl.value = ''; const g = dateEl.closest('.form-group'); if (g) g.style.display = 'none'; }
    if (document.getElementById('task-complete-note')) document.getElementById('task-complete-note').value = '';
    document.getElementById('modal-task-complete')?.classList.add('open');
}

// ── 서버 처리 후 목록 갱신 ───────────────────────────────────────
async function reloadAndRender() {
    getState().tasks = await loadWorkOrders();
    renderTasks();
}
async function run(fn) {
    try { await fn(); }
    catch (e) { alert(e?.message || '처리 중 오류가 발생했습니다.'); }
    try { await reloadAndRender(); } catch (e) { console.error('목록 갱신 실패:', e); }
}

export const ackTask = id => run(() => woTransition(id, '확인'));

export function approveTask(id) {
    if (!confirm('작업수행완료로 승인하시겠습니까?')) return;
    return run(() => woTransition(id, '작업수행완료'));
}

// 반려: 수행결과가 불충분하면 사유와 함께 수신자에게 재수행 요청
export function rejectTask(id) {
    const reason = prompt('반려 사유를 입력하세요.');
    if (!reason || !reason.trim()) return;
    return run(() => woTransition(id, '반려', reason.trim()));
}

// 기한이 지나도록 수신자가 처리하지 않은 건을 '수신자 미처리'로 종결 (사유 필수, 서버가 기한 경과 여부 재검증)
export function markMissedTask(id) {
    const reason = prompt('수신자 미처리로 종결합니다. 사유를 입력하세요.');
    if (!reason || !reason.trim()) return;
    return run(() => woTransition(id, '수신자미처리', reason.trim()));
}

// 종결된 '수신자 미처리' 건을 다시 '지시' 상태로 되돌림 (기한이 지났으면 수정에서 기한 변경 필요)
export function reopenTask(id) {
    if (!confirm('다시 지시 상태로 되돌리시겠습니까?\n(기한이 지났다면 수정에서 기한을 변경하세요)')) return;
    return run(() => woTransition(id, '재지시'));
}

// 로그인 직후 팝업: 내가 처리할 건 / 승인 대기 / 기한 지난 미처리(결정 필요) — 해당 건이 있을 때만 표시
export async function showTaskAlert() {
    const me = getCurrentUser();
    if (!me) return;
    try { getState().tasks = await loadWorkOrders(); } catch (e) { console.error('팝업용 지시서 조회 실패:', e); return; }
    const today   = todayKst();
    const tasks   = getState().tasks || [];
    const todo    = tasks.filter(t => t.to === me && isOpen(t));
    const review  = tasks.filter(t => t.from === me && t.status === '처리완료');
    const overdue = tasks.filter(t => t.from === me && isOpen(t) && t.due && t.due < today);
    if (!todo.length && !review.length && !overdue.length) return;

    const row = (t, who) => `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
        <b>${escAll(who)}</b> · ${escTxt(String(t.content || '').split('\n')[0].trim())}
        <span style="color:${t.due && t.due < today ? 'var(--danger)' : 'var(--text3)'}">(기한: ${t.due || '-'}${t.due && t.due < today ? ' 초과' : ''})</span></div>`;
    const sec = (title, list, whoOf) => list.length ? `<div style="margin-bottom:14px">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px">${title} (${list.length}건)</div>${list.map(t => row(t, whoOf(t))).join('')}</div>` : '';

    document.getElementById('task-alert-overlay')?.remove();
    const el = document.createElement('div');
    el.id = 'task-alert-overlay';
    el.className = 'modal-overlay open';
    el.innerHTML = `<div class="modal-wrapper"><div class="modal" style="max-width:520px">
        <div class="modal-header"><span class="modal-title">📢 확인이 필요한 업무지시서</span><button class="modal-close" onclick="closeTaskAlert()">×</button></div>
        <div class="modal-body" style="max-height:60vh;overflow-y:auto">
            ${sec('📥 내가 처리할 업무 (지시자)', todo, t => t.from)}
            ${sec('✅ 승인·반려 대기 (수신자)', review, t => t.to)}
            ${sec('⏰ 기한이 지나도록 처리되지 않음 (수신자) — 업무지시서에서 \'처리하지 않음 결정\' 가능', overdue, t => t.to)}
        </div>
        <div class="modal-footer"><button class="btn" onclick="closeTaskAlert()">닫기</button>
            <button class="btn btn-cert" onclick="closeTaskAlert();nav('tasks')">업무지시서로 이동</button></div>
    </div></div>`;
    document.body.appendChild(el);
}
export const closeTaskAlert = () => document.getElementById('task-alert-overlay')?.remove();

// 삭제: 목록에서만 숨기고 이력은 보존 (지윤규 전용)
export function deleteTask(id) {
    if (!confirm('삭제하시겠습니까? (목록에서 숨겨지며 이력은 보존됩니다)')) return;
    return run(() => woDelete(id));
}

// 카드 내용 한 줄 말줄임 ↔ 펼침 / 이력 펼침
export function toggleWoBody(el) {
    const open = el.dataset.open === '1';
    el.dataset.open = open ? '0' : '1';
    el.style.whiteSpace   = open ? 'nowrap' : 'pre-wrap';
    el.style.overflow     = open ? 'hidden' : 'visible';
    el.style.textOverflow = open ? 'ellipsis' : 'clip';
}
export function toggleWoEl(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.renderTasks         = renderTasks;
window.updateTaskToOptions = updateTaskToOptions;
window.openTaskEdit        = openTaskEdit;
window.openTaskComplete    = openTaskComplete;
window.deleteTask          = deleteTask;
window.rejectTask          = rejectTask;
window.ackTask             = ackTask;
window.approveTask         = approveTask;
window.updateTaskBadge     = updateTaskBadge;
window.markMissedTask      = markMissedTask;
window.reopenTask          = reopenTask;
window.showTaskAlert       = showTaskAlert;
window.closeTaskAlert      = closeTaskAlert;
window.toggleWoBody        = toggleWoBody;
window.toggleWoEl          = toggleWoEl;
