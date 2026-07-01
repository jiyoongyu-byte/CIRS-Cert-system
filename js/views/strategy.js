// js/views/strategy.js — 3년 전략기획 뷰 (2027~2029)
// CIRS Group Korea 인증관리시스템

// ── 현재 선택된 팀 및 탭 상태 ──────────────────────────────────────
let _team = 'med';   // 'med' | 'cert'
let _tab  = 'bg';    // 'bg' | 'pestel' | 'swot' | 'portfolio'

// ── 팀별 기본 데이터 구조 생성 ────────────────────────────────────
function defaultTeamData() {
    return {
        background: '',
        pestel: [],
        swot: { S: '', W: '', O: '', T: '', SO: '', WO: '', ST: '', WT: '' },
        swotPoints: {
            opportunities: [],  // 기회점: [{name,source,ext,capability,priority,value,note}]
            growth: [],         // 성장점
            breakthrough: [],   // 돌파점
        },
        portfolio: [],
        // portfolio 행: {tier:'핵심',name:'',rev2026:0,pct2026:0,t2027:0,t2028:0,t2029:0,tasks:'',capability:'',priority:'',owner:''}
    };
}

// ── state에서 팀 데이터를 안전하게 가져오기 ──────────────────────
function getTeamData(team) {
    const state = window._store?.getState?.() || {};
    if (!state.strategy) state.strategy = {};
    if (!state.strategy[team]) state.strategy[team] = defaultTeamData();
    // 기존 데이터에 누락 필드 보완
    const d = state.strategy[team];
    if (!d.background)   d.background = '';
    if (!d.pestel)        d.pestel = [];
    if (!d.swot)          d.swot = { S:'', W:'', O:'', T:'', SO:'', WO:'', ST:'', WT:'' };
    if (!d.swotPoints)    d.swotPoints = { opportunities:[], growth:[], breakthrough:[] };
    if (!d.portfolio)     d.portfolio = [];
    return d;
}

// ── 영향강도/발생확률 별점 표시 헬퍼 ────────────────────────────
function stars(n) {
    const num = parseInt(n) || 0;
    return '★'.repeat(num) + '☆'.repeat(Math.max(0, 5 - num));
}

// ── 섹션별 HTML 렌더링 함수들 ─────────────────────────────────────

/** 배경 및 취지 섹션 HTML */
function renderBgSection(data, editMode) {
    if (editMode) {
        return `
        <div class="strat-card">
            <div class="strat-section-head">
                <span class="strat-section-label">배경 및 취지</span>
                <button class="btn btn-sm btn-med" onclick="saveStrategySection('${_team}','bg')">💾 저장</button>
            </div>
            <textarea id="strat-bg-input" style="width:100%;min-height:220px;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text1);font-size:13px;font-family:var(--sans);resize:vertical;outline:none;line-height:1.7;">${escHtml(data.background || '')}</textarea>
        </div>`;
    }
    return `
    <div class="strat-card">
        <div class="strat-section-head">
            <span class="strat-section-label">배경 및 취지</span>
            <button class="btn btn-sm" onclick="switchStrategyTab('bg', true)">✏️ 편집</button>
        </div>
        <pre style="white-space:pre-wrap;font-family:var(--sans);font-size:13px;color:var(--text1);line-height:1.7;min-height:60px;">${escHtml(data.background || '(내용 없음 — 편집 버튼을 클릭하여 입력하세요)')}</pre>
    </div>`;
}

/** PESTEL 행 HTML (보기용) */
function pestelRowView(r, idx) {
    const typeStyle = r.type === 'O'
        ? 'background:rgba(91,110,245,0.15);color:var(--med);border:1px solid var(--med)'
        : 'background:rgba(240,82,82,0.15);color:var(--danger);border:1px solid var(--danger)';
    return `<tr>
        <td style="text-align:center;color:var(--text3)">${idx + 1}</td>
        <td><span style="font-size:11px;font-weight:700;color:var(--text2)">${escHtml(r.dimension || '')}</span></td>
        <td style="max-width:220px">${escHtml(r.trend || '')}</td>
        <td style="max-width:160px">${escHtml(r.impact || '')}</td>
        <td style="text-align:center;font-size:11px;color:var(--warn);white-space:nowrap">${stars(r.strength)}</td>
        <td style="text-align:center;font-size:11px;color:var(--warn);white-space:nowrap">${stars(r.probability)}</td>
        <td style="max-width:180px">${escHtml(r.response || '')}</td>
        <td style="text-align:center"><span class="badge" style="${typeStyle}">${r.type === 'O' ? '기회(O)' : '위협(T)'}</span></td>
    </tr>`;
}

