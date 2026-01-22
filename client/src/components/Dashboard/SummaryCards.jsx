import { differenceInDays, subDays, startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

function SummaryCards({ data, isLoading, dateRange }) {
  const formatDateRange = () => {
    if (!dateRange?.sdate || !dateRange?.edate) return null;
    return `${dateRange.sdate} ~ ${dateRange.edate}`;
  };

  // 현재 선택된 날짜 범위에 해당하는 프리셋 라벨 계산
  const getDateRangeLabel = () => {
    if (!dateRange?.sdate || !dateRange?.edate) return '';

    const today = new Date();
    const sdate = new Date(dateRange.sdate);
    const edate = new Date(dateRange.edate);
    const days = differenceInDays(edate, sdate) + 1;

    // 특정 월의 1일~말일인지 확인 (이번 달, 지난 달, 또는 다른 특정 월)
    const sdateMonthStart = startOfMonth(sdate);
    const sdateMonthEnd = endOfMonth(sdate);
    const isFullMonth = format(sdate, 'yyyy-MM-dd') === format(sdateMonthStart, 'yyyy-MM-dd') &&
                        format(edate, 'yyyy-MM-dd') === format(sdateMonthEnd, 'yyyy-MM-dd');

    if (isFullMonth) {
      // 특정 월 전체 선택 시 "YY년 M월" 형식으로 표시
      const year = format(sdate, 'yy');
      const month = format(sdate, 'M');
      return `(${year}년 ${month}월)`;
    }

    // 최근 7일
    if (days >= 6 && days <= 8) return '(최근 7일)';
    // 최근 30일
    if (days >= 29 && days <= 32) return '(최근 30일)';
    // 최근 3개월
    if (days >= 89 && days <= 93) return '(최근 3개월)';
    // 최근 1년
    if (days >= 364 && days <= 367) return '(최근 1년)';
    // 그 외
    return `(${days}일간)`;
  };

  const cards = [
    {
      title: '총 주문',
      value: data?.summary?.totalOrders || 0,
      format: 'number',
      suffix: '건',
      icon: '📋',
      color: 'blue'
    },
    {
      title: '총 매출',
      value: data?.summary?.totalRevenue || 0,
      format: 'currency',
      icon: '💰',
      color: 'green'
    },
    {
      title: '총 판매수량',
      value: data?.summary?.totalQuantity || 0,
      format: 'number',
      suffix: '개',
      icon: '📦',
      color: 'purple'
    },
    {
      title: '평균 객단가',
      value: data?.summary?.avgOrderValue || 0,
      format: 'currency',
      icon: '💳',
      color: 'orange'
    }
  ];

  const formatValue = (value, format, suffix = '') => {
    if (format === 'currency') {
      return `₩${value.toLocaleString()}`;
    }
    return `${value.toLocaleString()}${suffix}`;
  };

  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
    orange: 'bg-orange-50 border-orange-200'
  };

  if (isLoading) {
    return (
      <div>
        {/* 조회 기간 표시 */}
        <div className="mb-4 text-base text-gray-600">
          <span className="font-semibold text-gray-800 text-lg">조회 기간:</span>{' '}
          <span className="text-lg">{formatDateRange() || '로딩 중...'}</span>
          {getDateRangeLabel() && <span className="ml-2 text-blue-600 font-medium">{getDateRangeLabel()}</span>}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-20 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 조회 기간 표시 */}
      <div className="mb-4 text-base text-gray-600">
        <span className="font-semibold text-gray-800 text-lg">조회 기간:</span>{' '}
        <span className="text-lg text-gray-900">{formatDateRange() || '-'}</span>
        {getDateRangeLabel() && <span className="ml-2 text-blue-600 font-medium">{getDateRangeLabel()}</span>}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.title}
            className={`rounded-lg shadow p-4 border card-hover ${colorClasses[card.color]}`}
          >
            <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
              <span>{card.icon}</span>
              <span>{card.title}</span>
            </div>
            <div className="text-2xl font-bold text-gray-800 number-format">
              {formatValue(card.value, card.format, card.suffix)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SummaryCards;
