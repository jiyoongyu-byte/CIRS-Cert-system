// js/core/store.js — 전역 상태 금고 (기존 단일파일 state 구조 유지)

import { initSb, loadAllData, saveRevenueState } from './api.js';

// ── Private 상태 변수 ─────────────────────────────────────────────
let currentUser = '';
let currentYear = new Date().getFullYear();
let currentView = 'dashboard';
let revTeam = 'med';
let kpiTab = 'qual';
let medEditId = null;
let certEditId = null;
let editingTaskId = null;
let editingEduId = null;
let completingTaskId = null;
let medIsContract = true;
let certIsContract = true;

// 기존 단일파일 state 구조 완전 일치
let state = {
    med: [],
    cert: [],
    revenue: {},          // { 2026: { med: {q1,q2,q3,q4}, cert: {q1,q2,q3,q4} } }
    kpiEdu: {},
    qualData: null,
    eduRecords: [],
    tasks: [],
    bottleneckReasons: {},
    pw: 'cirs2026!',
};

// qualData 작업용 복사본 (편집 시 사용)
let qualData = {};

// ── Getters ───────────────────────────────────────────────────────
export const getState = () => state;
export const getCurrentUser = () => currentUser;
export const getCurrentYear = () => currentYear;
export const getCurrentView = () => currentView;
export const getRevTeam = () => revTeam;
export const getKpiTab = () => kpiTab;
export const getMedEditId = () => medEditId;
export const getCertEditId = () => certEditId;
export const getEditingTaskId = () => editingTaskId;
export const getEditingEduId = () => editingEduId;
export const getCompletingTaskId = () => completingTaskId;
export const getMedIsContract = () => medIsContract;
export const getCertIsContract = () => certIsContract;
export const getQualData = () => qualData;

// ── Setters ───────────────────────────────────────────────────────
export const setCurrentUser = (u) => { currentUser = u; };
export const setCurrentYear = (y) => { currentYear = parseInt(y); };
export const setCurrentView = (v) => { currentView = v; };
export const setRevTeam = (t) => { revTeam = t; };
export const setKpiTab = (t) => { kpiTab = t; };
export const setMedEditId = (id) => { medEditId = id; };
export const setCertEditId = (id) => { certEditId = id; };
export const setEditingTaskId = (id) => { editingTaskId = id; };
export const setEditingEduId = (id) => { editingEduId = id; };
export const setCompletingTaskId = (id) => { completingTaskId = id; };
export const setMedIsContract = (v) => { medIsContract = v; };
export const setCertIsContract = (v) => { certIsContract = v; };

// ── 연도 초기화 (없는 연도 접근 시 자동 생성) ─────────────────────
export function ensureRevYear(y) {
    if (!state.revenue[y])
        state.revenue[y] = { med: {q1:0,q2:0,q3:0,q4:0}, cert: {q1:0,q2:0,q3:0,q4:0} };
    if (!state.revenue[y].med)  state.revenue[y].med  = {q1:0,q2:0,q3:0,q4:0};
    if (!state.revenue[y].cert) state.revenue[y].cert = {q1:0,q2:0,q3:0,q4:0};
}

// ── qualData 동기화 (QUAL_MASTER와 state.qualData 병합) ───────────
export function syncQualData(QUAL_MASTER) {
    qualData = JSON.parse(JSON.stringify(QUAL_MASTER));
    if (state.qualData) Object.assign(qualData, state.qualData);
}

// ── Supabase에서 전체 로드 ────────────────────────────────────────
export async function loadFromSupabase() {
    initSb();
    const ok = await loadAllData(state);
    ensureRevYear(currentYear);
    return ok;
}

// ── 전체 상태 저장 ────────────────────────────────────────────────
export async function saveState() {
    await saveRevenueState(state);
}

// ── window 전역 등록 (HTML onclick 호환) ──────────────────────────
window._store = {
    getState, getCurrentUser, getCurrentYear, getCurrentView,
    getRevTeam, getKpiTab, getMedEditId, getCertEditId,
    getEditingTaskId, getCompletingTaskId,
    getMedIsContract, getCertIsContract, getQualData,
    setCurrentUser, setCurrentYear, setCurrentView, setRevTeam, setKpiTab,
    setMedEditId, setCertEditId, setEditingTaskId, setEditingEduId,
    setCompletingTaskId, setMedIsContract, setCertIsContract,
    ensureRevYear, syncQualData, loadFromSupabase, saveState,
};
