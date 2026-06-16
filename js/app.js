// js/app.js — 로그인, 네비게이션, 설정 (기존 구조 유지)

import { setCurrentUser, setCurrentYear, setCurrentView, getCurrentView, getCurrentYear,
         loadFromSupabase, saveState, getState, ensureRevYear } from './core/store.js';
import { savePw, initSb, loadPw, resetPw } from './core/api.js';
import { tt } from './core/utils.js';

const DEFAULT_PW   = 'cirs2026!';
const SUPER_ADMIN  = '지윤규';
const ADMIN_USERS  = ['지윤규','엄태호','유재용'];
const REP_USER     = '대표이사';  // 업무지시 작성 가능, 본인 지시만 확인
const TEAM_USERS   = {
    '제품환경인증팀':['엄태호','Lyu Cuicui','박성재'],
    '의료기기팀':    ['유재용','윤미령','차상호','Zhao Lijie'],
    '제품인증부문이사': ['지윤규'],
'대표이사': ['대표이사'],
};
const QUAL_MASTER = {
    '지윤규': [
        {name:'내부감사원',date:'2022-03-02',edu:null,org:'CIRS Group Korea',remark:'전사 공통'},
        {name:'화장품 책임판매관리자 / 화장품 제조판매업 등록필증',date:'2019-10-23',edu:{cycle:'매년',note:'보수교육 필수'},org:'식품의약품안전처',remark:'제품환경인증팀 업무'},
    ],
    '엄태호': [
        {name:'내부감사원',date:'2023-04-30',edu:null,org:'CIRS Group Korea',remark:'전사 공통'},
        {name:'의료기기품질책임자 / 의료기기 수입업 허가증',date:'2023-04-17',edu:{cycle:'매년',note:'보수교육 1회/년'},org:'식품의약품안전처',remark:'의료기기팀 업무'},
    ],
    '차상호': [
        {name:'수입업신고증 (의약외품 제조·수입 관리자)',date:'2023-09-05',edu:null,org:'식품의약품안전처',remark:'의료기기팀 업무'},
    ],
};

// ── 로그인 (팀 선택 → 사용자 선택 → 비번) ────────────────────────
export async function doLogin() {
    const user = document.getElementById('loginUser')?.value;
    const pw   = document.getElementById('loginPw')?.value;
    const err  = document.getElementById('loginErr');

    if (!user) {
        if (err) err.textContent = '이름을 선택해주세요.';
        return;
    }

    // Supabase에서 저장된 비밀번호 먼저 로드 후 검증
    initSb();
    const state = getState();
    try {
        await loadPw(state, user);  // 개인별 비번 로드
    } catch (_) {}

    if (pw !== (state.pw || DEFAULT_PW)) {
        if (err) err.textContent = '비밀번호가 일치하지 않습니다.';
        return;
    }
    if (err) err.textContent = '';
    setCurrentUser(user);
localStorage.setItem('cirs_user', user);

    document.getElementById('loginScreen').style.display  = 'none';
    document.getElementById('appShell').style.display     = 'flex';
    const sb = document.getElementById('sidebarUser');
    if (sb) sb.textContent = user + ' 님 환영합니다';

    // 연도 셀렉트 초기화
    const ySel = document.getElementById('yearSelect');
    if (ySel && !ySel.options.length) {
        const y = new Date().getFullYear();
        for (let i = y + 2; i >= 2020; i--) {
            const o = document.createElement('option');
            o.value = i; o.textContent = i + '년';
            if (i === y) o.selected = true;
            ySel.appendChild(o);
        }
    }

    // 환율 복원
    const savedRmb = localStorage.getItem('cirs_rmb_rate');
    const savedUsd = localStorage.getItem('cirs_usd_rate');
    if (savedRmb) { const e = document.getElementById('rmbRateInput'); if (e) e.value = savedRmb; }
    if (savedUsd) { const e = document.getElementById('usdRateInput'); if (e) e.value = savedUsd; }

    const ok = await loadFromSupabase();
    if (!ok) console.warn('Supabase 연결 실패 — 로컬 모드로 진행');

    // qualData 동기화
    window._store?.syncQualData?.(QUAL_MASTER);

    nav('dashboard');
}

