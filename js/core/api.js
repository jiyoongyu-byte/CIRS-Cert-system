// js/core/api.js — Supabase 통신 전담 (기존 테이블 구조 유지)
// 테이블: med_records, cert_records, revenue_plan, app_settings

const SUPABASE_URL = 'https://dbbpyrrxgpphfdqvpsva.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiYnB5cnJ4Z3BwaGZkcXZwc3ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNjU2MTgsImV4cCI6MjA5NTk0MTYxOH0.R3SGiIuHsvlJC293141oSmbbV47nkrEitDVBMBFkdbg';

export let sb = null;
export function initSb() {
    if (window.supabase && !sb) {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return sb;
}

// ── med_records 저장 ──────────────────────────────────────────────
export async function saveMedRecord(record) {
    const client = initSb(); if (!client) return;
    try {
        const { error } = await client.from('med_records').upsert({
            id: record.id, year: record.year,
            record_type: record.recordType, client: record.client,
            product: record.product || '', grade: record.grade || '',
            biztype: record.biztype || '', stage: record.stage || '',
            stages: record.stages || [], progress: record.progress || '',
            manager: record.manager || '',
            start_date: record.startdate || null, due_date: record.duedate || null,
            status: record.status || '진행중',
            amount: record.amount || 0, amount_currency: record.amountCurrency || 'KRW',
            billing: record.billing || [0,0,0,0,0],
            billing_dates: record.billingDates || ['','','','',''],
            billing_currencies: record.billingCurrencies || ['KRW','KRW','KRW','KRW','KRW'],
            renew_cycle: record.renewcycle || '', expire_date: record.expiredate || null,
            consult_status: record.consultStatus || '', fail_reason: record.failReason || '',
            note: record.note || '', contact_name: record.contactName || '',
            contact_phone: record.contactPhone || '', contact_email: record.contactEmail || '',
            quote_date: record.quoteDate || null, quote_amount: record.quoteAmount || 0,
            quote_file: record.quoteFile || '',
            exp_audit: record.expAudit || 0, exp_test: record.expTest || 0,
            exp_trip: record.expTrip || 0, exp_extra: record.expExtra || [],
            ref_audit: record.refAudit || 0, ref_fee: record.refFee || 0,
            ref_memo: record.refMemo || '', ref_extra: record.refExtra || [],
        });
        if (error) throw error;
    } catch (e) { console.error('saveMedRecord 오류:', e); throw e; } // 호출부 catch 가능하도록 re-throw
}

export async function deleteMedRecord(id) {
    const client = initSb(); if (!client) return;
    try {
        const { error } = await client.from('med_records').delete().eq('id', id);
        if (error) throw error;
    } catch (e) { console.error('deleteMedRecord 오류:', e); }
}

// ── cert_records 저장 ─────────────────────────────────────────────
export async function saveCertRecord(record) {
    const client = initSb(); if (!client) return;
    try {
        const { error } = await client.from('cert_records').upsert({
            id: record.id, year: record.year,
            record_type: record.recordType, client: record.client,
            cert_type: record.certtype || '', manager: record.manager || '',
            contract_date: record.contractdate || null, date: record.date || null,
            stage: record.stage || '', issue_date: record.issuedate || null,
            contracted: record.contracted || '미계약',
            amount: record.amount || 0, amount_currency: record.amountCurrency || 'KRW',
            billing: record.billing || [0,0,0,0,0],
            billing_dates: record.billingDates || ['','','','',''],
            billing_currencies: record.billingCurrencies || ['KRW','KRW','KRW','KRW','KRW'],
            renew_cycle: record.renewcycle || '', expire_date: record.expiredate || null,
            fail_reason: record.failReason || '', note: record.note || '',
            contact_name: record.contactName || '', contact_phone: record.contactPhone || '',
            contact_email: record.contactEmail || '', quote_date: record.quoteDate || null,
            quote_amount: record.quoteAmount || 0, quote_file: record.quoteFile || '',
            etc_memo: record.etcMemo || '',
            exp_audit: record.expAudit || 0, exp_test: record.expTest || 0,
            exp_trip: record.expTrip || 0, exp_extra: record.expExtra || [],
            ref_audit: record.refAudit || 0, ref_fee: record.refFee || 0,
            ref_memo: record.refMemo || '', ref_extra: record.refExtra || [],
        });
        if (error) throw error;
    } catch (e) { console.error('saveCertRecord 오류:', e); throw e; } // 호출부 catch 가능하도록 re-throw
}

export async function deleteCertRecord(id) {
    const client = initSb(); if (!client) return;
    try {
        const { error } = await client.from('cert_records').delete().eq('id', id);
        if (error) throw error;
    } catch (e) { console.error('deleteCertRecord 오류:', e); }
}

// ── revenue_plan 저장 ─────────────────────────────────────────────
export async function saveRevenueState(state) {
    const client = initSb(); if (!client) return;
    try {
        const { error } = await client.from('revenue_plan').upsert({
            id: 'main',
            data: {
                ...state.revenue,
                _kpiEdu: state.kpiEdu, _qualData: state.qualData,
                _eduRecords: state.eduRecords, _tasks: state.tasks,
                _bottleneckReasons: state.bottleneckReasons || {},
                _strategy: state.strategy || {},       // 3년 전략기획 데이터
            },
            updated_at: new Date().toISOString(),
        });
        if (error) throw error;
    } catch (e) { console.error('saveRevenueState 오류:', e); }
}

// ── app_settings (개인별 비밀번호) ────────────────────────────────
export async function loadPw(state, userName) {
    const client = initSb(); if (!client) return;
    try {
        const { data, error } = await client
            .from('app_settings').select('pw').eq('id', userName).single();
        if (!error && data?.pw) state.pw = data.pw;
        else state.pw = 'cirs2026!';
    } catch (e) { state.pw = 'cirs2026!'; }
}

export async function savePw(newPw, userName) {
    const client = initSb(); if (!client) return;
    try {
        await client.from('app_settings').upsert({
            id: userName, pw: newPw, updated_at: new Date().toISOString(),
        });
    } catch (e) { console.error('savePw 오류:', e); }
}

export async function resetPw(targetUser) {
    const client = initSb(); if (!client) return;
    try {
        await client.from('app_settings').upsert({
            id: targetUser, pw: 'cirs2026!', updated_at: new Date().toISOString(),
        });
    } catch (e) { console.error('resetPw 오류:', e); }
}

// ── 감사 로그 ─────────────────────────────────────────────────────
export async function logAudit(action, detail, user) {
    const client = initSb(); if (!client) return;
    try {
        await client.from('audit_logs').insert([{
            user: user || '알수없음', action, detail,
            created_at: new Date().toISOString(),
        }]);
    } catch (e) { /* audit_logs 테이블 없으면 무시 */ }
}

// ── 전체 데이터 로드 ──────────────────────────────────────────────
export async function loadAllData(state) {
    const client = initSb(); if (!client) return false;
    try {
        const [mR, cR, rR] = await Promise.all([
            client.from('med_records').select('*'),
            client.from('cert_records').select('*'),
            client.from('revenue_plan').select('*').eq('id','main').single(),
        ]);

        state.med = (mR.data || []).map(r => ({
            id: r.id, year: r.year, recordType: r.record_type || 'contract',
            client: r.client || '', product: r.product || '',
            grade: r.grade || '', biztype: r.biztype || '',
            stage: r.stage || '', stages: r.stages || [],
            progress: r.progress || '', manager: r.manager || '',
            startdate: r.start_date || '', duedate: r.due_date || '',
            status: r.status || '',
            amount: Number(r.amount || 0), amountCurrency: r.amount_currency || 'KRW',
            billing: r.billing || [0,0,0,0,0],
            billingDates: r.billing_dates || ['','','','',''],
            billingCurrencies: r.billing_currencies || ['KRW','KRW','KRW','KRW','KRW'],
            renewcycle: r.renew_cycle || '', expiredate: r.expire_date || '',
            consultStatus: r.consult_status || '', failReason: r.fail_reason || '',
            note: r.note || '', contactName: r.contact_name || '',
            contactPhone: r.contact_phone || '', contactEmail: r.contact_email || '',
            quoteDate: r.quote_date || '', quoteAmount: Number(r.quote_amount || 0),
            quoteFile: r.quote_file || '', q: r.q || 1,
            expAudit: Number(r.exp_audit || 0), expTest: Number(r.exp_test || 0),
            expTrip:  Number(r.exp_trip  || 0), expExtra: r.exp_extra || [],
            refAudit: Number(r.ref_audit || 0), refFee: Number(r.ref_fee || 0),
            refMemo:  r.ref_memo || '', refExtra: r.ref_extra || [],
        }));

        state.cert = (cR.data || []).map(r => ({
            id: r.id, year: r.year, recordType: r.record_type || 'contract',
            client: r.client || '', certtype: r.cert_type || '',
            manager: r.manager || '', contractdate: r.contract_date || '',
            date: r.date || '', stage: r.stage || '',
            issuedate: r.issue_date || '', contracted: r.contracted || '미계약',
            amount: Number(r.amount || 0), amountCurrency: r.amount_currency || 'KRW',
            billing: r.billing || [0,0,0,0,0],
            billingDates: r.billing_dates || ['','','','',''],
            billingCurrencies: r.billing_currencies || ['KRW','KRW','KRW','KRW','KRW'],
            renewcycle: r.renew_cycle || '', expiredate: r.expire_date || '',
            failReason: r.fail_reason || '', note: r.note || '',
            contactName: r.contact_name || '', contactPhone: r.contact_phone || '',
            contactEmail: r.contact_email || '', quoteDate: r.quote_date || '',
            quoteAmount: Number(r.quote_amount || 0), quoteFile: r.quote_file || '',
            etcMemo: r.etc_memo || '', q: r.q || 1,
            expAudit: Number(r.exp_audit || 0), expTest: Number(r.exp_test || 0),
            expTrip:  Number(r.exp_trip  || 0), expExtra: r.exp_extra || [],
            refAudit: Number(r.ref_audit || 0), refFee: Number(r.ref_fee || 0),
            refMemo:  r.ref_memo || '', refExtra: r.ref_extra || [],
        }));

        const rd = rR.data?.data || {};
        state.revenue = {};
        Object.keys(rd).forEach(k => {
            if (k === '_kpiEdu')                 state.kpiEdu = rd[k] || {};
            else if (k === '_qualData')          state.qualData = rd[k];
            else if (k === '_eduRecords')        state.eduRecords = rd[k] || [];
            else if (k === '_tasks')             state.tasks = rd[k] || [];
            else if (k === '_bottleneckReasons') state.bottleneckReasons = rd[k] || {};
            else if (k === '_strategy')          state.strategy = rd[k] || {};  // 3년 전략기획 복원
            else                                 state.revenue[k] = rd[k];
        });

        return true;
    } catch (e) {
        console.error('loadAllData 오류:', e);
        return false;
    }
}
