// js/views/monthly-report.js — 월간 실적보고 (팀별·월별 작성 → 제출 → Word 출력)
// - 수치는 계약·상담 데이터에서 자동 집계, 사유·추진업무·계획·연간예상 수정값만 사람이 입력
// - 권한: 지윤규(양 팀) / 각 팀 재직 구성원(자기 팀, 제출 포함) / 대표이사(제출완료 열람·다운로드)
// - 컨설팅 이익 = 청구액 − 지출비용(공장심사·시험·출장·기타 비용·정산)

import { getState, getCurrentUser, getCurrentYear } from '../core/store.js';
import { toKRW } from '../core/utils.js';
import { loadMonthlyReports, saveMonthlyReport, logAudit } from '../core/api.js';

const TEAM_NAME = { med: '의료기기팀', cert: '제품환경인증팀' };
const SUPER = '지윤규', REP = '대표이사';

let reports = {};             // id → monthly_reports 행
let sel = { team: '', y: 0, m: 0 };
let draft = null;             // 편집 중인 보고서

// ── 공통 유틸 ────────────────────────────────────────────────────
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const K   = n => Math.round(Number(n || 0) / 1000);                 // 원 → 천원
const fk  = n => K(n).toLocaleString('ko-KR');                       // 천원 표기
const pct = (a, b) => b > 0 ? (a / b * 100).toFixed(1) + '%' : '-';
const ymOf = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const next = (y, m) => m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
const inYM = (d, y, m) => !!d && d.slice(0, 7) === ymOf(y, m);
const yOf  = d => d ? Number(d.slice(0, 4)) : 0;
const mOf  = d => d ? Number(d.slice(5, 7)) : 0;
const qOf  = m => Math.floor((m - 1) / 3) + 1;
const uid  = () => Math.random().toString(36).slice(2, 10);

// ── 권한 ─────────────────────────────────────────────────────────
export function roleOf(user, team) {
    if (user === SUPER) return 'edit';
    if (user === REP)   return 'view';
    const S = window._staff;
    if (S && S.teamOf(user) === TEAM_NAME[team] && S.isActive(user)) return 'edit';
    return 'none';
}
const allowedTeams = user => ['med', 'cert'].filter(t => roleOf(user, t) !== 'none');

// ── 레코드 해석 (팀별 필드 차이 흡수) ─────────────────────────────
function fieldOf(team, r) {
    if (team === 'med') {
        const g = r.grade || '';
        if (g.startsWith('중국') || /NMPA/i.test(g)) return '중국';
        if (g.startsWith('한국') || /KGMP|MFDS/i.test(g)) return '한국';
        return g || '기타';
    }
    return r.certtype === '기타' ? (r.certtypeRaw || '기타') : (r.certtype || '기타');
}
function contentOf(team, r) {
    if (team === 'med') {
        const l1 = r.stage || r.biztype || '';
        const l2 = [r.product, r.grade ? `(${r.grade})` : ''].filter(Boolean).join(' ');
        return [l1, l2].filter(Boolean).join(' / ');
    }
    const name = r.certtype === '기타' ? (r.certtypeRaw || '기타') : (r.certtype || '');
    return [name ? `${name} 인증` : '', r.etcMemo || r.consultItem || ''].filter(Boolean).join(' / ');
}
const contractDate = (team, r) => team === 'med' ? (r.startdate || '') : (r.contractdate || '');
const consultDate  = (team, r) => team === 'med' ? (r.startdate || '') : (r.date || '');
const isActiveContract = (team, r) => team === 'med'
    ? (r.status !== '완료' && r.status !== '취소') : (r.stage !== '완료');
const stageOf = (team, r) => team === 'med' ? (r.progress || r.status || '') : (r.stage || '');

