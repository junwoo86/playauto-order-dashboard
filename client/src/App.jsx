import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subMonths, subDays } from 'date-fns';

import Layout from './components/Layout/Layout';
import Dashboard from './components/Dashboard/Dashboard';
import DateFilter from './components/Dashboard/DateFilter';
import MappingManager from './components/Mapping/MappingManager';
import CampaignManager from './components/Campaign/CampaignManager';
import CoffeeDashboard from './components/Dashboard/CoffeeDashboard';
import TeamketoDashboard from './components/Teamketo/TeamketoDashboard';
import Login from './components/Login/Login';

import { getSyncStatus } from './services/api';

function App() {
  // 인증 상태
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });

  // 현재 페이지
  const [currentPage, setCurrentPage] = useState('dashboard');

  // 기본 날짜 범위: 그저께 기준 최근 3개월
  // 오늘/어제 주문은 플레이오토에서 완전히 수집되지 않으므로 2일 전(edate)까지
  const today = new Date();
  const [dateRange, setDateRange] = useState({
    sdate: format(subMonths(subDays(today, 1), 3), 'yyyy-MM-dd'),
    edate: format(subDays(today, 2), 'yyyy-MM-dd')
  });

  const [selectedShop, setSelectedShop] = useState(null);

  // 내부 확인용 제외 필터 (기본값: 제외)
  const [excludeInternal, setExcludeInternal] = useState(true);

  // 동기화 상태 조회
  const { data: syncStatus, refetch: refetchSyncStatus } = useQuery({
    queryKey: ['syncStatus'],
    queryFn: getSyncStatus,
    refetchInterval: 5000 // 5초마다 갱신
  });

  const handleDateChange = (sdate, edate) => {
    setDateRange({ sdate, edate });
  };

  const handleShopChange = (shopCd) => {
    setSelectedShop(shopCd);
  };

  // 로그아웃 핸들러
  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userEmail');
    setIsAuthenticated(false);
  };

  // 로그인 전 화면
  if (!isAuthenticated) {
    return <Login onLogin={setIsAuthenticated} />;
  }

  return (
    <Layout
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      syncStatus={syncStatus}
      onSyncComplete={refetchSyncStatus}
      onLogout={handleLogout}
    >
      {currentPage === 'dashboard' ? (
        <div className="space-y-6">
          {/* 그라디언트 헤더 + 필터 */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-lg shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold">분석서비스 & 건기식</h2>
                <p className="text-blue-200 mt-1">스토어별/상품별 매출 분석 및 판매 예측</p>
              </div>
            </div>
            <DateFilter
              sdate={dateRange.sdate}
              edate={dateRange.edate}
              onChange={handleDateChange}
              selectedShop={selectedShop}
              onShopChange={handleShopChange}
              excludeInternal={excludeInternal}
              onExcludeInternalChange={setExcludeInternal}
              darkMode={true}
            />
          </div>

          {/* 대시보드 */}
          {syncStatus?.stats?.totalOrders > 0 ? (
            <Dashboard
              dateRange={dateRange}
              selectedShop={selectedShop}
              excludeInternal={excludeInternal}
            />
          ) : (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-gray-400 text-6xl mb-4">📊</div>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                데이터가 없습니다
              </h2>
              <p className="text-gray-500">
                상단의 "데이터 동기화" 버튼을 클릭하여 플레이오토에서 주문 데이터를 가져오세요.
              </p>
            </div>
          )}
        </div>
      ) : currentPage === 'mapping' ? (
        <MappingManager />
      ) : currentPage === 'campaigns' ? (
        <CampaignManager />
      ) : currentPage === 'coffee' ? (
        <CoffeeDashboard />
      ) : currentPage === 'teamketo' ? (
        <TeamketoDashboard />
      ) : null}
    </Layout>
  );
}

export default App;
