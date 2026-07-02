// js/app.js — 로그인, 네비게이션, 설정, 권한 관리

import { setCurrentUser, setCurrentYear, setCurrentView, getCurrentYear, getCurrentUser,
         loadFromSupabase, saveState, getState, ensureRevYear } from './core/store.js';
import { savePw, initSb, loadPw, resetPw } from './core/api.js';
import { tt } from './core/utils.js';

const DEFAULT_PW   = 'cirs2026!';
const SUPER_ADMIN  = '지윤규';
const ADMIN_USERS  = ['지윤규','엄태호','유재용'];
const REP_USER     = '대표이사';
const EXECS        = ['대표이사', '지윤규']; // 전체 금액 열람 가능 권한자

const TEAM_USERS = {
    '의료기기팀':    ['유재용','윤미령','차상호','Zhao Lijie','지윤규'],
    '제품환경인증팀':['엄태호','Lyu Cuicui','박성재','지윤규'],
    '임원진':        ['지윤규','대표이사'],
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

// ── 팀 판별 헬퍼 ─────────────────────────────────────────────────
function getUserTeam(user) {
    if (['유재용','윤미령','차상호','Zhao Lijie'].includes(user)) return '의료기기팀';
    if (['엄태호','Lyu Cuicui','박성재'].includes(user))          return '제품환경인증팀';
    if (user === REP_USER)                                         return '열람전용'; // 대표이사: 전팀 열람 가능, 수정 불가
    return '관리자'; // 지윤규
}

// ── 사이드바 네비게이션 항목 팀별 표시/숨김 ──────────────────────
function applyNavVisibility(user) {
    const team   = getUserTeam(user);
    const showMed  = team === '관리자' || team === '열람전용' || team === '의료기기팀';
    const showCert = team === '관리자' || team === '열람전용' || team === '제품환경인증팀';

    ['nav-label-med','nav-item-medC','nav-item-medCons','nav-item-medDone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = showMed ? '' : 'none';
    });
    ['nav-label-cert','nav-item-certC','nav-item-certCons','nav-item-certDone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = showCert ? '' : 'none';
    });
    // 지윤규 전용: 3년 전략기획 및 보고서 생성 메뉴
    const isAdmin = user === SUPER_ADMIN;
    ['nav-item-strategy', 'nav-item-report'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isAdmin ? '' : 'none';
    });
}

// ── 대표이사: 현재 화면의 추가/수정 버튼 숨김 ─────────────────────
function applyRepRestrictions(viewName) {
    if (getCurrentUser() !== REP_USER) return;
    const target = document.getElementById(`view-${viewName}`);
    if (!target) return;
    // section-head 내 버튼(추가/수정 등) 모두 숨김
    target.querySelectorAll('.section-head button').forEach(btn => {
        btn.style.display = 'none';
    });
}

// ── 자동 로그아웃 (20분 비활동 시 경고 → 로그아웃) ─────────────────
const IDLE_TIMEOUT = 20 * 60 * 1000; // 20분 (ms)
const WARN_BEFORE  =  2 * 60 * 1000; // 로그아웃 2분 전 경고

let _idleWarnTimer        = null;
let _idleLogoutTimer      = null;
let _idleCountdownIv      = null;
let _idleWarningVisible   = false;

