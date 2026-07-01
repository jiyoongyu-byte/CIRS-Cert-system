// js/views/report.js — 월보고/분기보고 Word 문서 생성

import { getState, getCurrentYear, getCurrentUser } from '../core/store.js';
import { toKRW } from '../core/utils.js';

// ── 기간 내 날짜 여부 ─────────────────────────────────────────────
function inPeriod(dateStr, year, sm, em) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const y = d.getFullYear(), m = d.getMonth() + 1;
    return y === year && m >= sm && m <= em;
}

// ── 금액 포맷 (보고서용) ──────────────────────────────────────────
function fmtKRW(n) {
    const v = Math.round(Number(n || 0));
    if (v >= 100000000) return (v / 100000000).toFixed(2) + '억원';
    if (v >= 10000000)  return (v / 10000000).toFixed(1) + '천만원';
    if (v >= 10000)     return Math.round(v / 10000) + '만원';
    return v.toLocaleString() + '원';
}

function pctStr(actual, target) {
    if (!target) return actual > 0 ? '-' : '-';
    return Math.round(actual / target * 100) + '%';
}

function yoyStr(actual, prev) {
    if (!prev) return actual > 0 ? '신규' : '-';
    const change = Math.round((actual - prev) / prev * 100);
    return (change >= 0 ? '▲' : '▼') + Math.abs(change) + '%';
}

// ── 모달 열기 ─────────────────────────────────────────────────────
export function openReportModal() {
    const now = new Date();
    const y   = getCurrentYear();
    const el  = document.getElementById('rep-year');
    if (el) el.value = y;
    const mel = document.getElementById('rep-month');
    if (mel) mel.value = now.getMonth() + 1;
    toggleRepPeriod();
    document.getElementById('modal-report')?.classList.add('open');
}

export function toggleRepPeriod() {
    const type = document.querySelector('input[name="rep-type"]:checked')?.value || 'month';
    const mw = document.getElementById('rep-month-wrap');
    const qw = document.getElementById('rep-quarter-wrap');
    if (mw) mw.style.display = type === 'month' ? '' : 'none';
    if (qw) qw.style.display = type === 'quarter' ? '' : 'none';
}

// ── 데이터 수집 ───────────────────────────────────────────────────
function collectData(state, year, sm, em, teamFilter) {
    const allMed  = (state.med  || []).filter(x => x.recordType === 'contract');
    const allCert = (state.cert || []).filter(x => x.recordType === 'contract');
    const med     = teamFilter === 'cert' ? [] : allMed;
    const cert    = teamFilter === 'med'  ? [] : allCert;

    // 기간 내 수입 실적 (청구 날짜 기준)
    function calcActual(records) {
        let total = 0;
        records.forEach(r => {
            (r.billing || []).forEach((amt, i) => {
                const date = (r.billingDates || [])[i];
                const cur  = (r.billingCurrencies || [])[i] || 'KRW';
                if (inPeriod(date, year, sm, em)) total += toKRW(Number(amt || 0), cur);
            });
        });
        return Math.round(total);
    }

    // 수입 계획 (quarters 배열 ÷ 3)
    function calcTarget(team) {
        const quarters = ((state.rev || {})[year]?.[team]?.quarters) || [];
        let total = 0;
        for (let m = sm; m <= em; m++) {
            const qIdx = Math.floor((m - 1) / 3);
            total += Math.round(Number(quarters[qIdx] || 0) / 3);
        }
        return total;
    }

    // 전년 동기 실적
    function calcPrev(records) {
        let total = 0;
        records.forEach(r => {
            (r.billing || []).forEach((amt, i) => {
                const date = (r.billingDates || [])[i];
                const cur  = (r.billingCurrencies || [])[i] || 'KRW';
                if (inPeriod(date, year - 1, sm, em)) total += toKRW(Number(amt || 0), cur);
            });
        });
        return Math.round(total);
    }

    // 계약 현황
    function contractStats(records) {
        const active   = records.filter(x => x.status !== '완료' && x.status !== '취소');
        const newOnes  = records.filter(x => inPeriod(x.startdate, year, sm, em));
        const doneAll  = records.filter(x => x.status === '완료');
        const activeKRW = active.reduce((s, x) => s + toKRW(Number(x.amount || 0), x.amountCurrency || 'KRW'), 0);
        const remainKRW = active.reduce((s, x) => {
            const total = toKRW(Number(x.amount || 0), x.amountCurrency || 'KRW');
            const paid  = (x.billing || []).reduce((ps, v, i) =>
                ps + toKRW(Number(v || 0), (x.billingCurrencies || [])[i] || 'KRW'), 0);
            return s + Math.max(0, total - paid);
        }, 0);
        return {
            total:     records.length,
            active:    active.length,
            activeKRW: Math.round(activeKRW),
            new:       newOnes.length,
            done:      doneAll.length,
            remainKRW: Math.round(remainKRW),
        };
    }

    // 업무지시 현황 (기간 내 마감일 기준)
    const tasks = (state.tasks || []).filter(t => inPeriod(t.duedate || t.createdAt, year, sm, em));
    const taskDone     = tasks.filter(t => !!t.completedDate).length;
    const taskOverdue  = tasks.filter(t => !t.completedDate && t.duedate && new Date(t.duedate) < new Date()).length;

    return {
        med:  { actual: calcActual(med),  target: calcTarget('med'),  prev: calcPrev(allMed),  stats: contractStats(med) },
        cert: { actual: calcActual(cert), target: calcTarget('cert'), prev: calcPrev(allCert), stats: contractStats(cert) },
        tasks: { total: tasks.length, done: taskDone, inProgress: tasks.length - taskDone, overdue: taskOverdue },
        teamFilter,
    };
}

