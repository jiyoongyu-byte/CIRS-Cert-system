// js/views/revenue.js — 수입계획 및 실적 뷰

import { getState, getCurrentYear, getRevTeam, setRevTeam, ensureRevYear } from '../core/store.js';
import { toKRW, fmtM, fmtMil, getBilledActual } from '../core/utils.js';

let chartRevMixed    = null;
let chartTopServices = null;
let revChartMode     = 'month';  // 'month' | 'quarter' | 'cumul'
let svcChartMode     = 'cert';   // 'cert'  | 'manager'

// ── 팀 탭 전환 ────────────────────────────────────────────────
export function switchRevTeam(team, el) {
    setRevTeam(team);
    document.querySelectorAll('#revTeamSelector .team-tab').forEach(b => b.className = 'team-tab');
    if (el) el.className = 'team-tab ' + (team === 'cert' ? 'active-cert' : 'active-med');
    renderRevenue();
}

// ── 차트 모드 전환 (월별/분기별/누적) ────────────────────────────
export function switchRevChartMode(mode, el) {
    revChartMode = mode;
    document.querySelectorAll('.rev-chart-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    const { actual, target, rows } = _getActualTarget();
    renderRevChart(actual, target, getRevTeam() || 'med', rows, getCurrentYear());
}

// ── 수입기여도 모드 전환 (인증마크별/담당자별) ────────────────────
export function switchServiceChartMode(mode, el) {
    svcChartMode = mode;
    document.querySelectorAll('.svc-chart-btn').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    const state = getState();
    const y     = getCurrentYear();
    const team  = getRevTeam() || 'med';
    const medRows  = (state.med  || []).filter(r => r.recordType === 'contract');
    const certRows = (state.cert || []).filter(r => r.recordType === 'contract');
    const rows = team === 'med' ? medRows : team === 'cert' ? certRows : [...medRows, ...certRows];
    renderSvcChart(rows, team, y);
}

// ── 내부 헬퍼: 현재 팀/연도에 맞는 actual/target/rows ────────────
function _getActualTarget() {
    const state = getState();
    const y     = getCurrentYear();
    const team  = getRevTeam() || 'med';
    const medRows  = (state.med  || []).filter(r => r.recordType === 'contract');
    const certRows = (state.cert || []).filter(r => r.recordType === 'contract');
    const { qs: medActual  } = getBilledActual(medRows,  y);
    const { qs: certActual } = getBilledActual(certRows, y);
    const totalActual = {
        q1: medActual.q1 + certActual.q1, q2: medActual.q2 + certActual.q2,
        q3: medActual.q3 + certActual.q3, q4: medActual.q4 + certActual.q4,
    };
    const rev = state.revenue[y] || {};
    const medTarget   = rev.med  || { q1:0, q2:0, q3:0, q4:0 };
    const certTarget  = rev.cert || { q1:0, q2:0, q3:0, q4:0 };
    const totalTarget = {
        q1: (medTarget.q1||0) + (certTarget.q1||0), q2: (medTarget.q2||0) + (certTarget.q2||0),
        q3: (medTarget.q3||0) + (certTarget.q3||0), q4: (medTarget.q4||0) + (certTarget.q4||0),
    };
    const actual = team === 'med' ? medActual : team === 'cert' ? certActual : totalActual;
    const target = team === 'med' ? medTarget : team === 'cert' ? certTarget : totalTarget;
    const rows   = team === 'med' ? medRows   : team === 'cert' ? certRows   : [...medRows, ...certRows];
    return { actual, target, rows, medRows, certRows, y, team };
}

// ── 분기 목표 → 월별 균등 배분 ────────────────────────────────────
function _getMonthlyTarget(target) {
    return Array.from({ length:12 }, (_, i) => {
        const q = ['q1','q1','q1','q2','q2','q2','q3','q3','q3','q4','q4','q4'][i];
        return Number(target[q] || 0) / 3;
    });
}

// ── 월별 실적 계산 (12개 배열) ─────────────────────────────────────
function _getMonthlyActual(rows, y) {
    const monthly = Array(12).fill(0);
    rows.forEach(r => {
        (r.billing || []).forEach((amt, i) => {
            const d = (r.billingDates || [])[i];
            if (!d || new Date(d).getFullYear() !== y) return;
            const m = new Date(d).getMonth();
            monthly[m] += toKRW(Number(amt || 0), (r.billingCurrencies || [])[i] || 'KRW');
        });
    });
    return monthly;
}

// ── 의료기기팀 등급/분류 카테고리 (grade 우선, biztype fallback) ──
function categorizeMed(r) {
    const grade = (r.grade || '').trim();

    // grade 필드 직접 사용 (한국 1~4등급 / 중국 1~3등급 / KGMP / CGMP / 직접입력값)
    // form-actions.js: "기타" 선택 시 직접입력 텍스트가 grade에 저장됨
    if (grade && grade !== '선택') {
        return grade;   // "한국 1등급", "중국 3등급", "KGMP", "CGMP", "기타", 직접입력 등 그대로 사용
    }

    // grade 없으면 biztype fallback
    const bt = (r.biztype || r.product || '').toLowerCase();
    if (bt.includes('kgmp'))  return 'KGMP';
    if (bt.includes('cgmp'))  return 'CGMP';
    if (bt.includes('한국'))  return '한국';
    if (bt.includes('중국'))  return '중국';
    return r.biztype || r.product || '기타';
}

// ══════════════════════════════════════════════════════════════════
// ── 메인 렌더 ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════
export function renderRevenue() {
    const state = getState();
    const y     = getCurrentYear();
    const team  = getRevTeam() || 'med';
    ensureRevYear(y);

    const { actual, target, rows, medRows, certRows } = _getActualTarget();

    // ── 분기 목표 카드 ────────────────────────────────────────────
    const qWrap = document.getElementById('revQuarterlyWrap');
    if (qWrap) {
        qWrap.innerHTML = `<div class="stat-grid" style="margin-bottom:20px">
            ${['q1','q2','q3','q4'].map((q, i) => {
                const tgt  = Number(target[q] || 0);
                const act  = Math.round(actual[q] || 0);
                const p    = tgt ? Math.min(Math.round(act / tgt * 100), 100) : 0;
                const diff = act - tgt;
                const dc   = diff >= 0 ? 'var(--success)' : 'var(--danger)';
                return `<div class="stat-card">
                    <div class="stat-label">${i + 1}분기 목표</div>
                    <div class="stat-value">${fmtM(tgt)}</div>
                    <div style="font-size:12px;color:var(--success);margin-top:4px">실적 ${fmtM(act)} (${p}%)</div>
                    <div style="font-size:11px;color:${dc};margin-top:2px">${diff >= 0 ? '▲' : '▼'} ${fmtM(Math.abs(diff))}</div>
                    <div class="stat-bar"><div class="stat-fill fill-${team === 'cert' ? 'cert' : 'med'}" style="width:${p}%"></div></div>
                    <input class="m-input" type="number" value="${tgt}" placeholder="목표 입력"
                        onchange="updateTarget('${team}','${q}',this.value)" style="margin-top:8px">
                </div>`;
            }).join('')}
        </div>`;
    }

    // ── 월별 목표/실적 카드 ───────────────────────────────────────
    const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    const mCards = document.getElementById('mCards');
    if (mCards) {
        const monthlyActual = _getMonthlyActual(rows, y);
        const monthlyTarget = _getMonthlyTarget(target);
        mCards.innerHTML = monthlyActual.map((v, i) => {
            const tgt  = monthlyTarget[i];
            const diff = v - tgt;
            const dc   = diff >= 0 ? 'var(--success)' : 'var(--danger)';
            return `<div class="m-card">
                <div class="m-label">${MONTHS[i]}</div>
                <div class="m-actual">${fmtMil(Math.round(v))}</div>
                ${tgt > 0 ? `<div style="font-size:10px;color:${dc}">${diff >= 0 ? '▲' : '▼'}${fmtMil(Math.abs(Math.round(diff)))}</div>` : ''}
            </div>`;
        }).join('');
    }

    // ── 계약별 수입 결산 테이블 ───────────────────────────────────
    const tbody = document.querySelector('#revContractTable tbody');
    if (tbody) {
        const tableRows = team === 'med'
            ? medRows.filter(r => r.year === y).map(r => ({ ...r, _team:'의료기기팀',    _item: r.biztype || r.product || '' }))
            : team === 'cert'
            ? certRows.filter(r => r.year === y).map(r => ({ ...r, _team:'제품환경인증팀', _item: r.certtype || '' }))
            : [
                ...medRows.filter(r => r.year === y).map(r => ({ ...r, _team:'의료기기팀',    _item: r.biztype || r.product || '' })),
                ...certRows.filter(r => r.year === y).map(r => ({ ...r, _team:'제품환경인증팀', _item: r.certtype || '' })),
              ];

        tbody.innerHTML = !tableRows.length
            ? `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">데이터가 없습니다.</td></tr>`
            : tableRows.map((r, i) => {
                const paid   = (r.billing || []).reduce((s, v, bi) => s + toKRW(Number(v || 0), (r.billingCurrencies || [])[bi] || 'KRW'), 0);
                const total  = toKRW(Number(r.amount || 0), r.amountCurrency || 'KRW');
                const remain = total - paid;
                return `<tr>
                    <td>${i + 1}</td>
                    <td><span class="badge ${r._team === '의료기기팀' ? 'badge-med' : 'badge-cert'}">${r._team}</span></td>
                    <td>${r.client || ''}</td>
                    <td>${r._item}</td>
                    <td>${r.startdate || r.contractdate || ''}</td>
                    <td>${fmtM(r.amount || 0)} ${r.amountCurrency || 'KRW'}</td>
                    <td style="color:var(--success);font-weight:700">${fmtM(Math.round(paid))}</td>
                    <td style="color:${remain > 0 ? 'var(--warn)' : 'var(--text3)'}">${fmtM(Math.round(remain))}</td>
                    <td>${r.manager || ''}</td>
                </tr>`;
            }).join('');
    }

    renderRevChart(actual, target, team, rows, y);
    renderSvcChart(rows, team, y);
}

// ══════════════════════════════════════════════════════════════
// ── 차트 1: 월별/분기별/누적 실적 & 계획 (단일 y축) ────────────────
// ══════════════════════════════════════════════════════════════════
function renderRevChart(actual, target, team, rows, y) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('chartRevMixed');
    if (!ctx) return;
    if (chartRevMixed) { chartRevMixed.destroy(); chartRevMixed = null; }

    const isCert     = team === 'cert';
    const greenSolid = 'rgba(25,168,118,0.82)';   // 달성 초록
    const greenLine  = '#19A876';                  // 초록 테두리/선
    const redSolid   = 'rgba(239,68,68,0.80)';    // 미달 빨강
    const blueSolid  = 'rgba(79,195,247,0.82)';   // 초과달성 파랑
    const planLine   = isCert ? '#56d9a8' : '#8B9CF9'; // 누적 계획선

    let labels, datasets, chartType, useStack = false;
    let pctPlanArr = null, pctActualArr = null; // 달성률(%) 텍스트 플러그인용

    if (revChartMode === 'quarter') {
        // ── 분기별: 계획=윤곽선, 실적=초록 채움 (달성률은 막대 위 텍스트로 표시) ──
        labels = ['1분기', '2분기', '3분기', '4분기'];
        const planArr   = ['q1','q2','q3','q4'].map(q => Math.round(Number(target[q] || 0)));
        const actualArr = ['q1','q2','q3','q4'].map(q => Math.round(actual[q] || 0));
        datasets = [
            { type:'bar', label:'계획', data: planArr,
              backgroundColor: 'transparent', borderColor: greenLine, borderWidth:2, borderRadius:4, stack:'plan' },
            { type:'bar', label:'실적', data: actualArr,
              backgroundColor: greenSolid, borderRadius:4, stack:'actual' },
        ];
        chartType = 'bar'; useStack = true;
        pctPlanArr = planArr; pctActualArr = actualArr;

    } else if (revChartMode === 'cumul') {
        // ── 누적: 누적계획 점선 + 누적실적 실선 ─────────────────
        labels = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
        const mActual = _getMonthlyActual(rows, y);
        const mTarget = _getMonthlyTarget(target);
        const cActual = mActual.reduce((a, v, i) => { a.push((a[i-1]||0) + v); return a; }, []);
        const cTarget = mTarget.reduce((a, v, i) => { a.push((a[i-1]||0) + v); return a; }, []);
        datasets = [
            { type:'line', label:'누적 계획', data: cTarget.map(v=>Math.round(v)),
              borderColor: planLine, borderDash:[6,4], borderWidth:2, pointRadius:2,
              backgroundColor:'transparent', tension:0.3 },
            { type:'line', label:'누적 실적', data: cActual.map(v=>Math.round(v)),
              borderColor: greenLine, borderWidth:2.5, pointRadius:3,
              backgroundColor:'transparent', tension:0.3 },
        ];
        chartType = 'line';

    } else {
        // ── 월별 (기본): 계획=윤곽선, 실적=초록 채움 (달성률은 막대 위 텍스트로 표시) ──
        labels = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
        const mActual = _getMonthlyActual(rows, y);
        const mTarget = _getMonthlyTarget(target);
        const targetRounded = mTarget.map(v => Math.round(v));
        const actualRounded = mActual.map(v => Math.round(v));
        datasets = [
            { type:'bar', label:'계획', data: targetRounded,
              backgroundColor: 'transparent', borderColor: greenLine, borderWidth:2, borderRadius:3, stack:'plan' },
            { type:'bar', label:'실적', data: actualRounded,
              backgroundColor: greenSolid, borderRadius:3, stack:'actual' },
        ];
        chartType = 'bar'; useStack = true;
        pctPlanArr = targetRounded; pctActualArr = actualRounded;
    }

    // 커스텀 범례 라벨 (계획/실적 2종, 흰색 텍스트로 가독성 개선)
    const customLegendLabels = useStack ? {
        color:'#FFFFFF', font:{ size:11 },
        generateLabels: () => [
            { text:'계획', fillStyle:'transparent', strokeStyle: greenLine, lineWidth:2, hidden:false, datasetIndex:0 },
            { text:'실적', fillStyle: greenSolid,   strokeStyle:'transparent', lineWidth:0, hidden:false, datasetIndex:1 },
        ]
    } : { color:'#FFFFFF', font:{ size:11 } };

    // 달성률(%) 텍스트 플러그인: 실적 막대 위에 초과달성=파랑 '+00.0%' / 미달=빨강 '-00.0%' 표시
    const pctLabelPlugin = {
        id: 'pctLabelPlugin',
        afterDatasetsDraw(chart) {
            if (!useStack || !pctActualArr) return;
            const meta = chart.getDatasetMeta(1); // 실적 데이터셋
            const { ctx: c } = chart;
            c.save();
            c.font = '11px sans-serif';
            c.textAlign = 'center';
            meta.data.forEach((bar, i) => {
                const tgt = pctPlanArr[i];
                if (!tgt) return; // 목표 0이면 달성률 표시 안함
                const act = pctActualArr[i];
                const pct = (act - tgt) / tgt * 100;
                const sign = pct >= 0 ? '+' : '-';
                c.fillStyle = pct >= 0 ? '#4FC3F7' : '#EF4444';
                c.fillText(`${sign} ${Math.abs(pct).toFixed(1)}%`, bar.x, bar.y - 6);
            });
            c.restore();
        }
    };

    chartRevMixed = new Chart(ctx, {
        type: chartType,
        data: { labels, datasets },
        plugins: [pctLabelPlugin],
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { labels: customLegendLabels },
                tooltip: {
                    filter: item => item.raw > 0,  // 0값 툴팁 숨김
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${fmtMil(ctx.raw)}`
                    }
                }
            },
            scales: {
                y: {
                    stacked: useStack,
                    ticks: { color:'#BAC0CB', callback: v => fmtMil(v) },
                    grid:  { color:'rgba(255,255,255,0.05)' }
                },
                x: { stacked: useStack, ticks: { color:'#BAC0CB' }, grid: { display:false } }
            }
        }
    });
}

// ══════════════════════════════════════════════════════════════════
// ── 차트 2: 수입기여도 도넛 (인증마크별 / 담당자별) ────────────────
// ══════════════════════════════════════════════════════════════════
function renderSvcChart(rows, team, y) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('chartTopServices');
    if (!ctx) return;
    if (chartTopServices) { chartTopServices.destroy(); chartTopServices = null; }

    const COLORS = ['#5B6EF5','#19A876','#F5A623','#E8652A','#4FC3F7','#AB47BC','#26A69A','#EF5350','#78909C','#D4E157'];
    const targetRows = rows.filter(r => r.year === y);
    const map = {};

    if (svcChartMode === 'manager') {
        // ── 담당자별 ─────────────────────────────────────────────
        targetRows.forEach(r => {
            const key = r.manager || '미지정';
            map[key] = (map[key] || 0) + toKRW(Number(r.amount || 0), r.amountCurrency || 'KRW');
        });
    } else {
        // ── 인증마크/서비스별 ─────────────────────────────────────
        targetRows.forEach(r => {
            let key;
            if (r.biztype || r.product) {
                // 의료기기팀 레코드 → 카테고리 분류
                key = categorizeMed(r);
            } else {
                // 제품환경인증팀 레코드
                key = r.certtype || '기타';
            }
            map[key] = (map[key] || 0) + toKRW(Number(r.amount || 0), r.amountCurrency || 'KRW');
        });
    }

    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!sorted.length) return;

    chartTopServices = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sorted.map(([k]) => k),
            datasets: [{
                data: sorted.map(([, v]) => Math.round(v)),
                backgroundColor: COLORS.slice(0, sorted.length),
                borderWidth: 0,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position:'bottom', labels:{ color:'#BAC0CB', font:{ size:11 }, boxWidth:12 } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
                            const pct   = total ? Math.round(ctx.raw / total * 100) : 0;
                            return ` ${ctx.label}: ${fmtM(ctx.raw)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ══════════════════════════════════════════════════════════════════
// ── 엑셀 다운로드: 월별 목표/실적/달성률 + 계약별 수입 결산 내역 ──────
// ══════════════════════════════════════════════════════════════════
export function exportRevenueExcel() {
    if (typeof XLSX === 'undefined') { alert('엑셀 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'); return; }

    const y    = getCurrentYear();
    const team = getRevTeam() || 'med';
    const { target, rows, medRows, certRows } = _getActualTarget();

    // 시트1: 월별 목표/실적/달성률
    const MONTHS  = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    const mActual = _getMonthlyActual(rows, y);
    const mTarget = _getMonthlyTarget(target);
    const sheet1 = MONTHS.map((m, i) => {
        const tgt  = Math.round(mTarget[i]);
        const act  = Math.round(mActual[i]);
        const rate = tgt ? Math.round(act / tgt * 1000) / 10 : 0;
        return { '월': m, '목표(원)': tgt, '실적(원)': act, '달성률(%)': rate };
    });

    // 시트2: 계약별 수입 결산 내역
    const tableRows = team === 'med'
        ? medRows.filter(r => r.year === y).map(r => ({ ...r, _team:'의료기기팀', _item: r.biztype || r.product || '' }))
        : team === 'cert'
        ? certRows.filter(r => r.year === y).map(r => ({ ...r, _team:'제품환경인증팀', _item: r.certtype || '' }))
        : [
            ...medRows.filter(r => r.year === y).map(r => ({ ...r, _team:'의료기기팀', _item: r.biztype || r.product || '' })),
            ...certRows.filter(r => r.year === y).map(r => ({ ...r, _team:'제품환경인증팀', _item: r.certtype || '' })),
          ];
    const sheet2 = tableRows.map((r, i) => {
        const paid  = (r.billing || []).reduce((s, v, bi) => s + toKRW(Number(v || 0), (r.billingCurrencies || [])[bi] || 'KRW'), 0);
        const total = toKRW(Number(r.amount || 0), r.amountCurrency || 'KRW');
        return {
            '순번': i + 1, '팀': r._team, '업체명': r.client || '', '항목': r._item,
            '발생월': r.startdate || r.contractdate || '',
            '계약금액': `${fmtM(r.amount || 0)} ${r.amountCurrency || 'KRW'}`,
            '수입실적(현재까지)': fmtM(Math.round(paid)),
            '잔액': fmtM(Math.round(total - paid)),
            '담당자': r.manager || ''
        };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet1), '월별목표달성현황');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet2), '계약별수입결산내역');
    const teamLabel = team === 'med' ? '의료기기팀' : team === 'cert' ? '제품환경인증팀' : '전체합산';
    XLSX.writeFile(wb, `수입계획실적_${teamLabel}_${y}.xlsx`);
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.renderRevenue          = renderRevenue;
window.switchRevTeam          = switchRevTeam;
window.switchRevChartMode     = switchRevChartMode;
window.switchServiceChartMode = switchServiceChartMode;
window.exportRevenueExcel     = exportRevenueExcel;