export function doLogout() {
    setCurrentUser('');
    localStorage.removeItem('cirs_user');
    document.getElementById('appShell').style.display  = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginPw').value = '';
}

// ── 연도 변경 ────────────────────────────────────────────────────
export function changeYear() {
    const y = parseInt(document.getElementById('yearSelect')?.value);
    setCurrentYear(y);
    ensureRevYear(y);
    renderView(getCurrentView?.() || 'dashboard');
}

// ── 환율 변경 ────────────────────────────────────────────────────
export function onExchangeRateChange() {
    const r = document.getElementById('rmbRateInput')?.value;
    const u = document.getElementById('usdRateInput')?.value;
    if (r) localStorage.setItem('cirs_rmb_rate', r);
    if (u) localStorage.setItem('cirs_usd_rate', u);
    // 환율 의존 뷰 갱신
    const view = window._currentView || 'dashboard';
    if (['dashboard','revenue'].includes(view)) renderView(view);
}

// ── 비밀번호 변경 ─────────────────────────────────────────────────
export async function changePw() {
    const cur  = document.getElementById('pw-current')?.value;
    const nw   = document.getElementById('pw-new')?.value;
    const conf = document.getElementById('pw-confirm')?.value;
    const msg  = document.getElementById('pw-msg');
    const state = getState();
    const currentUser = getCurrentUser();

    if (cur !== state.pw) { if (msg) msg.textContent = '현재 비밀번호가 틀립니다.'; return; }
    if (!nw || nw.length < 6) { if (msg) msg.textContent = '6자 이상 입력하세요.'; return; }
    if (nw !== conf) { if (msg) msg.textContent = '새 비밀번호가 일치하지 않습니다.'; return; }

    state.pw = nw;
    await savePw(nw, currentUser);  // 개인별 저장
    if (msg) { msg.style.color = 'var(--success)'; msg.textContent = '✅ 변경되었습니다.'; }
    setTimeout(() => window.closeModal?.('settings'), 1200);
}

// SUPER_ADMIN 전용: 타인 비번 초기화
export async function resetUserPw(targetUser) {
    if (getCurrentUser() !== SUPER_ADMIN) {
        alert('권한이 없습니다.');
        return;
    }
    if (!confirm(`${targetUser}의 비밀번호를 초기화(cirs2026!)하시겠습니까?`)) return;
    await resetPw(targetUser);
    alert(`✅ ${targetUser} 비밀번호가 초기화되었습니다.`);
}