// 청구 내역 (계약 1건 → 최대 5행)
function billingLines(team, rows) {
    const out = [];
    rows.filter(r => r.recordType === 'contract').forEach(r => {
        (r.billing || []).forEach((amt, i) => {
            const date = (r.billingDates || [])[i] || '';
            const cur  = (r.billingCurrencies || [])[i] || 'KRW';
            if (!Number(amt) || !date) return;
            out.push({ r, date, krw: toKRW(Number(amt), cur, date), amt: Number(amt), cur });
        });
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
}
// 지출 내역 (지출일 미입력 시 계약일 기준, 경고 표시)
function expenseLines(team, rows) {
    const out = [];
    rows.filter(r => r.recordType === 'contract').forEach(r => {
        const base = contractDate(team, r);
        [['공장심사비', r.expAudit, r.expAuditDate], ['제품시험비', r.expTest, r.expTestDate], ['출장비', r.expTrip, r.expTripDate]]
            .forEach(([label, amt, d]) => {
                if (!Number(amt)) return;
                out.push({ r, label, kind: '비용', krw: Number(amt), date: d || base, undated: !d });
            });
        (r.expExtra || []).forEach(x => {
            if (!Number(x.amount)) return;
            out.push({ r, label: x.label || '기타', kind: x.kind === '정산' ? '정산' : '비용', krw: Number(x.amount),
                       date: x.date || base, undated: !x.date });
        });
    });
    return out;
}

// ── 보고서 수치 집계 ─────────────────────────────────────────────
export function computeReport(team, y, m) {
    const state = getState();
    const rows  = state[team] || [];
    const rev   = state.revenue?.[y]?.[team] || {};
    const qT    = [1, 2, 3, 4].map(q => Number(rev['q' + q] || 0));
    const monthTarget = mm => Math.round(qT[qOf(mm) - 1] / 3);
    const annualTarget = qT.reduce((s, v) => s + v, 0);
    const profitTarget = Number(rev.profitTarget || 0);

    const bills = billingLines(team, rows);
    const exps  = expenseLines(team, rows);
    const sumBills = (mf, mt, yy = y) => bills.filter(b => yOf(b.date) === yy && mOf(b.date) >= mf && mOf(b.date) <= mt).reduce((s, b) => s + b.krw, 0);
    const sumExps  = (mf, mt, yy = y) => exps.filter(e => yOf(e.date) === yy && mOf(e.date) >= mf && mOf(e.date) <= mt).reduce((s, e) => s + e.krw, 0);

    const monthly = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, target: monthTarget(i + 1), actual: sumBills(i + 1, i + 1) }));
    let ct = 0, ca = 0;
    monthly.forEach(x => { ct += x.target; ca += x.actual; x.cumTarget = ct; x.cumActual = ca; });

    const curQ = qOf(m);
    const quarters = [1, 2, 3, 4].slice(0, curQ).map(q => {
        const mf = q * 3 - 2, mt = Math.min(q * 3, m);
        const sales = sumBills(mf, mt), cost = sumExps(mf, mt);
        return { q, target: qT[q - 1], sales, profit: sales - cost };
    });
    const cumSales  = sumBills(1, m);
    const cumProfit = cumSales - sumExps(1, m);

    const toLine = b => ({ field: fieldOf(team, b.r), client: b.r.client, krw: b.krw, content: contentOf(team, b.r), month: mOf(b.date), date: b.date });
    const qStart = curQ * 3 - 2;
    const quarterLines = bills.filter(b => yOf(b.date) === y && mOf(b.date) >= qStart && mOf(b.date) <= m).map(toLine);
    const monthLines   = bills.filter(b => inYM(b.date, y, m)).map(toLine);

    const nx = next(y, m);
    const consults = rows.filter(r => r.recordType === 'consult');
    const expectedNext = consults.filter(r => !r.archived && r.expectedMonth === ymOf(nx.y, nx.m) && Number(r.expectedAmount) > 0);
    const nextBilling = [
        ...bills.filter(b => inYM(b.date, nx.y, nx.m)).map(b => ({ ...toLine(b), note: '' })),
        ...expectedNext.map(r => ({ field: fieldOf(team, r), client: r.client, krw: Number(r.expectedAmount), content: contentOf(team, r), note: '계약 예정' })),
    ];
    const contractsNext = expectedNext.map(r => ({ field: fieldOf(team, r), client: r.client, krw: Number(r.expectedAmount), content: contentOf(team, r) }));

    const newContracts = rows.filter(r => r.recordType === 'contract' && inYM(contractDate(team, r), y, m)).map(r => ({
        field: fieldOf(team, r), client: r.client, content: contentOf(team, r),
        krw: toKRW(Number(r.amount || 0), r.amountCurrency || 'KRW', contractDate(team, r)),
        due: r.duedate || '', date: contractDate(team, r), manager: r.manager || '',
    }));
    const consultLines = consults.filter(r => inYM(consultDate(team, r), y, m)).map(r => ({
        field: fieldOf(team, r), client: r.client, location: r.location || '',
        krw: Number(r.quoteAmount || 0) || Number(r.expectedAmount || 0), content: contentOf(team, r), prob: r.winProb || '',
    }));
    const inProgress = rows.filter(r => r.recordType === 'contract' && isActiveContract(team, r)).map(r => {
        const total = toKRW(Number(r.amount || 0), r.amountCurrency || 'KRW', contractDate(team, r));
        // 잔금 = 계약금액 − 보고월 말까지 청구된 금액 (이후 청구예정분은 잔금에 포함)
        const endYM = ymOf(y, m);
        const paid  = (r.billing || []).reduce((s, v, i) => {
            const bd = (r.billingDates || [])[i] || '';
            return bd && bd.slice(0, 7) <= endYM ? s + toKRW(Number(v || 0), (r.billingCurrencies || [])[i] || 'KRW', bd) : s;
        }, 0);
        return { field: fieldOf(team, r), client: r.client, remain: Math.max(0, total - paid), content: contentOf(team, r),
                 due: (r.duedate || '').slice(0, 7), stage: stageOf(team, r) };
    }).sort((a, b) => a.field.localeCompare(b.field, 'ko') || a.client.localeCompare(b.client, 'ko'));

    const undatedExp = exps.filter(e => e.undated).length;

    return {
        team, teamName: TEAM_NAME[team], y, m, nx,
        monthActual: monthly[m - 1].actual, cumSales, cumTarget: monthly[m - 1].cumTarget,
        annualTarget, profitTarget, cumProfit, quarters, monthly,
        quarterLines, monthLines, nextBilling, newContracts, contractsNext, consultLines, inProgress,
        undatedExp,
    };
}

