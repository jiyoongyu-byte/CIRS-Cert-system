// [모듈화 파트 3의 1번째 작업] - /js/views/dashboard.js

// 1. 코어(Core) 모듈 불러오기
import { getState, getCurrentYear, getCurrentUser } from '../core/store.js';
import { fmt, tt } from '../core/utils.js';

// 차트 인스턴스를 보관할 전역 변수 (화면 이동 시 차트가 중복 생성되는 메모리 누수 방지)
let revenueChartInstance = null;

// 2. 대시보드 렌더링 메인 함수
export function renderDashboard() {
    const state = getState();
    const year = getCurrentYear();
    const user = getCurrentUser();

    // [사전 차단 로직 1] 대시보드 화면 요소가 없으면 백화현상 방지를 위해 즉시 실행 중지
    const dbView = document.getElementById('view-dashboard');
    if (!dbView) return;

    // 3. 권한 및 블라인드 처리 로직 (임원진 외에는 수익금 노출 금지)
    const EXECS = ['대표이사', '부사장', '본부장'];
    const isExec = EXECS.includes(user);

    // 4. 수입 통계 계산 (의료기기팀 + 인증팀의 '계약' 건만 합산)
    let totalMed = 0, totalCert = 0;
    (state.med || []).forEach(r => { 
        if(r.year === year && r.recordType === 'contract') totalMed += Number(r.amount || 0); 
    });
    (state.cert || []).forEach(r => { 
        if(r.year === year && r.recordType === 'contract') totalCert += Number(r.amount || 0); 
    });

    // 5. 화면에 값 뿌려주기 (DOM 참조 에러 방지 적용)
    const medEl = document.getElementById('db-med-rev');
    const certEl = document.getElementById('db-cert-rev');
    const totalEl = document.getElementById('db-total-rev');

    // 권한에 따른 포맷팅 (isExec가 false면 *** 출력)
    if (medEl) medEl.textContent = isExec ? fmt(totalMed) : '***';
    if (certEl) certEl.textContent = isExec ? fmt(totalCert) : '***';
    if (totalEl) totalEl.textContent = isExec ? fmt(totalMed + totalCert) : '***';

    // [사전 차단 로직 2] Chart.js 로딩 꼬임 방지
    if (typeof Chart === 'undefined') {
        console.warn('⚠️ Chart.js가 아직 로드되지 않아 그래프를 그릴 수 없습니다.');
        return;
    }

    renderChart(totalMed, totalCert, isExec);
}

// 6. 차트 그리기 내부 함수
function renderChart(medRev, certRev, isExec) {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    // 기존에 그려진 차트가 있다면 파괴하여 데이터 겹침 현상 원천 차단
    if (revenueChartInstance) {
        revenueChartInstance.destroy();
    }

    // 블라인드 처리 시 차트의 파이 조각도 0으로 가림
    const dataMed = isExec ? medRev : 0;
    const dataCert = isExec ? certRev : 0;

    revenueChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [tt('의료기기팀', '医疗器械组'), tt('제품환경인증팀', '产品环境认证组')],
            datasets: [{
                data: [dataMed, dataCert],
                backgroundColor: ['#5B6EF5', '#19A876'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#BAC0CB' } }
            }
        }
    });
}

// [사전 차단 로직 3] 클릭 증발 에러 방지 브릿지
// HTML 뼈대에서 이 함수를 자유롭게 부를 수 있도록 window 객체에 연결
window.renderDashboard = renderDashboard;