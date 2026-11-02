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
};

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
            const done = t.status === '작업수행완료';
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
        const isDone  = t.status === '작업수행완료';
        const isOrder = (t.type || 'order') === 'order';
        const pc      = PCOLOR[t.priority] || 'var(--text3)';
        const overdue = !isDone && t.due && t.due < today;
        const p       = perms(t, currentUser);
        const lines   = String(t.content || '').split('\n');
        const first   = lines[0].trim();
        const showBody = lines.length > 1 || first.length > 45;
        const hist    = t.history || [];
        const lastRej = [...hist].reverse().find(h => h.action === '반려');

        const histHtml = hist.length ? `<details style="margin-top:9px">
            <summary style="cursor:pointer;font-size:11px;color:var(--text3)">이력 ${hist.length}건</summary>
            <div style="margin-top:6px;font-size:11px;line-height:1.8;color:var(--text2)">
                ${hist.map(h => `${fmtDt(h.at)} · ${escAll(h.actor_name)} · <b>${escAll(h.action)}</b>` +
                    `${h.from_status && h.to_status && h.from_status !== h.to_status ? ` (${escAll(h.from_status)}→${escAll(h.to_status)})` : ''}` +
                    `${h.note ? ` — ${escAll(h.note)}` : ''}`).join('<br>')}
            </div></details>` : '';

        return `<div class="card" style="margin-bottom:10px;border-left:4px solid ${isDone ? 'var(--border)' : pc};opacity:${isDone ? 0.78 : 1}">
            <div style="padding:13px 15px">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">
                    <div style="flex:1;min-width:0;font-size:17px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escAll(t.content)}">
                        📥 ${escAll(t.to)} · ${escTxt(first)}
                    </div>
                    <span class="badge ${st.cls}" style="font-size:11px;white-space:nowrap">${st.label}</span>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
                    <span style="font-size:11px;font-weight:700;color:${pc}">${PLABEL[t.priority] || escAll(t.priority)}</span>
                    <span class="badge ${isOrder ? 'badge-cert' : 'badge-med'}" style="font-size:10px">${isOrder ? '📋 업무지시' : '🤝 협조요청'}</span>
                    <span class="badge badge-gray" style="font-size:10px">${escAll(t.team || '공통')}</span>
                    ${overdue ? '<span class="badge badge-red" style="font-size:10px">⚠ 기한초과</span>' : ''}
                    <span style="margin-left:auto;font-size:10px;color:var(--text3)">
                        📤 ${escAll(t.from)} | 지시일: ${t.date || '-'}${t.due ? ' | 기한: ' + t.due : ''}
                    </span>
                </div>
                ${showBody ? `<div style="font-size:13px;font-weight:500;line-height:1.6;margin-bottom:7px;white-space:pre-wrap">${escTxt(t.content)}</div>` : ''}
                ${(t.status === '처리완료' || isDone) && t.completeNote ? `<div style="font-size:11px;padding:7px 11px;background:var(--success-light);border-radius:6px;color:var(--success);margin-bottom:7px">
                    ${isDone ? `✅ 작업수행완료 (${t.completedDate})` : `📨 처리완료 보고 (${t.reportDate})`}: ${escAll(t.completeNote)}
                </div>` : ''}
                ${t.status === '반려' && lastRej ? `<div style="font-size:11px;padding:7px 11px;background:var(--danger-light);border-radius:6px;color:var(--danger);margin-bottom:7px">
                    ↩ 반려 (${fmtDt(lastRej.at).slice(0, 10)}): ${escAll(lastRej.note)}
                </div>` : ''}
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    ${p.ack     ? `<button class="btn btn-cert btn-sm" onclick="ackTask('${t.id}')">확인</button>` : ''}
                    ${p.report  ? `<button class="btn btn-cert btn-sm" onclick="openTaskComplete('${t.id}')">처리완료 보고</button>` : ''}
                    ${p.approve ? `<button class="btn btn-cert btn-sm" onclick="approveTask('${t.id}')">작업수행완료(승인)</button>` : ''}
                    ${p.reject  ? `<button class="btn btn-sm" style="border-color:var(--warn);color:var(--warn)" onclick="rejectTask('${t.id}')">↩ 반려</button>` : ''}
                    ${p.edit    ? `<button class="btn btn-sm" onclick="openTaskEdit('${t.id}')">수정</button>` : ''}
                    ${p.del     ? `<button class="btn btn-sm btn-danger" onclick="deleteTask('${t.id}')">삭제</button>` : ''}
                </div>
                ${histHtml}
            </div>
        </div>`;
    };

    // ── 기한 내 진행건 / 기한경과 미완료 / 수행완료 3분할 ──
    const isDoneT = t => t.status === '작업수행완료';
    const active  = tasks.filter(t => !isDoneT(t) && !(t.due && t.due < today));
    const ongoing = tasks.filter(t => !isDoneT(t) &&   t.due && t.due < today);
    const done    = tasks.filter(isDoneT);

    const col = (title, list, color) => `<div>
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
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            ${col('작업수행이행중', ongoing, 'var(--danger)')}
            ${col('작업수행완료',   done,    'var(--success)')}
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

// 삭제: 목록에서만 숨기고 이력은 보존 (지윤규 전용)
export function deleteTask(id) {
    if (!confirm('삭제하시겠습니까? (목록에서 숨겨지며 이력은 보존됩니다)')) return;
    return run(() => woDelete(id));
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