// ── 연간 예상 기본값 (청구예정일 + 계약 예정 상담 + 정산 예정) ────────
export function defaultForecast(team, y, m) {
    const state = getState();
    const rows  = state[team] || [];
    const out   = [];
    rows.filter(r => r.recordType === 'contract').forEach(r => {
        let revenue = 0;
        (r.billing || []).forEach((amt, i) => {
            const d = (r.billingDates || [])[i] || '';
            if (Number(amt) && yOf(d) === y && mOf(d) > m) revenue += toKRW(Number(amt), (r.billingCurrencies || [])[i] || 'KRW', d);
        });
        // 향후 예상 비용(참고 비용) 비율로 이익 추정
        const amtKRW = toKRW(Number(r.amount || 0), r.amountCurrency || 'KRW', contractDate(team, r));
        const ref = Number(r.refAudit || 0) + Number(r.refFee || 0) + (r.refExtra || []).reduce((s, x) => s + Number(x.amount || 0), 0);
        const ratio = amtKRW > 0 ? Math.min(Math.max(ref / amtKRW, 0), 1) : 0;
        // 남은 기간 지출 예정(지출일이 미래인 비용·정산)
        const futureCost = expenseLines(team, [r]).filter(e => !e.undated && yOf(e.date) === y && mOf(e.date) > m).reduce((s, e) => s + e.krw, 0);
        if (revenue > 0 || futureCost > 0) {
            out.push({ id: uid(), label: `${r.client}${r.product || r.etcMemo ? ' (' + (r.product || r.etcMemo) + ')' : ''}`,
                       revenue: Math.round(revenue), profit: Math.round(revenue * (1 - ratio) - futureCost), note: '' });
        }
    });
    rows.filter(r => r.recordType === 'consult' && !r.archived && Number(r.expectedAmount) > 0 && r.expectedMonth
                && Number(r.expectedMonth.slice(0, 4)) === y && Number(r.expectedMonth.slice(5, 7)) > m)
        .forEach(r => out.push({ id: uid(), label: `${r.client} *${Number(r.expectedMonth.slice(5, 7))}월 계약 예정`,
                                 revenue: Number(r.expectedAmount), profit: Number(r.expectedAmount), note: '계약 예정' }));
    return out.sort((a, b) => b.revenue - a.revenue);
}

// ── 화면 ─────────────────────────────────────────────────────────
export async function renderMonthlyReport() {
    const box = document.getElementById('mrBody');
    if (!box) return;
    const user  = getCurrentUser();
    const teams = allowedTeams(user);
    if (!teams.length) { box.innerHTML = '<div class="card"><div class="card-body">열람 권한이 없습니다.</div></div>'; return; }
    const y = getCurrentYear();
    if (!sel.team || !teams.includes(sel.team)) sel.team = teams[0];
    if (sel.y !== y) { sel.y = y; sel.m = 0; }
    reports = {};
    (await loadMonthlyReports(y)).forEach(r => { reports[r.id] = r; });

    const role = roleOf(user, sel.team);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const rowOf = mm => reports[`${sel.team}-${ymOf(y, mm)}`];
    box.innerHTML = `
      <div class="card" style="margin-bottom:16px"><div class="card-body" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        ${teams.map(t => `<button class="team-tab ${t === sel.team ? 'active-' + t : ''}" onclick="mrSelectTeam('${t}')">${TEAM_NAME[t]}</button>`).join('')}
        <span style="font-size:12px;color:var(--text3);margin-left:auto">${y}년 · ${role === 'view' ? '제출완료 보고서만 열람 가능' : '작성·제출 가능'}</span>
      </div></div>
      <div class="card" style="margin-bottom:16px"><div class="card-body" style="padding:0"><div class="table-wrap"><table id="mrListTable">
        <thead><tr><th>월</th><th>상태</th><th>최종 수정</th><th>제출</th><th></th></tr></thead>
        <tbody>${months.map(mm => {
            const r = rowOf(mm);
            const st = r?.status || '미작성';
            const visible = role === 'edit' || st === '제출완료';
            const badge = st === '제출완료' ? 'badge-green' : st === '작성중' ? 'badge-amber' : '';
            return `<tr style="${mm === sel.m ? 'background:var(--surface)' : ''}">
              <td style="font-weight:700">${mm}월</td>
              <td>${badge ? `<span class="badge ${badge}">${st}</span>` : `<span style="color:var(--text3)">${st}</span>`}</td>
              <td style="font-size:12px">${r ? esc(r.updated_by) + ' · ' + esc((r.updated_at || '').slice(0, 10)) : ''}</td>
              <td style="font-size:12px">${r?.submitted_at ? esc(r.submitted_by) + ' · ' + esc(r.submitted_at.slice(0, 10)) : ''}</td>
              <td style="white-space:nowrap">${visible ? `<button class="btn btn-sm" onclick="mrOpen(${mm})">${role === 'edit' ? (r ? '열기·수정' : '작성') : '열람'}</button>
                ${r ? `<button class="btn btn-sm btn-primary" onclick="mrDownload(${mm})">Word</button>` : ''}` : ''}</td>
            </tr>`;
        }).join('')}</tbody></table></div></div></div>
      <div id="mrEditor"></div>`;
    if (sel.m) mrOpen(sel.m);
}

export function mrSelectTeam(t) { sel.team = t; sel.m = 0; draft = null; renderMonthlyReport(); }

function emptyRow(team, y, m) {
    return { id: `${team}-${ymOf(y, m)}`, team, ym: ymOf(y, m), doc_no: '', reason: '', plans_done: [], plans_next: [],
             forecast: [], status: '작성중', updated_by: '', submitted_by: '', submitted_at: null };
}

export function mrOpen(m) {
    sel.m = m;
    const { team, y } = sel;
    const role = roleOf(getCurrentUser(), team);
    const saved = reports[`${team}-${ymOf(y, m)}`];
    if (role === 'view' && saved?.status !== '제출완료') return;
    draft = JSON.parse(JSON.stringify(saved || emptyRow(team, y, m)));
    // 전월 계획 → 당월 추진업무 초안
    if (!saved || !draft.plans_done.length) {
        const pm = m === 1 ? null : reports[`${team}-${ymOf(y, m - 1)}`];
        if (pm?.plans_next?.length) draft.plans_done = pm.plans_next.map(p => ({ ...p }));
    }
    if (m >= 9 && !draft.forecast.length) draft.forecast = defaultForecast(team, y, m);
    renderEditor();
}