// ── 데이터 내보내기 ───────────────────────────────────────────────
export function exportData() {
    const state = getState();
    const blob = new Blob(
        [JSON.stringify({ exportDate: new Date().toISOString(), ...state }, null, 2)],
        { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = 'cirs_backup.json'; a.click();
}

// ── 언어 전환 ─────────────────────────────────────────────────────
export function toggleLang() {
    const html = document.documentElement;
    const isKo = html.lang !== 'zh';
    html.lang = isKo ? 'zh' : 'ko';
    document.querySelectorAll('[data-ko]').forEach(el => {
        el.textContent = isKo ? el.dataset.zh : el.dataset.ko;
    });
}

// ── 네비게이션 ────────────────────────────────────────────────────
export function nav(viewName, element = null) {
    window._currentView = viewName;
    setCurrentView?.(viewName);

    document.querySelectorAll('.view').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    const target = document.getElementById(`view-${viewName}`);
    if (target) { target.style.display = 'block'; target.classList.add('active'); }

    if (element) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
    }

    // topbar 타이틀
    const titles = {
        dashboard:'전체 현황', revenue:'수입계획 및 실적',
        medContract:'의료기기팀 · 계약업체', medConsult:'의료기기팀 · 상담', medDone:'의료기기팀 · 완료대장',
        certContract:'제품환경인증팀 · 계약업체', certConsult:'제품환경인증팀 · 상담', certDone:'제품환경인증팀 · 완료대장',
        kpi:'KPI 현황', tasks:'업무지시서',
    };
    const tb = document.getElementById('topbarTitle');
    if (tb) tb.textContent = titles[viewName] || viewName;

    // 환율 입력란
    const rateBox = document.getElementById('rateInputBox');
    if (rateBox) rateBox.style.display = ['dashboard','revenue'].includes(viewName) ? 'flex' : 'none';

    renderView(viewName);
}

export function renderView(v) {
    if (v === 'dashboard'    && window.renderDashboard)    window.renderDashboard();
    if (v === 'revenue'      && window.renderRevenue)      window.renderRevenue();
    if (v === 'medContract'  && window.renderMedContract)  window.renderMedContract();
    if (v === 'medConsult'   && window.renderMedConsult)   window.renderMedConsult();
    if (v === 'medDone'      && window.renderMedDone)      window.renderMedDone();
    if (v === 'certContract' && window.renderCertContract) window.renderCertContract();
    if (v === 'certConsult'  && window.renderCertConsult)  window.renderCertConsult();
    if (v === 'certDone'     && window.renderCertDone)     window.renderCertDone();
    if (v === 'kpi'          && window.renderKpi)          window.renderKpi();
    if (v === 'tasks'        && window.renderTasks)        window.renderTasks();
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.doLogin          = doLogin;
window._doLogin         = doLogin;  // 인라인 loginClick용
window.doLogout         = doLogout;
window.nav              = nav;
window.changeYear       = changeYear;
window.onExchangeRateChange = onExchangeRateChange;
window.changePw         = changePw;
window.exportData       = exportData;
window.resetUserPw      = resetUserPw;
window.toggleLang       = toggleLang;
window.renderView       = renderView;
window.ADMIN_USERS      = ADMIN_USERS;
window.SUPER_ADMIN      = SUPER_ADMIN;
window.REP_USER         = REP_USER;
window.QUAL_MASTER      = QUAL_MASTER;

// 새로고침 시 자동 로그인
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('cirs_user');
    if (savedUser) {
        const loginUser = document.getElementById('loginUser');
        if (loginUser) {
            loginUser.innerHTML = `<option value="${savedUser}">${savedUser}</option>`;
            loginUser.value = savedUser;
        }
        const loginPw = document.getElementById('loginPw');
        if (loginPw) loginPw.value = 'auto';
        // 저장된 비번으로 자동 로그인
        setTimeout(async () => {
            initSb();
            const state = getState();
            await loadPw(state, savedUser);
            setCurrentUser(savedUser);
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('appShell').style.display = 'flex';
            const sb = document.getElementById('sidebarUser');
            if (sb) sb.textContent = savedUser + ' 님 환영합니다';
            const ySel = document.getElementById('yearSelect');
            if (ySel && !ySel.options.length) {
                const y = new Date().getFullYear();
                for (let i = y + 2; i >= 2020; i--) {
                    const o = document.createElement('option');
                    o.value = i; o.textContent = i + '년';
                    if (i === y) o.selected = true;
                    ySel.appendChild(o);
                }
            }
            const savedRmb = localStorage.getItem('cirs_rmb_rate');
            const savedUsd = localStorage.getItem('cirs_usd_rate');
            if (savedRmb) { const e = document.getElementById('rmbRateInput'); if (e) e.value = savedRmb; }
            if (savedUsd) { const e = document.getElementById('usdRateInput'); if (e) e.value = savedUsd; }
            await loadFromSupabase();
            window._store?.syncQualData?.(QUAL_MASTER);
            nav('dashboard');
        }, 500);
    }
});
// 로그인 이벤트 바인딩은 index.html 인라인 스크립트에서 처리
// 연도 셀렉트 초기화는 doLogin() 내부에서 처리