// ── Word 문서 생성 ────────────────────────────────────────────────
async function buildDocx(data, periodLabel, memo, currentUser, teamFilter) {
    const D = window.docx;
    if (!D) throw new Error('docx 라이브러리 없음');

    const {
        Document, Paragraph, TextRun, Table, TableRow, TableCell,
        WidthType, AlignmentType, VerticalAlign, Packer, BorderStyle,
        ShadingType, TableLayoutType,
    } = D;

    const teamLabel = teamFilter === 'med' ? '의료기기팀' : teamFilter === 'cert' ? '제품환경인증팀' : '전체';
    const dateStr   = new Date().toLocaleDateString('ko-KR');

    // ── 셀 헬퍼 ────────────────────────────────────────────────────
    function cell(text, { bold = false, bg, color = '000000', align = AlignmentType.CENTER, size = 20, span } = {}) {
        const tc = new TableCell({
            children: [new Paragraph({
                children: [new TextRun({ text: String(text ?? ''), bold, size, color, font: 'Malgun Gothic' })],
                alignment: align,
            })],
            verticalAlign: VerticalAlign.CENTER,
            shading: bg ? { type: ShadingType.CLEAR, fill: bg } : undefined,
            columnSpan: span,
        });
        return tc;
    }
    function hcell(text, span) {
        return cell(text, { bold: true, bg: '1F3864', color: 'FFFFFF', size: 20, span });
    }

    // ── 섹션 제목 ───────────────────────────────────────────────────
    function sectionTitle(num, title) {
        return new Paragraph({
            children: [
                new TextRun({ text: `${num}. ${title}`, bold: true, size: 26, color: '1F3864', font: 'Malgun Gothic' }),
            ],
            spacing: { before: 300, after: 120 },
            border: { bottom: { color: '1F3864', size: 4, space: 2, style: BorderStyle.SINGLE } },
        });
    }

    function bodyText(text, { bold = false, color = '000000', after = 80 } = {}) {
        return new Paragraph({
            children: [new TextRun({ text, bold, size: 21, color, font: 'Malgun Gothic' })],
            spacing: { after },
        });
    }

    // ── 1. 수입 실적 테이블 ─────────────────────────────────────────
    const revRows = [
        new TableRow({ children: [hcell('구분'), hcell('목표'), hcell('실적'), hcell('달성률'), hcell('전년 동기'), hcell('전년 대비')], tableHeader: true }),
    ];

    function addRevRow(label, d) {
        const achColor = d.actual >= d.target && d.target > 0 ? '0070C0' : 'C00000';
        const yoyColor = d.actual >= d.prev && d.prev > 0 ? '0070C0' : 'C00000';
        revRows.push(new TableRow({ children: [
            cell(label, { bold: true, align: AlignmentType.LEFT }),
            cell(fmtKRW(d.target)),
            cell(fmtKRW(d.actual)),
            cell(pctStr(d.actual, d.target), { bold: true, color: achColor }),
            cell(fmtKRW(d.prev)),
            cell(yoyStr(d.actual, d.prev), { color: yoyColor }),
        ]}));
    }

    if (teamFilter !== 'cert') addRevRow('의료기기팀',     data.med);
    if (teamFilter !== 'med')  addRevRow('제품환경인증팀', data.cert);
    if (teamFilter === 'all') {
        const total      = data.med.actual + data.cert.actual;
        const totalTgt   = data.med.target + data.cert.target;
        const totalPrev  = data.med.prev   + data.cert.prev;
        const achColor   = total >= totalTgt && totalTgt > 0 ? '0070C0' : 'C00000';
        const yoyColor   = total >= totalPrev && totalPrev > 0 ? '0070C0' : 'C00000';
        revRows.push(new TableRow({ children: [
            cell('합 계', { bold: true, bg: 'D9E2F3', align: AlignmentType.LEFT }),
            cell(fmtKRW(totalTgt),               { bold: true, bg: 'D9E2F3' }),
            cell(fmtKRW(total),                  { bold: true, bg: 'D9E2F3' }),
            cell(pctStr(total, totalTgt),         { bold: true, bg: 'D9E2F3', color: achColor }),
            cell(fmtKRW(totalPrev),               { bg: 'D9E2F3' }),
            cell(yoyStr(total, totalPrev),         { bold: true, bg: 'D9E2F3', color: yoyColor }),
        ]}));
    }
    const revTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: revRows, layout: TableLayoutType.FIXED });

    // ── 2. 계약 현황 테이블 ─────────────────────────────────────────
    const conRows = [
        new TableRow({ children: [hcell('구분'), hcell('진행중'), hcell('진행중 금액'), hcell('기간 내 신규'), hcell('완료 누적'), hcell('미청구 잔액')], tableHeader: true }),
    ];

    function addConRow(label, s) {
        conRows.push(new TableRow({ children: [
            cell(label, { bold: true, align: AlignmentType.LEFT }),
            cell(s.active + '건'),
            cell(fmtKRW(s.activeKRW)),
            cell(s.new + '건'),
            cell(s.done + '건'),
            cell(fmtKRW(s.remainKRW)),
        ]}));
    }

    if (teamFilter !== 'cert') addConRow('의료기기팀',     data.med.stats);
    if (teamFilter !== 'med')  addConRow('제품환경인증팀', data.cert.stats);
    if (teamFilter === 'all') {
        const ms = data.med.stats, cs = data.cert.stats;
        conRows.push(new TableRow({ children: [
            cell('합 계', { bold: true, bg: 'D9E2F3', align: AlignmentType.LEFT }),
            cell((ms.active + cs.active) + '건',                   { bold: true, bg: 'D9E2F3' }),
            cell(fmtKRW(ms.activeKRW + cs.activeKRW),             { bold: true, bg: 'D9E2F3' }),
            cell((ms.new    + cs.new)   + '건',                   { bg: 'D9E2F3' }),
            cell((ms.done   + cs.done)  + '건',                   { bg: 'D9E2F3' }),
            cell(fmtKRW(ms.remainKRW + cs.remainKRW),             { bold: true, bg: 'D9E2F3' }),
        ]}));
    }
    const conTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: conRows, layout: TableLayoutType.FIXED });

    // ── 3. 업무지시 현황 테이블 ────────────────────────────────────
    const t = data.tasks;
    const taskTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: [hcell('총 건수'), hcell('완료'), hcell('진행중'), hcell('기한 초과 미완료')], tableHeader: true }),
            new TableRow({ children: [
                cell(t.total + '건'),
                cell(t.done + '건', { color: t.done > 0 ? '00B050' : '000000' }),
                cell(t.inProgress + '건', { color: t.inProgress > 0 ? '0070C0' : '000000' }),
                cell(t.overdue + '건', { color: t.overdue > 0 ? 'C00000' : '000000' }),
            ]}),
        ],
        layout: TableLayoutType.FIXED,
    });

    // ── 특이사항 단락 ───────────────────────────────────────────────
    const memoParas = memo
        ? memo.split('\n').map(line => bodyText(line || ' '))
        : [bodyText('(해당 없음)', { color: '888888' })];

    // ── 문서 조립 ───────────────────────────────────────────────────
    const doc = new Document({
        creator:     currentUser,
        title:       `${periodLabel} 업무 보고`,
        description: 'CIRS Group Korea 업무 보고서',
        styles: {
            default: { document: { run: { font: 'Malgun Gothic', size: 22 } } },
        },
        sections: [{
            properties: {
                page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
            },
            children: [
                // 문서 제목
                new Paragraph({
                    children: [new TextRun({ text: 'CIRS Group Korea', bold: true, size: 44, color: '1F3864', font: 'Malgun Gothic' })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 80 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: `${teamLabel}  ${periodLabel}  업무 보고`, bold: true, size: 36, font: 'Malgun Gothic' })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: `작성일: ${dateStr}　　작성자: ${currentUser}`, size: 18, color: '666666', font: 'Malgun Gothic' })],
                    alignment: AlignmentType.RIGHT,
                    spacing: { after: 200 },
                    border: { bottom: { color: '1F3864', size: 8, space: 4, style: BorderStyle.SINGLE } },
                }),

                // 1. 수입 실적
                sectionTitle('1', '수입 실적 요약'),
                revTable,
                new Paragraph({ spacing: { after: 200 }, children: [] }),

                // 2. 계약업체 현황
                sectionTitle('2', '계약업체 현황'),
                conTable,
                new Paragraph({ spacing: { after: 200 }, children: [] }),

                // 3. 업무지시 현황
                sectionTitle('3', '업무지시 현황'),
                bodyText('※ 기간 내 마감일 기준 집계', { color: '888888' }),
                taskTable,
                new Paragraph({ spacing: { after: 200 }, children: [] }),

                // 4. 특이사항 및 달성률 사유
                sectionTitle('4', '특이사항 및 달성률 사유'),
                ...memoParas,
            ],
        }],
    });

    return Packer.toBlob(doc);
}