// 경고 모달 DOM 생성 (최초 1회)
function _createIdleModal() {
    if (document.getElementById('idle-warning-overlay')) return;
    const el = document.createElement('div');
    el.id = 'idle-warning-overlay';
    el.style.cssText = 'display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);align-items:center;justify-content:center';
    el.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:36px 32px;max-width:380px;width:90%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.3)">
            <div style="font-size:40px;margin-bottom:10px">⏱️</div>
            <h3 style="margin:0 0 8px;font-size:18px;color:#1F3864">자동 로그아웃 예정</h3>
            <p style="margin:0 0 4px;font-size:14px;color:#555">장시간 활동이 없어 곧 로그아웃됩니다.</p>
            <div id="idle-countdown" style="font-size:32px;font-weight:700;color:#C00000;margin:16px 0">2:00</div>
            <button onclick="window.resetAutoLogout()"
                style="background:#1F3864;color:#fff;border:none;border-radius:8px;padding:11px 0;font-size:15px;font-weight:600;cursor:pointer;width:100%">
                계속 사용하기
            </button>
        </div>`;
    document.body.appendChild(el);
}

function _showIdleWarning() {
    _idleWarningVisible = true;
    const overlay = document.getElementById('idle-warning-overlay');
    if (overlay) overlay.style.display = 'flex';

    let remaining = WARN_BEFORE;
    clearInterval(_idleCountdownIv);

    const tick = () => {
        remaining -= 1000;
        const el = document.getElementById('idle-countdown');
        if (el) {
            const m = Math.floor(remaining / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            el.textContent = `${m}:${String(s).padStart(2, '0')}`;
        }
        if (remaining <= 0) clearInterval(_idleCountdownIv);
    };
    tick(); // 즉시 표시
    _idleCountdownIv = setInterval(tick, 1000);
}

function _hideIdleWarning() {
    _idleWarningVisible = false;
    const overlay = document.getElementById('idle-warning-overlay');
    if (overlay) overlay.style.display = 'none';
    clearInterval(_idleCountdownIv);
}

function _startIdleTimers() {
    clearTimeout(_idleWarnTimer);
    clearTimeout(_idleLogoutTimer);
    // 18분 후 경고 표시
    _idleWarnTimer = setTimeout(_showIdleWarning, IDLE_TIMEOUT - WARN_BEFORE);
    // 20분 후 자동 로그아웃
    _idleLogoutTimer = setTimeout(() => {
        _hideIdleWarning();
        doLogout();
        alert('⏱️ 장시간 비활동으로 자동 로그아웃되었습니다.');
    }, IDLE_TIMEOUT);
}

export function resetAutoLogout() {
    if (!getCurrentUser()) return; // 로그아웃 상태 무시
    _hideIdleWarning();
    _startIdleTimers();
}

function initAutoLogout() {
    _createIdleModal();
    ['mousemove', 'click', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
        document.addEventListener(evt, resetAutoLogout, { passive: true });
    });
    _startIdleTimers();
}

function stopAutoLogout() {
    clearTimeout(_idleWarnTimer);
    clearTimeout(_idleLogoutTimer);
    clearInterval(_idleCountdownIv);
    _hideIdleWarning();
    ['mousemove', 'click', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
        document.removeEventListener(evt, resetAutoLogout);
    });
}

// ── 로그인 ────────────────────────────────────────────────────────
export async function doLogin() {
    const user = document.getElementById('loginUser')?.value;
    const pw   = document.getElementById('loginPw')?.value;
    const err  = document.getElementById('loginErr');

    if (!user) {
        if (err) err.textContent = '이름을 선택해주세요.';
        return;
    }

    initSb();
    const state = getState();
    try {
        await loadPw(state, user);
    } catch (_) {}

    if (pw !== (state.pw || DEFAULT_PW)) {
        if (err) err.textContent = '비밀번호가 일치하지 않습니다.';
        return;
    }
    if (err) err.textContent = '';
    setCurrentUser(user);

    document.getElementById('loginScreen').style.display  = 'none';
    document.getElementById('appShell').style.display     = 'flex';
    const sb = document.getElementById('sidebarUser');
    if (sb) sb.textContent = user + ' 님 환영합니다';

    // 연도 셀렉트 초기화 (사이드바 + 보고서 모달)
    const curY = new Date().getFullYear();
    ['yearSelect', 'rep-year'].forEach(id => {
        const sel = document.getElementById(id);
        if (sel && !sel.options.length) {
            for (let i = curY + 2; i >= 2020; i--) {
                const o = document.createElement('option');
                o.value = i; o.textContent = i + '년';
                if (i === curY) o.selected = true;
                sel.appendChild(o);
            }
        }
    });

    // 환율 복원
    const savedRmb = localStorage.getItem('cirs_rmb_rate');
    const savedUsd = localStorage.getItem('cirs_usd_rate');
    if (savedRmb) { const e = document.getElementById('rmbRateInput'); if (e) e.value = savedRmb; }
    if (savedUsd) { const e = document.getElementById('usdRateInput'); if (e) e.value = savedUsd; }

    const ok = await loadFromSupabase();
    if (!ok) console.warn('Supabase 연결 실패 — 로컬 모드로 진행');

    // qualData 동기화
    window._store?.syncQualData?.(QUAL_MASTER);

    // 팀별 사이드바 표시 제어
    applyNavVisibility(user);

    // 자동 로그아웃 타이머 시작
    initAutoLogout();

    nav('dashboard');
}

export function doLogout() {
    stopAutoLogout(); // 타이머 및 이벤트 리스너 정리
    setCurrentUser('');
    document.getElementById('appShell').style.display  = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginPw').value = '';
}

// ── 연도 변경 ────────────────────────────────────────────────────
export function changeYear() {
    const y = parseInt(document.getElementById('yearSelect')?.value);
    setCurrentYear(y);
    ensureRevYear(y);
    // window._currentView를 우선 사용 (nav()에서 확실히 세팅됨)
    const v = window._currentView || getCurrentView?.() || 'dashboard';
    renderView(v);
}

// ── 환율 변경 ─────────────────────────────────────────────────────
export function onExchangeRateChange() {
    const r = document.getElementById('rmbRateInput')?.value;
    const u = document.getElementById('usdRateInput')?.value;
    if (r) localStorage.setItem('cirs_rmb_rate', r);
    if (u) localStorage.setItem('cirs_usd_rate', u);
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
    await savePw(nw, currentUser);
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

    const titles = {
        dashboard:'전체 현황', orgchart:'조직도', revenue:'수입계획 및 실적',
        medContract:'의료기기팀 · 계약업체', medConsult:'의료기기팀 · 상담',
        medDone:'의료기기팀 · 완료대장',
        certContract:'제품환경인증팀 · 계약업체', certConsult:'제품환경인증팀 · 상담',
        certDone:'제품환경인증팀 · 완료대장',
        strategy:'3년 전략기획 (2027~2029)', kpi:'KPI 현황', tasks:'업무지시서',
    };
    const tb = document.getElementById('topbarTitle');
    if (tb) tb.textContent = titles[viewName] || viewName;

    const rateBox = document.getElementById('rateInputBox');
    if (rateBox) rateBox.style.display = ['dashboard','revenue'].includes(viewName) ? 'flex' : 'none';

    renderView(viewName);

    // 대표이사: 추가/수정 버튼 숨김 (렌더링 이후 적용)
    applyRepRestrictions(viewName);

    // 검색 필터 적용 (렌더링 이후)
    applySearchFilter(viewName);
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
    if (v === 'strategy'     && window.renderStrategy)     window.renderStrategy();  // 3년 전략기획 뷰
    if (v === 'kpi'          && window.renderKpi)          window.renderKpi();
    if (v === 'tasks'        && window.renderTasks)        window.renderTasks();
}

// ── 검색 필터: 현재 뷰 테이블 행 필터링 ──────────────────────────
window._searchFilter = '';

function applySearchFilter(viewName) {
    const q      = (window._searchFilter || '').trim().toLowerCase();
    const view   = document.getElementById(`view-${viewName}`);
    if (!view) return;

    // 배너 생성 (없으면)
    let banner = document.getElementById('searchFilterBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'searchFilterBanner';
        banner.style.cssText = 'display:none;align-items:center;gap:10px;padding:8px 14px;margin-bottom:12px;background:var(--surface);border:1px solid var(--accent);border-radius:8px;font-size:13px;';
        document.getElementById('mainContent')?.prepend(banner);
    }

    if (!q) {
        banner.style.display = 'none';
        view.querySelectorAll('tbody tr').forEach(tr => tr.style.display = '');
        return;
    }

    // 배너 표시
    banner.style.display = 'flex';
    banner.innerHTML = `<span style="color:var(--accent)">🔍 검색 필터:</span>
        <strong style="color:var(--text1)">${window._searchFilter}</strong>
        <button class="btn btn-sm" onclick="clearSearchFilter()" style="margin-left:6px;border-color:var(--danger);color:var(--danger)">× 전체 보기</button>`;

    // 행 필터링: 모든 td 텍스트에서 검색어 포함 여부
    view.querySelectorAll('tbody tr').forEach(tr => {
        const text = Array.from(tr.querySelectorAll('td')).map(td => td.textContent).join(' ').toLowerCase();
        tr.style.display = text.includes(q) ? '' : 'none';
    });
}

function clearSearchFilter() {
    window._searchFilter = '';
    const banner = document.getElementById('searchFilterBanner');
    if (banner) banner.style.display = 'none';
    const v = window._currentView;
    if (v) {
        window.renderView?.(v);
        document.getElementById(`view-${v}`)?.querySelectorAll('tbody tr').forEach(tr => tr.style.display = '');
    }
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.doLogin          = doLogin;
window._doLogin         = doLogin;
window.doLogout         = doLogout;
window.resetAutoLogout  = resetAutoLogout;
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
window.EXECS            = EXECS;          // ['대표이사', '지윤규']
window.getUserTeam      = getUserTeam;    // 팀 판별 헬퍼 (다른 모듈에서 사용)
window.QUAL_MASTER        = QUAL_MASTER;
window.applyNavVisibility = applyNavVisibility;
window.applySearchFilter  = applySearchFilter;
window.clearSearchFilter  = clearSearchFilter;
