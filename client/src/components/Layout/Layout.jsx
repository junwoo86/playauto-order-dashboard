import { useMutation, useQueryClient } from '@tanstack/react-query';
import { startRecentSync } from '../../services/api';

// 날짜 포맷: yy년 mm월 dd일
const formatDateKorean = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}년 ${mm}월 ${dd}일`;
};

function Layout({ children, currentPage, onPageChange, syncStatus, onSyncComplete }) {
  const queryClient = useQueryClient();

  // 최근 2주 동기화 (7일씩 쪼개서)
  const recentSyncMutation = useMutation({
    mutationFn: () => startRecentSync(2), // 2주
    onSuccess: () => {
      queryClient.invalidateQueries(['syncStatus']);
      onSyncComplete?.();
    }
  });

  const isSyncing = syncStatus?.isRunning || recentSyncMutation.isPending;

  const navItems = [
    { id: 'dashboard', label: '분석서비스&건기식', icon: '📊', color: 'blue' },
    { id: 'coffee', label: '더클린커피', icon: '☕', color: 'amber' },
    { id: 'teamketo', label: '팀키토', icon: '🥗', color: 'emerald' },
    { id: 'mapping', label: 'SKU 매핑 관리', icon: '🔗', color: 'blue' },
    { id: 'campaigns', label: '공구 일정', icon: '📅', color: 'blue' },
  ];

  const getNavItemClass = (item) => {
    const isActive = currentPage === item.id;
    const baseClass = 'w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors';

    if (isActive) {
      if (item.color === 'amber') return `${baseClass} bg-amber-600 text-white`;
      if (item.color === 'emerald') return `${baseClass} bg-emerald-600 text-white`;
      return `${baseClass} bg-blue-600 text-white`;
    }
    return `${baseClass} text-gray-600 hover:bg-gray-100`;
  };

  // 데이터 기간 표시
  const dateRangeText = syncStatus?.stats?.dateRange
    ? `${formatDateKorean(syncStatus.stats.dateRange.from)} ~ ${formatDateKorean(syncStatus.stats.dateRange.to)}`
    : '-';

  // 마지막 동기화 시간 (한국 시간)
  const lastSyncText = formatDateKorean(syncStatus?.lastSync?.completed_at);

  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      {/* 상단 헤더 - 동기화 정보 */}
      <header className="bg-white shadow-sm border-b flex-shrink-0 z-50">
        <div className="px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            {/* 좌측: 로고 + 타이틀 */}
            <div className="flex items-center gap-3">
              <span className="text-2xl">📊</span>
              <div>
                <h1 className="text-lg font-bold text-gray-900">
                  플레이오토 주문 분석
                </h1>
                <p className="text-xs text-gray-500">
                  바이오컴 매출 분석 대시보드
                </p>
              </div>
            </div>

            {/* 우측: 동기화 정보 */}
            <div className="flex items-center gap-6">
              {/* 데이터 기간 */}
              <div className="hidden md:flex items-center gap-2 text-sm">
                <span className="text-gray-500">데이터 기간:</span>
                <span className="font-medium text-gray-900">{dateRangeText}</span>
              </div>

              {/* 마지막 동기화 */}
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <span className="text-gray-500">마지막 동기화:</span>
                <span className="font-medium text-gray-900">{lastSyncText}</span>
              </div>

              {/* 동기화 버튼 - 최근 2주 고정 */}
              <button
                onClick={() => recentSyncMutation.mutate()}
                disabled={isSyncing}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isSyncing
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isSyncing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>동기화 중...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>데이터 동기화 (최근 2주)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 좌측 사이드바 - 고정 */}
        <aside className="w-56 bg-white border-r shadow-sm flex-shrink-0 overflow-y-auto">
          <nav className="p-4 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={getNavItemClass(item)}
                onClick={() => onPageChange(item.id)}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          {/* 푸터 - 사이드바 하단 */}
          <div className="absolute bottom-0 left-0 w-56 p-3 border-t bg-white">
            <p className="text-center text-xs text-gray-400">
              Powered by PlayAuto
            </p>
          </div>
        </aside>

        {/* 메인 콘텐츠 - 독립 스크롤 */}
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;
