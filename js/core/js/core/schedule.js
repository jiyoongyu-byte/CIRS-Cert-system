// js/core/schedule.js — 타임라인 v2 데이터 계산 (연도 판정, 종결·이월, 잔금, 월별 달성률, 일정 항목). DB 호출 없음.

// 날짜 문자열을 YYYY-MM-DD로 정규화. 해석 불가면 ''
export function ymd(s) {
    const m = String(s || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

// 기준 연도 = 최초계약일 연도 (최초계약일 없으면 계약일 연도)
export function baseYear(rec) {
    const d = ymd(rec.first_contract_date) || ymd(rec.contract_date) || ymd(rec.start_date);
    return d ? Number(d.slice(0, 4)) : null;
}

// 종결 = 인증서 발급일이 있는 건 (계약완료). 계약불가·보류는 아래 CLOSED_STATUS로 판정
const CLOSED_STATUS = ['계약불가', '보류'];
export function isClosed(rec) {
    const status = rec.progress || rec.stage || '';
    return !!ymd(rec.issue_date) || CLOSED_STATUS.includes(status);
}

// 이월 = 진행 중이고 기준 연도가 현재 연도보다 이전
export function isCarriedOver(rec, nowYear) {
    const y = baseYear(rec);
    return !isClosed(rec) && y !== null && y < nowYear;
}

// 잔금 = 계약금액 − 입금 완료 합계 (입금일이 있는 수입 내역만 합산)
export function balanceOf(rec, items) {
    const paid = items
        .filter(i => i.record_id === rec.id && ymd(i.received_date))
        .reduce((sum, i) => sum + Number(i.amount || 0), 0);
    return Number(rec.amount || 0) - paid;
}

// 월별 계획·실적 집계 (12개월). 계획 = planned_date 기준, 실적 = received_date 기준
// 누적 달성률 = 누적 실적 / 누적 계획 (계획이 0이면 null)
export function monthlyRevenue(items, year) {
    const rows = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, plan: 0, actual: 0 }));
    for (const it of items) {
        const amt = Number(it.amount || 0);
        const p = ymd(it.planned_date);
        if (p && Number(p.slice(0, 4)) === year) rows[Number(p.slice(5, 7)) - 1].plan += amt;
        const a = ymd(it.received_date);
        if (a && Number(a.slice(0, 4)) === year) rows[Number(a.slice(5, 7)) - 1].actual += amt;
    }
    let cumPlan = 0, cumActual = 0;
    for (const r of rows) {
        cumPlan += r.plan;
        cumActual += r.actual;
        r.cumRate = cumPlan ? cumActual / cumPlan : null;
    }
    return rows;
}

// 스케줄러 항목 생성: 준비·진행 기한, 입금(초록), 예정 잔금(테두리), 기한 지남 표시
// owner 필터는 호출 측에서 처리. 반환 항목: { date, kind, label, recordId, overdue }
export function scheduleEvents(items, revenue, today) {
    const events = [];
    for (const p of items) {
        const d = ymd(p.due_date);
        if (d && !p.done) events.push({ date: d, kind: 'task', label: p.content, recordId: p.record_id, owner: p.assignee, overdue: d < today });
    }
    for (const r of revenue) {
        const received = ymd(r.received_date);
        const planned = ymd(r.planned_date);
        if (received) events.push({ date: received, kind: 'received', label: `입금 ${Number(r.amount || 0).toLocaleString()}`, recordId: r.record_id, overdue: false });
        else if (planned) events.push({ date: planned, kind: 'balance', label: `잔금 예정 ${Number(r.amount || 0).toLocaleString()}`, recordId: r.record_id, overdue: planned < today });
    }
    return events.sort((a, b) => a.date.localeCompare(b.date));
}