function planTable(key, ro) {
    const rows = draft[key] || [];
    const cols = [['cat', '구분', 90], ['sub', '세부', 80], ['content', '내용', 0], ['owner', '담당자', 90], ['when', '일정', 80], ['note', '비고', 80]];
    return `<div class="table-wrap"><table style="font-size:12px"><thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}${ro ? '' : '<th></th>'}</tr></thead>
      <tbody>${rows.length ? rows.map((r, i) => `<tr>${cols.map(([f, , w]) => `<td>${ro ? esc(r[f]) :
          f === 'content' ? `<textarea class="form-textarea" style="min-height:44px;font-size:12px" oninput="mrSetPlan('${key}',${i},'${f}',this.value)">${esc(r[f])}</textarea>`
          : `<input class="form-input" style="font-size:12px;padding:6px;${w ? 'width:' + w + 'px' : ''}" value="${esc(r[f])}" oninput="mrSetPlan('${key}',${i},'${f}',this.value)">`}</td>`).join('')}
          ${ro ? '' : `<td><button class="btn btn-sm btn-danger" onclick="mrDelPlan('${key}',${i})">✕</button></td>`}</tr>`).join('')
        : `<tr><td colspan="7" style="text-align:center;color:var(--text3)">없음</td></tr>`}</tbody></table></div>
      ${ro ? '' : `<button class="btn btn-sm" style="margin-top:6px" onclick="mrAddPlan('${key}')">+ 행 추가</button>`}`;
}

function renderEditor() {
    const el = document.getElementById('mrEditor');
    if (!el || !draft) return;
    const { team, y, m } = sel;
    const role = roleOf(getCurrentUser(), team);
    const ro = role !== 'edit' || draft.status === '제출완료';
    const d = computeReport(team, y, m);
    const fc = draft.forecast || [];
    const fcRev = fc.reduce((s, r) => s + Number(r.revenue || 0), 0);
    const fcPro = fc.reduce((s, r) => s + Number(r.profit || 0), 0);
    el.innerHTML = `
    <div class="card"><div class="card-body">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        <div style="font-size:16px;font-weight:800">${m}월 ${TEAM_NAME[team]} 업무 실적보고</div>
        <span class="badge ${draft.status === '제출완료' ? 'badge-green' : 'badge-amber'}">${draft.status}</span>
        <div style="margin-left:auto;display:flex;gap:8px">
          ${role === 'edit' && draft.status !== '제출완료' ? `<button class="btn" onclick="mrSave(false)">💾 저장</button><button class="btn btn-success" onclick="mrSave(true)">📤 제출</button>` : ''}
          ${role === 'edit' && draft.status === '제출완료' ? `<button class="btn" onclick="mrUnsubmit()">↩ 제출 취소</button>` : ''}
          <button class="btn btn-primary" onclick="mrDownload(${m})">⬇ Word</button>
        </div>
      </div>
      <div class="table-wrap"><table style="font-size:12px"><thead><tr><th>${m}월 수입실적</th><th>'${String(y).slice(2)}년 수입누계</th><th>누적 목표(~${m}월)</th><th>누적 달성률</th><th>연간 목표</th><th>연간 달성률</th><th>누적 컨설팅 이익</th></tr></thead>
        <tbody><tr><td>${fk(d.monthActual)}</td><td>${fk(d.cumSales)}</td><td>${fk(d.cumTarget)}</td><td>${pct(d.cumSales, d.cumTarget)}</td><td>${fk(d.annualTarget)}</td><td>${pct(d.cumSales, d.annualTarget)}</td><td>${fk(d.cumProfit)}</td></tr></tbody></table></div>
      <div style="font-size:11px;color:var(--text3);margin:4px 0 14px">단위: 천원 (VAT 별도) · 계약·상담 데이터에서 자동 집계${d.undatedExp ? ` · <span style="color:var(--warn)">지출일 미입력 비용 ${d.undatedExp}건은 계약일 기준으로 반영</span>` : ''}</div>

      <div class="form-grid">
        <div class="form-group"><label class="form-label">문서번호</label><input class="form-input" id="mr-docno" ${ro ? 'disabled' : ''} value="${esc(draft.doc_no)}" placeholder="예: CIRS26-0"></div>
        <div class="form-group full"><label class="form-label">달성률 사유 (실적 초과 근거 · 미진 사유 및 대안 · 연간 예상 사유)</label>
          <textarea class="form-textarea" id="mr-reason" style="min-height:110px" ${ro ? 'disabled' : ''}>${esc(draft.reason)}</textarea></div>
      </div>

      <div class="section-sub" style="margin-top:14px">7. ${m}월 추진업무 ${m > 1 ? '<span style="font-size:11px;color:var(--text3)">(전월 계획에서 자동 반영 · 수정 가능)</span>' : ''}</div>
      ${planTable('plans_done', ro)}
      <div class="section-sub" style="margin-top:14px">8. ${d.nx.m}월 계획</div>
      ${planTable('plans_next', ro)}

      ${m >= 9 ? `<div class="section-sub" style="margin-top:14px">10. 연간 예상 (${m + 1 <= 12 ? (m + 1) + '~12월 예상분' : '연말 확정'}) <span style="font-size:11px;color:var(--text3)">청구예정일·계약 예정 상담 기준 자동 계산 · 금액 수정 가능 (원 단위 입력)</span></div>
        <div class="table-wrap"><table style="font-size:12px"><thead><tr><th>업체명 (품목)</th><th>예상 매출(원)</th><th>예상 컨설팅 이익(원)</th><th>비고</th>${ro ? '' : '<th></th>'}</tr></thead><tbody>
        ${fc.map((r, i) => `<tr>
          <td>${ro ? esc(r.label) : `<input class="form-input" style="font-size:12px;padding:6px" value="${esc(r.label)}" oninput="mrSetFc(${i},'label',this.value)">`}</td>
          <td>${ro ? Number(r.revenue || 0).toLocaleString() : `<input class="form-input text-mono" type="number" style="font-size:12px;padding:6px;width:130px" value="${Number(r.revenue || 0)}" onchange="mrSetFc(${i},'revenue',this.value)">`}</td>
          <td>${ro ? Number(r.profit || 0).toLocaleString() : `<input class="form-input text-mono" type="number" style="font-size:12px;padding:6px;width:130px" value="${Number(r.profit || 0)}" onchange="mrSetFc(${i},'profit',this.value)">`}</td>
          <td>${ro ? esc(r.note) : `<input class="form-input" style="font-size:12px;padding:6px;width:110px" value="${esc(r.note)}" oninput="mrSetFc(${i},'note',this.value)">`}</td>
          ${ro ? '' : `<td><button class="btn btn-sm btn-danger" onclick="mrDelFc(${i})">✕</button></td>`}</tr>`).join('')}
        <tr style="font-weight:700"><td>예상분 합계</td><td>${fcRev.toLocaleString()}</td><td>${fcPro.toLocaleString()}</td><td colspan="2"></td></tr>
        <tr style="font-weight:700"><td>연간 예상 (누적 + 예상분)</td><td>${(Math.round(d.cumSales) + fcRev).toLocaleString()} (${pct(d.cumSales + fcRev, d.annualTarget)})</td>
          <td>${(Math.round(d.cumProfit) + fcPro).toLocaleString()}${d.profitTarget ? ` (${pct(d.cumProfit + fcPro, d.profitTarget)})` : ''}</td><td colspan="2"></td></tr>
        </tbody></table></div>
        ${ro ? '' : `<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-sm" onclick="mrAddFc()">+ 행 추가</button>
          <button class="btn btn-sm" onclick="mrResetFc()">↻ 자동값 다시 계산</button></div>`}` : ''}
      <div style="font-size:11px;color:var(--text3);margin-top:14px">그 밖의 항목(분기 실적, 업체별 수입실적, 예상 청구, 신규 계약, 계약 예정, 상담, 진행업무, 참조표)은 Word 출력 시 자동 작성됩니다.</div>
    </div></div>`;
}

