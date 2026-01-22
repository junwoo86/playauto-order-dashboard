import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subMonths, subDays, subYears, startOfMonth, endOfMonth } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';
import { getTeamketoSummary, getTeamketoDaily, getTeamketoMonthly } from '../../services/api';

// 라인별 색상
const LINE_COLORS = {
  SA: '#10B981', // 슬로우 에이징 - 에메랄드
  SK: '#3B82F6', // 시그니처 키토 - 블루
  OK: '#F59E0B', // 오리지널 키토 - 앰버
  LF: '#8B5CF6', // 저포드맵 - 퍼플
  NS: '#6B7280', // 무설탕 - 그레이
  LUNCHBOX: '#EC4899', // 도시락 전체 - 핑크
  TOTAL: '#EF4444'  // 전체 - 레드
};

// 기간 프리셋 정의
const DATE_PRESETS = [
  { label: '최근 7일', value: '7d' },
  { label: '최근 30일', value: '30d' },
  { label: '이번 달', value: 'this_month' },
  { label: '지난 달', value: 'last_month' },
  { label: '최근 3개월', value: '3m' },
  { label: '최근 1년', value: '1y' }
];

function TeamketoDashboard() {
  const today = new Date();
  const [dateRange, setDateRange] = useState({
    sdate: format(startOfMonth(subMonths(today, 1)), 'yyyy-MM-dd'),
    edate: format(endOfMonth(subMonths(today, 1)), 'yyyy-MM-dd')
  });
  const [activePreset, setActivePreset] = useState('last_month');
  const [viewMode, setViewMode] = useState('daily');

  // 기간 프리셋 선택 핸들러
  const handlePresetSelect = (preset) => {
    const endDate = subDays(today, 2);
    let startDate;

    switch (preset) {
      case '7d':
        startDate = subDays(endDate, 6);
        break;
      case '30d':
        startDate = subDays(endDate, 29);
        break;
      case 'this_month':
        startDate = startOfMonth(today);
        break;
      case 'last_month':
        const lastMonth = subMonths(today, 1);
        startDate = startOfMonth(lastMonth);
        setDateRange({
          sdate: format(startDate, 'yyyy-MM-dd'),
          edate: format(endOfMonth(lastMonth), 'yyyy-MM-dd')
        });
        setActivePreset(preset);
        return;
      case '3m':
        startDate = subMonths(endDate, 3);
        break;
      case '1y':
        startDate = subYears(endDate, 1);
        break;
      default:
        startDate = subMonths(endDate, 3);
    }

    setDateRange({
      sdate: format(startDate, 'yyyy-MM-dd'),
      edate: format(endDate, 'yyyy-MM-dd')
    });
    setActivePreset(preset);
  };

  // 팀키토 요약 데이터
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['teamketoSummary', dateRange],
    queryFn: () => getTeamketoSummary({ sdate: dateRange.sdate, edate: dateRange.edate })
  });

  // 일별 추이
  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['teamketoDaily', dateRange],
    queryFn: () => getTeamketoDaily({ sdate: dateRange.sdate, edate: dateRange.edate }),
    enabled: viewMode === 'daily'
  });

  // 월별 추이
  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ['teamketoMonthly', dateRange],
    queryFn: () => getTeamketoMonthly({ sdate: dateRange.sdate, edate: dateRange.edate }),
    enabled: viewMode === 'monthly'
  });

  const formatCount = (value) => {
    if (value >= 10000) return `${(value / 10000).toFixed(1)}만`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}천`;
    return value.toLocaleString();
  };

  const formatCurrency = (value) => {
    if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
    if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
    return value.toLocaleString();
  };

  // 도시락 라인 데이터
  const lunchboxLines = summary?.lines ? [
    summary.lines.slowAging,
    summary.lines.signatureKeto,
    summary.lines.originalKeto,
    summary.lines.lowFodmap
  ] : [];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-lg shadow-lg p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              팀키토 출고량 대시보드
            </h2>
            <p className="text-emerald-200 mt-1">도시락 라인업별 출고량 현황</p>
          </div>
        </div>
        {/* 기간 프리셋 버튼 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePresetSelect(preset.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activePreset === preset.value
                    ? 'bg-white text-emerald-700'
                    : 'bg-emerald-500/50 text-white hover:bg-emerald-500'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center ml-auto">
            <input
              type="date"
              value={dateRange.sdate}
              onChange={(e) => {
                setDateRange(prev => ({ ...prev, sdate: e.target.value }));
                setActivePreset(null);
              }}
              className="px-3 py-1.5 rounded text-gray-800 text-sm"
            />
            <span className="text-emerald-200">~</span>
            <input
              type="date"
              value={dateRange.edate}
              onChange={(e) => {
                setDateRange(prev => ({ ...prev, edate: e.target.value }));
                setActivePreset(null);
              }}
              className="px-3 py-1.5 rounded text-gray-800 text-sm"
            />
          </div>
        </div>
      </div>

      {/* 요약 카드 - 6개 */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* 슬로우 에이징 */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4" style={{ borderColor: LINE_COLORS.SA }}>
            <div className="text-sm text-gray-500 mb-1">슬로우 에이징</div>
            <div className="text-2xl font-bold" style={{ color: LINE_COLORS.SA }}>
              {formatCount(summary?.lines?.slowAging?.total?.total_count || 0)}개
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {(summary?.lines?.slowAging?.total?.order_count || 0).toLocaleString()}건 주문
            </div>
          </div>

          {/* 시그니처 키토 */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4" style={{ borderColor: LINE_COLORS.SK }}>
            <div className="text-sm text-gray-500 mb-1">시그니처 키토</div>
            <div className="text-2xl font-bold" style={{ color: LINE_COLORS.SK }}>
              {formatCount(summary?.lines?.signatureKeto?.total?.total_count || 0)}개
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {(summary?.lines?.signatureKeto?.total?.order_count || 0).toLocaleString()}건 주문
            </div>
          </div>

          {/* 오리지널 키토 */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4" style={{ borderColor: LINE_COLORS.OK }}>
            <div className="text-sm text-gray-500 mb-1">오리지널 키토</div>
            <div className="text-2xl font-bold" style={{ color: LINE_COLORS.OK }}>
              {formatCount(summary?.lines?.originalKeto?.total?.total_count || 0)}개
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {(summary?.lines?.originalKeto?.total?.order_count || 0).toLocaleString()}건 주문
            </div>
          </div>

          {/* 저포드맵 */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4" style={{ borderColor: LINE_COLORS.LF }}>
            <div className="text-sm text-gray-500 mb-1">저포드맵</div>
            <div className="text-2xl font-bold" style={{ color: LINE_COLORS.LF }}>
              {formatCount(summary?.lines?.lowFodmap?.total?.total_count || 0)}개
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {(summary?.lines?.lowFodmap?.total?.order_count || 0).toLocaleString()}건 주문
            </div>
          </div>

          {/* 도시락 전체 */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4" style={{ borderColor: LINE_COLORS.LUNCHBOX }}>
            <div className="text-sm text-gray-500 mb-1">도시락 전체</div>
            <div className="text-2xl font-bold" style={{ color: LINE_COLORS.LUNCHBOX }}>
              {formatCount(summary?.lunchboxTotal?.total_count || 0)}개
            </div>
            <div className="text-xs text-gray-400 mt-1">
              매출 {formatCurrency(summary?.lunchboxTotal?.revenue || 0)}원
            </div>
          </div>

          {/* 팀키토 전체 */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4" style={{ borderColor: LINE_COLORS.TOTAL }}>
            <div className="text-sm text-gray-500 mb-1">팀키토 전체</div>
            <div className="text-2xl font-bold" style={{ color: LINE_COLORS.TOTAL }}>
              {formatCount(summary?.grandTotal?.total_count || 0)}개
            </div>
            <div className="text-xs text-gray-400 mt-1">
              매출 {formatCurrency(summary?.grandTotal?.revenue || 0)}원
            </div>
          </div>
        </div>
      )}

      {/* 추이 차트 */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <span className="text-xl">📈</span> 출고량 추이
          </h3>
          <div className="flex gap-2">
            <button
              className={`px-4 py-2 text-sm rounded-lg ${
                viewMode === 'daily' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              onClick={() => setViewMode('daily')}
            >
              일별
            </button>
            <button
              className={`px-4 py-2 text-sm rounded-lg ${
                viewMode === 'monthly' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              onClick={() => setViewMode('monthly')}
            >
              월별
            </button>
          </div>
        </div>

        {(viewMode === 'daily' && dailyLoading) || (viewMode === 'monthly' && monthlyLoading) ? (
          <div className="h-80 bg-gray-100 rounded animate-pulse" />
        ) : (
          <TrendChart
            data={viewMode === 'daily' ? dailyData?.daily : monthlyData?.monthly}
            viewMode={viewMode}
          />
        )}
      </div>

      {/* 라인별 상세 테이블 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {lunchboxLines.map((line) => (
          <div key={line?.code} className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: LINE_COLORS[line?.code] }}
              />
              {line?.name} 상세 현황
            </h3>
            <div className="overflow-auto max-h-64">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">상품명</th>
                    <th className="text-right p-2">출고량</th>
                    <th className="text-right p-2">주문수</th>
                    <th className="text-right p-2">매출</th>
                  </tr>
                </thead>
                <tbody>
                  {(line?.items || []).map((item) => (
                    <tr key={item.product_code} className="border-t hover:bg-gray-50">
                      <td className="p-2">
                        <div>
                          <div className="font-medium">{item.product_name}</div>
                          <div className="text-xs text-gray-400">{item.product_code}</div>
                        </div>
                      </td>
                      <td className="text-right p-2 font-bold" style={{ color: LINE_COLORS[line?.code] }}>
                        {item.total_count.toLocaleString()}개
                      </td>
                      <td className="text-right p-2 text-gray-600">
                        {item.order_count.toLocaleString()}건
                      </td>
                      <td className="text-right p-2 text-gray-600">
                        {formatCurrency(item.revenue)}원
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td className="p-2">합계</td>
                    <td className="text-right p-2" style={{ color: LINE_COLORS[line?.code] }}>
                      {(line?.total?.total_count || 0).toLocaleString()}개
                    </td>
                    <td className="text-right p-2">
                      {(line?.total?.order_count || 0).toLocaleString()}건
                    </td>
                    <td className="text-right p-2">
                      {formatCurrency(line?.total?.revenue || 0)}원
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* 무설탕 테이블 (있는 경우만) */}
      {summary?.lines?.noSugar?.items?.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: LINE_COLORS.NS }}
            />
            무설탕 (No Sugar) 현황
          </h3>
          <div className="overflow-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left p-2">상품명</th>
                  <th className="text-right p-2">출고량</th>
                  <th className="text-right p-2">주문수</th>
                  <th className="text-right p-2">매출</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.lines?.noSugar?.items || []).map((item) => (
                  <tr key={item.product_code} className="border-t hover:bg-gray-50">
                    <td className="p-2">
                      <div>
                        <div className="font-medium">{item.product_name}</div>
                        <div className="text-xs text-gray-400">{item.product_code}</div>
                      </div>
                    </td>
                    <td className="text-right p-2 font-bold" style={{ color: LINE_COLORS.NS }}>
                      {item.total_count.toLocaleString()}개
                    </td>
                    <td className="text-right p-2 text-gray-600">
                      {item.order_count.toLocaleString()}건
                    </td>
                    <td className="text-right p-2 text-gray-600">
                      {formatCurrency(item.revenue)}원
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td className="p-2">합계</td>
                  <td className="text-right p-2" style={{ color: LINE_COLORS.NS }}>
                    {(summary?.lines?.noSugar?.total?.total_count || 0).toLocaleString()}개
                  </td>
                  <td className="text-right p-2">
                    {(summary?.lines?.noSugar?.total?.order_count || 0).toLocaleString()}건
                  </td>
                  <td className="text-right p-2">
                    {formatCurrency(summary?.lines?.noSugar?.total?.revenue || 0)}원
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TrendChart({ data, viewMode }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-gray-400">
        데이터가 없습니다
      </div>
    );
  }

  // 날짜 오름차순 정렬
  const sortedData = [...data].sort((a, b) => {
    if (viewMode === 'daily') {
      return new Date(a.date) - new Date(b.date);
    } else {
      return a.month.localeCompare(b.month);
    }
  });

  const chartData = sortedData.map(item => {
    // 날짜 문자열에서 직접 추출 (시간대 변환 없이)
    let dateLabel = '';
    if (viewMode === 'daily' && item.date) {
      const dateParts = String(item.date).split('T')[0].split('-');
      dateLabel = `${dateParts[1]}-${dateParts[2]}`;
    } else {
      dateLabel = item.month;
    }
    return {
      date: dateLabel,
      '슬로우에이징': item.sa_count || 0,
      '시그니처키토': item.sk_count || 0,
      '오리지널키토': item.ok_count || 0,
      '저포드맵': item.lf_count || 0,
      '도시락전체': item.lunchbox_count || 0,
      '전체': item.total_count || 0
    };
  });

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 shadow-lg rounded border text-sm">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map((p, i) => (
            <p key={i} style={{ color: p.color }}>
              {p.name}: {p.value.toLocaleString()}개
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          interval={viewMode === 'daily' ? 'preserveStartEnd' : 0}
        />
        <YAxis />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Line type="monotone" dataKey="슬로우에이징" stroke={LINE_COLORS.SA} strokeWidth={2} dot={viewMode === 'monthly'} />
        <Line type="monotone" dataKey="시그니처키토" stroke={LINE_COLORS.SK} strokeWidth={2} dot={viewMode === 'monthly'} />
        <Line type="monotone" dataKey="오리지널키토" stroke={LINE_COLORS.OK} strokeWidth={2} dot={viewMode === 'monthly'} />
        <Line type="monotone" dataKey="저포드맵" stroke={LINE_COLORS.LF} strokeWidth={2} dot={viewMode === 'monthly'} />
        <Line type="monotone" dataKey="도시락전체" stroke={LINE_COLORS.LUNCHBOX} strokeWidth={3} dot={viewMode === 'monthly'} strokeDasharray="5 5" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default TeamketoDashboard;