// ── 보고서 생성 진입점 ─────────────────────────────────────────────
export async function generateReport() {
    if (!window.docx) {
        alert('보고서 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
        return;
    }

    const btn = document.getElementById('repGenBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 생성 중...'; }

    try {
        const type     = document.querySelector('input[name="rep-type"]:checked')?.value || 'month';
        const year     = parseInt(document.getElementById('rep-year')?.value) || getCurrentYear();
        const period   = parseInt(document.getElementById(type === 'month' ? 'rep-month' : 'rep-quarter')?.value) || 1;
        const teamFilter = document.getElementById('rep-team')?.value || 'all';
        const memo     = (document.getElementById('rep-memo')?.value || '').trim();

        let sm, em, periodLabel;
        if (type === 'month') {
            sm = em = period;
            periodLabel = `${year}년 ${period}월`;
        } else {
            sm = (period - 1) * 3 + 1;
            em = period * 3;
            periodLabel = `${year}년 ${period}분기`;
        }

        const state       = getState();
        const currentUser = getCurrentUser();
        const data        = collectData(state, year, sm, em, teamFilter);
        const blob        = await buildDocx(data, periodLabel, memo, currentUser, teamFilter);

        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href    = url;
        const teamLabel = teamFilter === 'med' ? '의료기기팀' : teamFilter === 'cert' ? '제품환경인증팀' : '전체';
        a.download = `CIRS_${teamLabel}_${periodLabel}_업무보고.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);

        window.closeModal?.('report');
    } catch (e) {
        console.error('보고서 생성 오류:', e);
        alert('보고서 생성 중 오류가 발생했습니다: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📄 보고서 생성'; }
    }
}

// ── window 전역 등록 ─────────────────────────────────────────────
window.openReportModal = openReportModal;
window.toggleRepPeriod = toggleRepPeriod;
window.generateReport  = generateReport;