function syncInputs() {
    if (!draft) return;
    const dn = document.getElementById('mr-docno'); if (dn && !dn.disabled) draft.doc_no = dn.value.trim();
    const rs = document.getElementById('mr-reason'); if (rs && !rs.disabled) draft.reason = rs.value;
}
export function mrSetPlan(k, i, f, v) { draft[k][i][f] = v; }
export function mrAddPlan(k) { syncInputs(); draft[k].push({ cat: '', sub: '', content: '', owner: '', when: '', note: '' }); renderEditor(); }
export function mrDelPlan(k, i) { syncInputs(); draft[k].splice(i, 1); renderEditor(); }
export function mrSetFc(i, f, v) { draft.forecast[i][f] = (f === 'revenue' || f === 'profit') ? Math.round(Number(v) || 0) : v; if (f !== 'label' && f !== 'note') { syncInputs(); renderEditor(); } }
export function mrAddFc() { syncInputs(); draft.forecast.push({ id: uid(), label: '', revenue: 0, profit: 0, note: '' }); renderEditor(); }
export function mrDelFc(i) { syncInputs(); draft.forecast.splice(i, 1); renderEditor(); }
export function mrResetFc() {
    if (!confirm('연간 예상 표를 자동 계산값으로 다시 채웁니다. 수정한 금액은 사라집니다. 진행할까요?')) return;
    syncInputs(); draft.forecast = defaultForecast(sel.team, sel.y, sel.m); renderEditor();
}

export async function mrSave(submit) {
    const user = getCurrentUser();
    if (!draft || roleOf(user, sel.team) !== 'edit') return;
    syncInputs();
    if (submit) {
        if (!draft.reason.trim()) { alert('달성률 사유를 입력해야 제출할 수 있습니다.'); return; }
        if (!confirm(`${sel.m}월 ${TEAM_NAME[sel.team]} 실적보고를 제출합니다. 제출 후에는 대표이사가 열람할 수 있습니다.`)) return;
    }
    const now = new Date().toISOString();
    const row = { ...draft, updated_by: user, updated_at: now };
    if (submit) Object.assign(row, { status: '제출완료', submitted_by: user, submitted_at: now });
    try { await saveMonthlyReport(row); } catch (e) { alert('❌ 저장 실패\n\n' + (e?.message || e)); return; }
    await logAudit(submit ? '월간보고 제출' : '월간보고 저장', row.id, user);
    reports[row.id] = row;
    await renderMonthlyReport();
}
export async function mrUnsubmit() {
    const user = getCurrentUser();
    if (!draft || roleOf(user, sel.team) !== 'edit') return;
    if (!confirm('제출을 취소하고 작성중 상태로 되돌립니다.')) return;
    const row = { ...draft, status: '작성중', submitted_by: '', submitted_at: null, updated_by: user, updated_at: new Date().toISOString() };
    try { await saveMonthlyReport(row); } catch (e) { alert('❌ 실패\n\n' + (e?.message || e)); return; }
    await logAudit('월간보고 제출취소', row.id, user);
    await renderMonthlyReport();
}