/** PESTEL 행 HTML (편집용) */
function pestelRowEdit(r, idx) {
    const dims = ['법규·정책','산업발전동향','동종업계경쟁','기술변혁','거시환경'];
    const dimOpts = dims.map(d =>
        `<option value="${d}" ${r.dimension === d ? 'selected' : ''}>${d}</option>`
    ).join('');
    return `<tr id="pestel-row-${idx}">
        <td style="text-align:center;color:var(--text3)">${idx + 1}</td>
        <td><select class="strat-input" style="min-width:100px" onchange="updatePestelField(${idx},'dimension',this.value)">
            <option value="">선택</option>${dimOpts}</select></td>
        <td><input class="strat-input" value="${escAttr(r.trend||'')}" oninput="updatePestelField(${idx},'trend',this.value)" style="min-width:140px"></td>
        <td><input class="strat-input" value="${escAttr(r.impact||'')}" oninput="updatePestelField(${idx},'impact',this.value)" style="min-width:120px"></td>
        <td style="text-align:center">
            <input type="range" min="1" max="5" value="${r.strength||3}" style="width:80px"
                oninput="updatePestelField(${idx},'strength',parseInt(this.value)); document.getElementById('pestel-str-${idx}').textContent=this.value">
            <span id="pestel-str-${idx}" style="font-size:11px;color:var(--warn)">${r.strength||3}</span>
        </td>
        <td style="text-align:center">
            <input type="range" min="1" max="5" value="${r.probability||3}" style="width:80px"
                oninput="updatePestelField(${idx},'probability',parseInt(this.value)); document.getElementById('pestel-prob-${idx}').textContent=this.value">
            <span id="pestel-prob-${idx}" style="font-size:11px;color:var(--warn)">${r.probability||3}</span>
        </td>
        <td><input class="strat-input" value="${escAttr(r.response||'')}" oninput="updatePestelField(${idx},'response',this.value)" style="min-width:140px"></td>
        <td style="text-align:center">
            <select class="strat-input" style="width:70px" onchange="updatePestelField(${idx},'type',this.value)">
                <option value="O" ${r.type==='O'?'selected':''}>기회(O)</option>
                <option value="T" ${r.type==='T'?'selected':''}>위협(T)</option>
            </select>
        </td>
        <td><button class="btn btn-sm btn-danger" onclick="deletePestelRow(${idx})">삭제</button></td>
    </tr>`;
}

/** 외부환경 분석(PESTEL) 섹션 HTML */
function renderPestelSection(data, editMode) {
    const rows = data.pestel || [];
    const thead = `<thead><tr>
        <th style="width:36px">번호</th><th>차원</th><th>트렌드/이벤트</th><th>자사영향</th>
        <th style="width:90px">영향강도</th><th style="width:90px">발생확률</th>
        <th>기업대응방향</th><th style="width:80px">O/T</th>
        ${editMode ? '<th style="width:50px">삭제</th>' : ''}
    </tr></thead>`;
    const tbody = rows.length
        ? rows.map((r, i) => editMode ? pestelRowEdit(r, i) : pestelRowView(r, i)).join('')
        : `<tr><td colspan="${editMode ? 9 : 8}" class="empty-row">데이터가 없습니다. 행을 추가해주세요.</td></tr>`;

    if (editMode) {
        return `
        <div class="strat-card">
            <div class="strat-section-head">
                <span class="strat-section-label">외부환경 분석 (PESTEL)</span>
                <div style="display:flex;gap:8px">
                    <button class="btn btn-sm" onclick="addPestelRow()">+ 행 추가</button>
                    <button class="btn btn-sm btn-med" onclick="saveStrategySection('${_team}','pestel')">💾 저장</button>
                </div>
            </div>
            <div class="table-wrap"><table>${thead}<tbody id="pestel-tbody">${tbody}</tbody></table></div>
        </div>`;
    }
    return `
    <div class="strat-card">
        <div class="strat-section-head">
            <span class="strat-section-label">외부환경 분석 (PESTEL)</span>
            <button class="btn btn-sm" onclick="switchStrategyTab('pestel', true)">✏️ 편집</button>
        </div>
        <div class="table-wrap"><table>${thead}<tbody>${tbody}</tbody></table></div>
    </div>`;
}