// ── Word 출력 ────────────────────────────────────────────────────
async function ensureDocx() {
    if (window.docx) return;
    for (const url of ['https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js', 'https://unpkg.com/docx@8.5.0/build/index.umd.js']) {
        try {
            await new Promise((res, rej) => { const s = document.createElement('script'); s.src = url; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
            if (window.docx) return;
        } catch (_) { /* 다음 CDN */ }
    }
    throw new Error('Word 생성 라이브러리를 불러올 수 없습니다. 인터넷 연결을 확인해 주세요.');
}

export async function mrDownload(m) {
    const { team, y } = sel;
    const user = getCurrentUser();
    const role = roleOf(user, team);
    let row = (draft && sel.m === m) ? (syncInputs(), draft) : reports[`${team}-${ymOf(y, m)}`];
    if (!row) return;
    if (role === 'none' || (role === 'view' && row.status !== '제출완료')) return;
    if (m >= 9 && !(row.forecast || []).length) row = { ...row, forecast: defaultForecast(team, y, m) };
    try {
        await ensureDocx();
        const blob = await buildDocx(computeReport(team, y, m), row);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${y}년 ${m}월 ${TEAM_NAME[team]} 업무 실적보고.docx`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { alert('❌ Word 생성 실패\n\n' + (e?.message || e)); }
}

export async function buildDocx(d, row) {
    const D = window.docx;
    const { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, VerticalAlign,
            Packer, BorderStyle, ShadingType, ImageRun, PageBreak, TableLayoutType } = D;
    const PAGE_W = 9900;   // A4 본문 폭(twip, 좌우 여백 1000 제외)
    const F = 'Malgun Gothic';
    const t = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: F, size: o.size || 19, bold: !!o.bold, color: o.color });
    const p = (text, o = {}) => new Paragraph({ children: String(text ?? '').split('\n').flatMap((ln, i) => i ? [new TextRun({ break: 1 }), t(ln, o)] : [t(ln, o)]),
                                                alignment: o.align || AlignmentType.LEFT, spacing: { before: o.before || 0, after: o.after ?? 60 } });
    const C = AlignmentType.CENTER, R = AlignmentType.RIGHT, L = AlignmentType.LEFT;
    const cell = (text, o = {}) => new TableCell({
        children: [p(text, { align: o.align || C, bold: o.bold, size: o.size || 18, after: 0 })],
        verticalAlign: VerticalAlign.CENTER, columnSpan: o.span, rowSpan: o.rowSpan,
        shading: o.bg ? { type: ShadingType.CLEAR, fill: o.bg, color: 'auto' } : undefined,
        width: o.w ? { size: Math.round(PAGE_W * o.w / 100), type: WidthType.DXA } : undefined,
        margins: { top: 50, bottom: 50, left: 80, right: 80 },
    });
    const H = (text, o = {}) => cell(text, { ...o, bold: true, bg: 'E7E6E6' });
    const table = (header, body, widths) => {
        const w = widths || header.map(() => 100 / header.length);
        return new Table({
            width: { size: PAGE_W, type: WidthType.DXA }, layout: TableLayoutType.FIXED,
            columnWidths: w.map(x => Math.round(PAGE_W * x / 100)),
            rows: [new TableRow({ tableHeader: true, children: header.map((h, i) => H(h, { w: w[i] })) }), ...body],
        });
    };
    const row_ = cells => new TableRow({ children: cells });
    const title = text => p(text, { bold: true, size: 26, before: 260, after: 100 });
    const sub   = text => p('□ ' + text, { bold: true, size: 21, before: 160, after: 40 });
    const unit  = () => p('단위 : 천원 (VAT 별도)', { align: R, size: 16, after: 30 });
    const none  = n => row_([cell('해당 없음', { span: n })]);
    const yy = String(d.y).slice(2);

    // 레터헤드 로고
    let logo = null;
    try { const res = await fetch('./images/logo.png'); if (res.ok) logo = new Uint8Array(await res.arrayBuffer()); } catch (_) {}
    const head = [
        new Paragraph({ alignment: C, children: [
            ...(logo ? [new ImageRun({ data: logo, transformation: { width: 120, height: 34 } }), t('  ')] : []),
            t('㈜씨아이알에스그룹코리아', { size: 32, bold: true, color: '1F3864' })] }),
        p('07547, 서울시 강서구 양천로 583 우림블루나인비즈니스센터 2305호, 02-6347-8842, 02-6347-8811', { align: C, size: 16, after: 200 }),
    ];
    // 결재란 + 문서 정보
    const draftDate = (row.submitted_at || new Date().toISOString()).slice(0, 10).replace(/-/g, '. ') + '.';
    const meta = new Table({ width: { size: PAGE_W, type: WidthType.DXA }, layout: TableLayoutType.FIXED,
        columnWidths: [15, 35, 6, 14, 30].map(x => Math.round(PAGE_W * x / 100)), rows: [
        row_([cell('문서번호', { bold: true, w: 15 }), cell(row.doc_no || '', { align: L, w: 35 }), cell('결\n\n재', { bold: true, rowSpan: 4, w: 6 }),
              cell('대표이사', { w: 14 }), cell('', { w: 30 })]),
        row_([cell('기안일자', { bold: true }), cell(draftDate, { align: L }), cell('이 사'), cell('')]),
        row_([cell('수    신', { bold: true }), cell('내부결재', { align: L }), cell('팀 장'), cell('')]),
        row_([cell('참    조', { bold: true }), cell('', { align: L }), cell('담 당'), cell(row.submitted_by || '')]),
        row_([cell('제    목', { bold: true }), cell(`${d.m}월 ${d.teamName} 업무 실적보고`, { align: L, span: 4, bold: true })]),
    ] });
    const sum = table([`${d.m}월\n수입실적`, `'${yy}년\n수입누계`, `월간누적 목표\n(~${d.m}월)`, '누적\n달성률(%)', '연간 목표', '연간\n달성률(%)', '비고'],
        [row_([cell(fk(d.monthActual)), cell(fk(d.cumSales)), cell(fk(d.cumTarget)), cell(pct(d.cumSales, d.cumTarget)),
               cell(fk(d.annualTarget)), cell(pct(d.cumSales, d.annualTarget)), cell('-')])]);
    const reasonBox = new Table({ width: { size: PAGE_W, type: WidthType.DXA }, layout: TableLayoutType.FIXED,
        columnWidths: [18, 82].map(x => Math.round(PAGE_W * x / 100)), rows: [
        row_([H('달성률 사유', { w: 18 }), cell(row.reason || '', { align: L, w: 82 })]) ] });

    // 1. 분기 실적
    const qs = d.quarters;
    const q1 = table(['구분', ...qs.map(q => `${q.q}분기`), `1~${qs.length}Q 누적`], [
        row_([cell('매출'), ...qs.map(q => cell(fk(q.sales), { align: R })), cell(fk(d.cumSales), { align: R, bold: true })]),
        row_([cell('컨설팅 이익'), ...qs.map(q => cell(fk(q.profit), { align: R })), cell(fk(d.cumProfit), { align: R, bold: true })]),
    ]);
    const q2 = table(['구분', `${d.y}년\n매출목표`, `1~${qs.length}Q 매출`, '매출\n달성률(%)', `1~${qs.length}Q\n컨설팅 이익`, '이익 목표', '이익\n달성률(%)'], [
        row_([cell(d.teamName), cell(fk(d.annualTarget), { align: R }), cell(fk(d.cumSales), { align: R }), cell(pct(d.cumSales, d.annualTarget)),
              cell(fk(d.cumProfit), { align: R }), cell(d.profitTarget ? fk(d.profitTarget) : '-', { align: R }), cell(pct(d.cumProfit, d.profitTarget))])]);
    const lineTable = (lines, withMonth) => {
        const body = lines.map(l => row_([cell(l.field), cell(l.client), cell(fk(l.krw), { align: R }), cell(l.content, { align: L }),
                                          cell(withMonth ? `${l.month}월` : (l.note || '-'))]));
        const total = lines.reduce((s, l) => s + l.krw, 0);
        return table(['분야', '업체명', '청구금액', '계약내용', '비 고'],
            [...(body.length ? body : [none(5)]), row_([cell(`총계 ${lines.length}건`, { span: 2, bold: true }), cell(fk(total), { align: R, bold: true }), cell('', { span: 2 })])],
            [12, 20, 14, 42, 12]);
    };

    const sec = [];
    sec.push(title('1. ' + qOf(d.m) + '분기 실적'), sub(`${d.y}. ${qOf(d.m)}Q 부문별 실적 (${d.teamName})`), unit(), q1,
             sub(`${d.y}년 목표 및 달성 현황`), unit(), q2,
             sub(`${qOf(d.m)}분기 업체별 수입실적 (${qOf(d.m) * 3 - 2}~${d.m}월)`), unit(), lineTable(d.quarterLines, true));
    sec.push(title(`2. ${d.m}월 업무별 수입실적`), unit(), lineTable(d.monthLines, false));
    sec.push(title(`3. ${d.nx.m}월 예상 금액(청구)`), unit(), lineTable(d.nextBilling, false));
    const nc = d.newContracts;
    sec.push(title(`4. 신규 계약(${d.m}월)`), unit(), table(['분야', '업체명', '계약금액', '계약내용', '종료\n예정', '비 고'],
        [...(nc.length ? nc.map(c => row_([cell(c.field), cell(c.client), cell(fk(c.krw), { align: R }), cell(c.content, { align: L }),
            cell(c.due ? c.due.slice(2, 7).replace('-', '.') : '-'), cell(c.date ? `'${c.date.slice(2).replace(/-/g, '.')}\n계약` : '-')])) : [none(6)]),
         row_([cell(`총계 ${nc.length}건`, { span: 2, bold: true }), cell(fk(nc.reduce((s, c) => s + c.krw, 0)), { align: R, bold: true }), cell('', { span: 3 })])],
        [11, 18, 13, 38, 9, 11]));
    const cn = d.contractsNext;
    sec.push(title(`5. ${d.nx.m}월 계약 예정`), unit(), table(['분야', '업체명', '예정금액', '계약내용', '비 고'],
        [...(cn.length ? cn.map(c => row_([cell(c.field), cell(c.client), cell(fk(c.krw), { align: R }), cell(c.content, { align: L }), cell('-')])) : [none(5)]),
         row_([cell(`총계 ${cn.length}건`, { span: 2, bold: true }), cell(fk(cn.reduce((s, c) => s + c.krw, 0)), { align: R, bold: true }), cell('', { span: 2 })])],
        [12, 20, 14, 42, 12]));
    const cs = d.consultLines;
    sec.push(title(`6. 상담 업무(${d.m}월)`), unit(), table(['분야', '업체명', '소재지', '제안금액', '상담내용', '계약\n가능성'],
        cs.length ? cs.map(c => row_([cell(c.field), cell(c.client), cell(c.location || '-'), cell(c.krw ? fk(c.krw) : '-', { align: R }), cell(c.content, { align: L }), cell(c.prob || '-')])) : [none(6)],
        [11, 19, 9, 12, 39, 10]));
    const planRows = rows => rows.length ? rows.map(r => row_([cell(r.cat || ''), cell(r.sub || ''), cell(r.content || '', { align: L }), cell(r.owner || ''), cell(r.when || ''), cell(r.note || '-')])) : [none(6)];
    sec.push(title(`7. ${d.m}월 추진업무`), table(['구분', '세부', '내용', '담당자', '일정', '비고'], planRows(row.plans_done || []), [11, 10, 47, 12, 11, 9]));
    sec.push(title(`8. ${d.nx.m}월 계획`), table(['구분', '세부', '내용', '담당자', '일정', '비고'], planRows(row.plans_next || []), [11, 10, 47, 12, 11, 9]));
    const ip = d.inProgress;
    sec.push(title('9. 현재 진행업무'), unit(), table(['분야', '업체명', '잔금', '업무내용', '완료\n목표', '진행단계'],
        [...(ip.length ? ip.map(c => row_([cell(c.field), cell(c.client), cell(c.remain ? fk(c.remain) : '-', { align: R }), cell(c.content, { align: L }),
            cell(c.due ? `'${c.due.slice(2).replace('-', '.')}` : '-'), cell(c.stage || '-')])) : [none(6)]),
         row_([cell('소 계', { span: 2, bold: true }), cell(fk(ip.reduce((s, c) => s + c.remain, 0)), { align: R, bold: true }), cell('', { span: 3 })])],
        [11, 18, 12, 38, 9, 12]));
    if (d.m >= 9) {
        const fc = row.forecast || [];
        const fr = fc.reduce((s, r) => s + Number(r.revenue || 0), 0), fp = fc.reduce((s, r) => s + Number(r.profit || 0), 0);
        const annRev = d.cumSales + fr, annPro = d.cumProfit + fp;
        sec.push(title(`10. 연간 예상 (${d.m}월 기준)`),
            sub('연간 매출 전망'), unit(), table(['구분', `${d.y}년\n매출목표`, '연간 예상 매출', '매출 차액', '매출\n달성률(%)'],
                [row_([cell(d.teamName), cell(fk(d.annualTarget), { align: R }), cell(fk(annRev), { align: R }), cell(fk(annRev - d.annualTarget), { align: R }), cell(pct(annRev, d.annualTarget))])]),
            sub('연간 컨설팅 이익 전망'), unit(), table(['구분', `${d.y}년\n컨설팅 이익목표`, '연간 예상\n컨설팅 이익', '컨설팅 이익\n차액', '컨설팅 이익\n달성률(%)'],
                [row_([cell(d.teamName), cell(d.profitTarget ? fk(d.profitTarget) : '-', { align: R }), cell(fk(annPro), { align: R }),
                       cell(d.profitTarget ? fk(annPro - d.profitTarget) : '-', { align: R }), cell(pct(annPro, d.profitTarget))])]),
            sub(`${d.m < 12 ? (d.m + 1) + '~12월' : '연말'} 예상 매출 - 업체별 상세`), unit(),
            table(['업체명 (품목)', '예상 매출', '예상 컨설팅 이익', '비고'],
                [...(fc.length ? fc.map(r => row_([cell(r.label, { align: L }), cell(fk(r.revenue), { align: R }), cell(fk(r.profit), { align: R }), cell(r.note || '-')])) : [none(4)]),
                 row_([cell('합계', { bold: true }), cell(fk(fr), { align: R, bold: true }), cell(fk(fp), { align: R, bold: true }), cell('')])], [46, 18, 18, 18]),
            p(`※ 연간 예상 = 1~${d.m}월 실적 + ${d.m < 12 ? (d.m + 1) + '~12월' : ''} 예상 (청구예정일·계약 예정 상담 기준, 부서장 수정 반영)`, { size: 16, before: 60 }));
    }
    // 참조: 월간/분기별 수입실적
    const mo = d.monthly;
    const refBody = [];
    [1, 2, 3, 4].forEach(q => {
        mo.slice(q * 3 - 3, q * 3).forEach(x => refBody.push(row_([cell(`${x.m}월`), cell(fk(x.target), { align: R }), cell(x.m <= d.m ? fk(x.actual) : '-', { align: R }),
            cell(fk(x.cumTarget), { align: R }), cell(x.m <= d.m ? fk(x.cumActual) : '-', { align: R }), cell(x.m <= d.m ? pct(x.cumActual, x.cumTarget) : '-')])));
        const qt = mo.slice(q * 3 - 3, q * 3).reduce((s, x) => s + x.target, 0);
        const qa = mo.slice(q * 3 - 3, q * 3).filter(x => x.m <= d.m).reduce((s, x) => s + x.actual, 0);
        refBody.push(row_([cell(`${q}분기`, { bold: true, bg: 'F2F2F2' }), cell(fk(qt), { align: R, bold: true, bg: 'F2F2F2' }),
            cell(q * 3 - 2 <= d.m ? fk(qa) : '-', { align: R, bold: true, bg: 'F2F2F2' }), cell('', { bg: 'F2F2F2' }), cell('', { bg: 'F2F2F2' }),
            cell(q * 3 - 2 <= d.m ? pct(qa, qt) : '-', { bold: true, bg: 'F2F2F2' })]));
    });
    sec.push(title('(참조) 월간/분기별 수입실적'), unit(), table(['월/분기', '목표', '실적', '누계 목표', '누계 실적', '누계 달성률'], refBody));

    const doc = new Document({
        styles: { default: { document: { run: { font: F, size: 19 } } } },
        sections: [{
            properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
            children: [
                ...head, meta,
                p(`${d.teamName} 업무 ${d.m}월 업무실적을 아래와 같이 보고합니다.`, { before: 240, after: 160 }),
                p('- 아 래 -', { align: C, after: 120 }), p('(단위 : 천원)', { align: R, size: 16, after: 30 }), sum,
                p('', { after: 80 }), reasonBox,
                p(`첨    부 : ${d.m}월 ${d.teamName} 세부실적 보고 1부.  끝.`, { before: 300 }),
                new Paragraph({ children: [new PageBreak()] }),
                p(`첨    부 : ${d.m}월 ${d.teamName} 세부실적 보고`, { bold: true, size: 26, after: 100 }),
                ...sec,
            ],
        }],
    });
    return Packer.toBlob(doc);
}

// ── 전역 등록 ────────────────────────────────────────────────────
Object.assign(window, {
    renderMonthlyReport, mrSelectTeam, mrOpen, mrSetPlan, mrAddPlan, mrDelPlan, mrSetFc, mrAddFc, mrDelFc,
    mrResetFc, mrSave, mrUnsubmit, mrDownload,
});
window._mr = { computeReport, defaultForecast, roleOf, buildDocx };