/** SWOT 2×2 그리드 HTML */
function swotGrid(swot, editMode) {
    const cell = (key, label, color) => {
        const content = editMode
            ? `<textarea class="strat-input" style="min-height:100px;resize:vertical" id="swot-${key}" oninput="updateSwotField('${key}',this.value)">${escHtml(swot[key]||'')}</textarea>`
            : `<pre style="white-space:pre-wrap;font-size:12px;color:var(--text1);line-height:1.6">${escHtml(swot[key]||'(미입력)')}</pre>`;
        return `<div style="border:1px solid var(--border);border-radius:8px;padding:14px;">
            <div style="font-size:11px;font-weight:800;color:${color};margin-bottom:8px;letter-spacing:.05em">${label}</div>
            ${content}
        </div>`;
    };
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        ${cell('S','S — 강점 (Strength)','var(--med)')}
        ${cell('W','W — 약점 (Weakness)','var(--danger)')}
        ${cell('O','O — 기회 (Opportunity)','var(--cert)')}
        ${cell('T','T — 위협 (Threat)','var(--warn)')}
    </div>`;
}

/** SWOT 전략 그리드 HTML */
function swotStratGrid(swot, editMode) {
    const cell = (key, label, desc) => {
        const content = editMode
            ? `<textarea class="strat-input" style="min-height:80px;resize:vertical" id="swot-${key}" oninput="updateSwotField('${key}',this.value)">${escHtml(swot[key]||'')}</textarea>`
            : `<pre style="white-space:pre-wrap;font-size:12px;color:var(--text1);line-height:1.6">${escHtml(swot[key]||'(미입력)')}</pre>`;
        return `<div style="border:1px solid var(--border);border-radius:8px;padding:14px;">
            <div style="font-size:11px;font-weight:800;color:var(--accent);margin-bottom:4px">${label}</div>
            <div style="font-size:10px;color:var(--text3);margin-bottom:8px">${desc}</div>
            ${content}
        </div>`;
    };
    return `<div style="margin-bottom:8px;font-size:12px;font-weight:700;color:var(--text2)">전략 방향</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        ${cell('SO','SO 전략','강점 × 기회 — 공격적 확장')}
        ${cell('WO','WO 전략','약점 × 기회 — 보완 후 진출')}
        ${cell('ST','ST 전략','강점 × 위협 — 차별화 방어')}
        ${cell('WT','WT 전략','약점 × 위협 — 리스크 최소화')}
    </div>`;
}

/** SWOT 하위 포인트 테이블 HTML (기회점/성장점/돌파점) */
function swotPointTable(pointKey, label, points, editMode) {
    const cols = ['name','source','ext','capability','priority','value','note'];
    const labels = ['항목명','출처(내부/외부)','외부환경','필요역량','우선순위','기대가치','비고'];
    const thead = `<thead><tr>
        ${labels.map(l => `<th>${l}</th>`).join('')}
        ${editMode ? '<th>삭제</th>' : ''}
    </tr></thead>`;

    const tbody = (points && points.length)
        ? points.map((p, i) => {
            if (editMode) {
                const cells = cols.map(c =>
                    `<td><input class="strat-input" value="${escAttr(p[c]||'')}" oninput="updateSwotPoint('${pointKey}',${i},'${c}',this.value)" style="min-width:80px"></td>`
                ).join('');
                return `<tr>${cells}<td><button class="btn btn-sm btn-danger" onclick="deleteSwotPointRow('${pointKey}',${i})">삭제</button></td></tr>`;
            }
            return `<tr>${cols.map(c => `<td>${escHtml(p[c]||'')}</td>`).join('')}</tr>`;
          }).join('')
        : `<tr><td colspan="${editMode ? cols.length + 1 : cols.length}" class="empty-row">데이터 없음</td></tr>`;

    const addBtn = editMode
        ? `<button class="btn btn-sm" style="margin-top:8px" onclick="addSwotPointRow('${pointKey}')">+ 행 추가</button>`
        : '';
    return `<div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:800;color:var(--accent);margin-bottom:8px">${label}</div>
        <div class="table-wrap"><table>${thead}<tbody>${tbody}</tbody></table></div>
        ${addBtn}
    </div>`;
}

/** SWOT 분석 섹션 HTML */
function renderSwotSection(data, editMode) {
    const swot = data.swot || {};
    const sp   = data.swotPoints || { opportunities:[], growth:[], breakthrough:[] };

    const content = swotGrid(swot, editMode)
        + swotStratGrid(swot, editMode)
        + swotPointTable('opportunities', '기회점 (Opportunity Points)', sp.opportunities, editMode)
        + swotPointTable('growth',        '성장점 (Growth Points)',       sp.growth,        editMode)
        + swotPointTable('breakthrough',  '돌파점 (Breakthrough Points)', sp.breakthrough,  editMode);

    if (editMode) {
        return `<div class="strat-card">
            <div class="strat-section-head">
                <span class="strat-section-label">SWOT 분석</span>
                <button class="btn btn-sm btn-med" onclick="saveStrategySection('${_team}','swot')">💾 저장</button>
            </div>
            ${content}
        </div>`;
    }
    return `<div class="strat-card">
        <div class="strat-section-head">
            <span class="strat-section-label">SWOT 분석</span>
            <button class="btn btn-sm" onclick="switchStrategyTab('swot', true)">✏️ 편집</button>
        </div>
        ${content}
    </div>`;
}

/** 포트폴리오 섹션 — 티어별 테이블 */
function portfolioTierTable(tier, rows, editMode) {
    const tierColor = tier === '핵심' ? 'var(--med)'
                    : tier === '성장' ? 'var(--cert)'
                    : 'var(--warn)';
    const pctHint  = tier === '핵심' ? '자원 60%' : tier === '성장' ? '자원 30%' : '자원 10%';
    const tRows    = rows.filter(r => r.tier === tier);
    const allIdx   = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.tier === tier);

    // 합계 계산
    const sumRev   = tRows.reduce((s, r) => s + (parseFloat(r.rev2026)||0), 0);
    const sum2027  = tRows.reduce((s, r) => s + (parseFloat(r.t2027)||0), 0);
    const sum2028  = tRows.reduce((s, r) => s + (parseFloat(r.t2028)||0), 0);
    const sum2029  = tRows.reduce((s, r) => s + (parseFloat(r.t2029)||0), 0);

    const thead = `<thead><tr>
        <th>사업명</th><th>2026 예상매출(만원)</th><th>비중(%)</th>
        <th>2027 목표</th><th>2028 목표</th><th>2029 목표</th>
        <th>핵심실행과제</th><th>필요역량</th><th>우선순위</th><th>책임자</th>
        ${editMode ? '<th>삭제</th>' : ''}
    </tr></thead>`;

    const tfoot = `<tfoot><tr style="background:var(--bg);font-weight:700">
        <td>합계</td>
        <td style="font-family:var(--mono)">${sumRev.toLocaleString()}</td>
        <td>—</td>
        <td style="font-family:var(--mono)">${sum2027.toLocaleString()}</td>
        <td style="font-family:var(--mono)">${sum2028.toLocaleString()}</td>
        <td style="font-family:var(--mono)">${sum2029.toLocaleString()}</td>
        <td colspan="${editMode ? 5 : 4}"></td>
    </tr></tfoot>`;

    const tbody = allIdx.length
        ? allIdx.map(({ r, i }) => {
            if (editMode) {
                return `<tr>
                    <td><input class="strat-input" value="${escAttr(r.name||'')}" oninput="updatePortfolioField(${i},'name',this.value)"></td>
                    <td><input class="strat-input" type="number" value="${r.rev2026||0}" oninput="updatePortfolioField(${i},'rev2026',parseFloat(this.value)||0)" style="width:90px"></td>
                    <td><input class="strat-input" type="number" value="${r.pct2026||0}" oninput="updatePortfolioField(${i},'pct2026',parseFloat(this.value)||0)" style="width:60px"></td>
                    <td><input class="strat-input" type="number" value="${r.t2027||0}" oninput="updatePortfolioField(${i},'t2027',parseFloat(this.value)||0)" style="width:80px"></td>
                    <td><input class="strat-input" type="number" value="${r.t2028||0}" oninput="updatePortfolioField(${i},'t2028',parseFloat(this.value)||0)" style="width:80px"></td>
                    <td><input class="strat-input" type="number" value="${r.t2029||0}" oninput="updatePortfolioField(${i},'t2029',parseFloat(this.value)||0)" style="width:80px"></td>
                    <td><input class="strat-input" value="${escAttr(r.tasks||'')}" oninput="updatePortfolioField(${i},'tasks',this.value)"></td>
                    <td><input class="strat-input" value="${escAttr(r.capability||'')}" oninput="updatePortfolioField(${i},'capability',this.value)"></td>
                    <td><input class="strat-input" value="${escAttr(r.priority||'')}" oninput="updatePortfolioField(${i},'priority',this.value)" style="width:70px"></td>
                    <td><input class="strat-input" value="${escAttr(r.owner||'')}" oninput="updatePortfolioField(${i},'owner',this.value)" style="width:70px"></td>
                    <td><button class="btn btn-sm btn-danger" onclick="deletePortfolioRow(${i})">삭제</button></td>
                </tr>`;
            }
            return `<tr>
                <td style="font-weight:600">${escHtml(r.name||'')}</td>
                <td style="font-family:var(--mono)">${(parseFloat(r.rev2026)||0).toLocaleString()}</td>
                <td>${r.pct2026||0}%</td>
                <td style="font-family:var(--mono)">${(parseFloat(r.t2027)||0).toLocaleString()}</td>
                <td style="font-family:var(--mono)">${(parseFloat(r.t2028)||0).toLocaleString()}</td>
                <td style="font-family:var(--mono)">${(parseFloat(r.t2029)||0).toLocaleString()}</td>
                <td>${escHtml(r.tasks||'')}</td>
                <td>${escHtml(r.capability||'')}</td>
                <td>${escHtml(r.priority||'')}</td>
                <td>${escHtml(r.owner||'')}</td>
            </tr>`;
          }).join('')
        : `<tr><td colspan="${editMode ? 11 : 10}" class="empty-row">데이터 없음</td></tr>`;

    const addBtn = editMode
        ? `<button class="btn btn-sm" style="margin-bottom:16px" onclick="addPortfolioRow('${tier}')">+ ${tier} 사업 행 추가</button>`
        : '';

    return `<div style="margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span style="font-size:13px;font-weight:800;color:${tierColor}">${tier} 사업</span>
            <span style="font-size:11px;color:var(--text3);background:var(--bg);border:1px solid var(--border);padding:2px 8px;border-radius:12px">${pctHint}</span>
        </div>
        <div class="table-wrap"><table>${thead}<tbody>${tbody}</tbody>${tfoot}</table></div>
        ${addBtn}
    </div>`;
}

/** 사업 포트폴리오 섹션 HTML */
function renderPortfolioSection(data, editMode) {
    const portfolio = data.portfolio || [];
    const tiers = ['핵심', '성장', '신흥'];
    const content = tiers.map(t => portfolioTierTable(t, portfolio, editMode)).join('');

    if (editMode) {
        return `<div class="strat-card">
            <div class="strat-section-head">
                <span class="strat-section-label">사업 포트폴리오 (2027~2029)</span>
                <button class="btn btn-sm btn-med" onclick="saveStrategySection('${_team}','portfolio')">💾 저장</button>
            </div>
            ${content}
        </div>`;
    }
    return `<div class="strat-card">
        <div class="strat-section-head">
            <span class="strat-section-label">사업 포트폴리오 (2027~2029)</span>
            <button class="btn btn-sm" onclick="switchStrategyTab('portfolio', true)">✏️ 편집</button>
        </div>
        ${content}
    </div>`;
}

// ── 편집 중 인메모리 임시 상태 (섹션별 편집 시 버퍼) ──────────────
// state.strategy 자체를 직접 수정하는 방식 (저장 시 saveState 호출)

/** PESTEL 필드 즉시 업데이트 (편집 중 인메모리) */
window.updatePestelField = function(idx, field, val) {
    const d = getTeamData(_team);
    if (!d.pestel[idx]) return;
    d.pestel[idx][field] = val;
};

/** SWOT 필드 즉시 업데이트 */
window.updateSwotField = function(key, val) {
    const d = getTeamData(_team);
    d.swot[key] = val;
};

/** SWOT 포인트 필드 즉시 업데이트 */
window.updateSwotPoint = function(pointKey, idx, field, val) {
    const d = getTeamData(_team);
    if (!d.swotPoints[pointKey]?.[idx]) return;
    d.swotPoints[pointKey][idx][field] = val;
};

/** 포트폴리오 필드 즉시 업데이트 */
window.updatePortfolioField = function(idx, field, val) {
    const d = getTeamData(_team);
    if (!d.portfolio[idx]) return;
    d.portfolio[idx][field] = val;
};

// ── 행 추가/삭제 함수 ──────────────────────────────────────────────

/** PESTEL 행 추가 */
window.addPestelRow = function() {
    const d = getTeamData(_team);
    d.pestel.push({ id: 'R' + Date.now(), dimension: '', trend: '', impact: '', strength: 3, probability: 3, response: '', type: 'O' });
    switchStrategyTab(_tab, true); // 편집 모드 유지하며 재렌더
};

/** PESTEL 행 삭제 */
window.deletePestelRow = function(idx) {
    const d = getTeamData(_team);
    d.pestel.splice(idx, 1);
    switchStrategyTab(_tab, true);
};

/** SWOT 포인트 행 추가 */
window.addSwotPointRow = function(pointKey) {
    const d = getTeamData(_team);
    d.swotPoints[pointKey].push({ name:'', source:'', ext:'', capability:'', priority:'', value:'', note:'' });
    switchStrategyTab(_tab, true);
};

/** SWOT 포인트 행 삭제 */
window.deleteSwotPointRow = function(pointKey, idx) {
    const d = getTeamData(_team);
    d.swotPoints[pointKey].splice(idx, 1);
    switchStrategyTab(_tab, true);
};

/** 포트폴리오 행 추가 */
window.addPortfolioRow = function(tier) {
    const d = getTeamData(_team);
    d.portfolio.push({ tier, name:'', rev2026:0, pct2026:0, t2027:0, t2028:0, t2029:0, tasks:'', capability:'', priority:'', owner:'' });
    switchStrategyTab(_tab, true);
};

/** 포트폴리오 행 삭제 */
window.deletePortfolioRow = function(idx) {
    const d = getTeamData(_team);
    d.portfolio.splice(idx, 1);
    switchStrategyTab(_tab, true);
};

// ── 저장 함수 ──────────────────────────────────────────────────────

/**
 * 특정 섹션의 편집 데이터를 state에 반영하고 Supabase에 저장
 * @param {string} team  - 'med' | 'cert'
 * @param {string} section - 'bg' | 'pestel' | 'swot' | 'portfolio'
 */
window.saveStrategySection = async function(team, section) {
    const state = window._store?.getState?.();
    if (!state) return;

    // bg 섹션은 textarea 값을 직접 읽어 업데이트
    if (section === 'bg') {
        const val = document.getElementById('strat-bg-input')?.value ?? '';
        if (!state.strategy) state.strategy = {};
        if (!state.strategy[team]) state.strategy[team] = defaultTeamData();
        state.strategy[team].background = val;
    }
    // pestel/swot/portfolio 는 updatePestelField 등에서 이미 state에 반영되어 있음

    try {
        await window._store.saveState();
        // 저장 후 보기 모드로 전환
        switchStrategyTab(section === 'bg' ? 'bg'
            : section === 'pestel' ? 'pestel'
            : section === 'swot'   ? 'swot'
            : 'portfolio', false);
        showToast('저장되었습니다.');
    } catch (e) {
        console.error('strategy 저장 오류:', e);
        showToast('저장 실패: ' + e.message, true);
    }
};

// ── 탭 전환 함수 ──────────────────────────────────────────────────

/**
 * 섹션 탭 전환
 * @param {string} tab      - 'bg' | 'pestel' | 'swot' | 'portfolio'
 * @param {boolean} editMode - 편집 모드 여부
 */
window.switchStrategyTab = function(tab, editMode = false) {
    _tab = tab;
    const data = getTeamData(_team);
    const container = document.getElementById('strat-section-container');
    if (!container) return;

    // 탭 버튼 활성화 표시
    ['bg','pestel','swot','portfolio'].forEach(t => {
        const btn = document.getElementById(`strat-tab-${t}`);
        if (btn) btn.classList.toggle('strat-tab-active', t === tab);
    });

    // 섹션 렌더링
    let html = '';
    if      (tab === 'bg')        html = renderBgSection(data, editMode);
    else if (tab === 'pestel')    html = renderPestelSection(data, editMode);
    else if (tab === 'swot')      html = renderSwotSection(data, editMode);
    else if (tab === 'portfolio') html = renderPortfolioSection(data, editMode);

    container.innerHTML = html;
};

// ── 팀 탭 전환 ────────────────────────────────────────────────────
window.switchStrategyTeam = function(team) {
    _team = team;
    _tab  = 'bg'; // 팀 변경 시 첫 탭으로 초기화
    renderStrategy();
};

// ── 메인 렌더링 함수 ──────────────────────────────────────────────
window.renderStrategy = function() {
    const container = document.getElementById('view-strategy');
    if (!container) return;

    const teamLabel = _team === 'med' ? '의료기기팀' : '제품환경인증팀';
    const medActive   = _team === 'med'  ? 'team-tab active-med'  : 'team-tab';
    const certActive  = _team === 'cert' ? 'team-tab active-cert' : 'team-tab';

    container.innerHTML = `
    <style>
        /* 전략기획 뷰 전용 스타일 */
        .strat-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 16px;
        }
        .strat-section-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        .strat-section-label {
            font-size: 15px;
            font-weight: 700;
            color: var(--text1);
        }
        /* 섹션 탭 버튼 */
        .strat-tab {
            padding: 8px 18px;
            border-radius: 8px;
            border: 1px solid var(--border2);
            background: var(--card);
            color: var(--text2);
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all .15s;
        }
        .strat-tab:hover { background: var(--surface); color: var(--text1); }
        .strat-tab-active {
            background: var(--accent) !important;
            color: #fff !important;
            border-color: var(--accent) !important;
        }
        /* 인라인 편집 input 공통 */
        .strat-input {
            width: 100%;
            padding: 4px 6px;
            border: 1px solid var(--border);
            border-radius: 4px;
            background: var(--surface);
            color: var(--text1);
            font-size: 12px;
            font-family: var(--sans);
            outline: none;
        }
        .strat-input:focus { border-color: var(--accent); }
        textarea.strat-input { resize: vertical; }
    </style>

    <!-- 섹션 제목 -->
    <div class="section-head">
        <span class="section-title">📊 3년 전략기획 (2027~2029)</span>
    </div>

    <!-- 팀 탭 -->
    <div style="display:flex;gap:10px;margin-bottom:20px">
        <button class="${medActive}"  onclick="switchStrategyTeam('med')">의료기기팀</button>
        <button class="${certActive}" onclick="switchStrategyTeam('cert')">제품환경인증팀</button>
    </div>

    <!-- 섹션 탭 -->
    <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
        <button id="strat-tab-bg"        class="strat-tab ${_tab==='bg'?'strat-tab-active':''}"        onclick="switchStrategyTab('bg')">1. 배경 및 취지</button>
        <button id="strat-tab-pestel"    class="strat-tab ${_tab==='pestel'?'strat-tab-active':''}"    onclick="switchStrategyTab('pestel')">2. 외부환경 분석</button>
        <button id="strat-tab-swot"      class="strat-tab ${_tab==='swot'?'strat-tab-active':''}"      onclick="switchStrategyTab('swot')">3. SWOT 분석</button>
        <button id="strat-tab-portfolio" class="strat-tab ${_tab==='portfolio'?'strat-tab-active':''}" onclick="switchStrategyTab('portfolio')">4. 사업 포트폴리오</button>
    </div>

    <!-- 섹션 콘텐츠 컨테이너 -->
    <div id="strat-section-container"></div>
    `;

    // 초기 탭 렌더링 (보기 모드)
    switchStrategyTab(_tab, false);
};

// ── 유틸리티 ──────────────────────────────────────────────────────

/** HTML 특수문자 이스케이프 (XSS 방지) */
function escHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** HTML 속성 값 이스케이프 */
function escAttr(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/** 토스트 메시지 표시 */
function showToast(msg, isError = false) {
    let toast = document.getElementById('strat-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'strat-toast';
        toast.style.cssText = 'position:fixed;bottom:32px;right:32px;padding:12px 22px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.4);transition:opacity .3s';
        document.body.appendChild(toast);
    }
    toast.style.background  = isError ? 'var(--danger)' : 'var(--success)';
    toast.style.color        = '#fff';
    toast.style.opacity      = '1';
    toast.textContent        = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}
