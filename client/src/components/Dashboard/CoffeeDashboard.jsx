import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subMonths, subDays, subYears, startOfMonth, endOfMonth } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';
import { getCoffeeSummary, getCoffeeDaily, getCoffeeMonthly } from '../../services/api';

const BEAN_COLORS = ['#8B4513', '#A0522D', '#CD853F', '#D2691E', '#DEB887'];
const DRIP_COLORS = ['#2E8B57', '#3CB371', '#66CDAA', '#98FB98', '#90EE90'];

// 기간 프리셋 정의
const DATE_PRESETS = [
  { label: '최근 7일', value: '7d' },
  { label: '최근 30일', value: '30d' },
  { label: '이번 달', value: 'this_month' },
  { label: '지난 달', value: 'last_month' },
  { label: '최근 3개월', value: '3m' },
  { label: '최근 1년', value: '1y' }
];

function CoffeeDashboard() {
  const today = new Date();
  const [dateRange, setDateRange] = useState({
    sdate: format(startOfMonth(subMonths(today, 1)), 'yyyy-MM-dd'),
    edate: format(endOfMonth(subMonths(today, 1)), 'yyyy-MM-dd')
  });
  const [activePreset, setActivePreset] = useState('last_month'); // 기본값: 지난 달
  const [viewMode, setViewMode] = useState('daily'); // daily, monthly

  // 기간 프리셋 선택 핸들러
  const handlePresetSelect = (preset) => {
    const endDate = subDays(today, 2); // 2일 전까지 (데이터 지연 고려)
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

  // 커피 요약 데이터
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['coffeeSummary', dateRange],
    queryFn: () => getCoffeeSummary({ sdate: dateRange.sdate, edate: dateRange.edate })
  });

  // 일별 추이
  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['coffeeDaily', dateRange],
    queryFn: () => getCoffeeDaily({ sdate: dateRange.sdate, edate: dateRange.edate }),
    enabled: viewMode === 'daily'
  });

  // 월별 추이
  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ['coffeeMonthly', dateRange],
    queryFn: () => getCoffeeMonthly({ sdate: dateRange.sdate, edate: dateRange.edate }),
    enabled: viewMode === 'monthly'
  });

  const formatKg = (value) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}t`;
    return `${value.toFixed(1)}kg`;
  };

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

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-amber-700 to-amber-900 rounded-lg shadow-lg p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              커피 출고량 대시보드
            </h2>
            <p className="text-amber-200 mt-1">원두 및 드립백 출고량 현황</p>
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
                    ? 'bg-white text-amber-800'
                    : 'bg-amber-600/50 text-white hover:bg-amber-600'
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
            <span className="text-amber-200">~</span>
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

      {/* 요약 카드 */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 원두 총 출고량 */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-amber-700">
            <div className="text-sm text-gray-500 mb-1">원두 총 출고량</div>
            <div className="text-2xl font-bold text-amber-700">
              {formatKg(parseFloat(summary?.beansTotal?.total_kg || 0))}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {(summary?.beansTotal?.order_count || 0).toLocaleString()}건 주문
            </div>
          </div>

          {/* 원두 매출 */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-amber-600">
            <div className="text-sm text-gray-500 mb-1">원두 매출</div>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(summary?.beansTotal?.revenue || 0)}원
            </div>
            <div className="text-xs text-gray-400 mt-1">
              평균 {summary?.beansTotal?.order_count > 0
                ? formatCurrency(Math.round((summary?.beansTotal?.revenue || 0) / summary?.beansTotal?.order_count))
                : 0}원/주문
            </div>
          </div>

          {/* 드립백 총 출고량 */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-600">
            <div className="text-sm text-gray-500 mb-1">드립백 총 출고량</div>
            <div className="text-2xl font-bold text-green-600">
              {formatCount(summary?.dripsTotal?.total_count || 0)}박스
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {(summary?.dripsTotal?.order_count || 0).toLocaleString()}건 주문
            </div>
          </div>

          {/* 드립백 매출 */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="text-sm text-gray-500 mb-1">드립백 매출</div>
            <div className="text-2xl font-bold text-green-500">
              {formatCurrency(summary?.dripsTotal?.revenue || 0)}원
            </div>
            <div className="text-xs text-gray-400 mt-1">
              평균 {summary?.dripsTotal?.order_count > 0
                ? formatCurrency(Math.round((summary?.dripsTotal?.revenue || 0) / summary?.dripsTotal?.order_count))
                : 0}원/주문
            </div>
          </div>
        </div>
      )}

      {/* 상품별 출고량 차트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 원두 종류별 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="text-xl">🫘</span> 원두 종류별 출고량 (kg)
          </h3>
          {summaryLoading ? (
            <div className="h-64 bg-gray-100 rounded animate-pulse" />
          ) : (
            <CoffeeChart
              data={summary?.beans || []}
              colors={BEAN_COLORS}
              unit="kg"
              valueKey="total_kg"
            />
          )}
        </div>

        {/* 드립백 종류별 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span className="text-xl">☕</span> 드립백 종류별 출고량 (박스)
          </h3>
          {summaryLoading ? (
            <div className="h-64 bg-gray-100 rounded animate-pulse" />
          ) : (
            <CoffeeChart
              data={summary?.drips || []}
              colors={DRIP_COLORS}
              unit="개"
              valueKey="total_count"
            />
          )}
        </div>
      </div>

      {/* 추이 차트 */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <span className="text-xl">📈</span> 출고량 추이
          </h3>
          <div className="flex gap-2">
            <button
              className={`px-4 py-2 text-sm rounded-lg ${
                viewMode === 'daily' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              onClick={() => setViewMode('daily')}
            >
              일별
            </button>
            <button
              className={`px-4 py-2 text-sm rounded-lg ${
                viewMode === 'monthly' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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

      {/* 상세 테이블 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 원두 상세 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-800 mb-4">원두 상세 현황</h3>
          <div className="overflow-auto max-h-80">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 sticky top-0">
                <tr>
                  <th className="text-left p-2">상품명</th>
                  <th className="text-right p-2">출고량</th>
                  <th className="text-right p-2">주문수</th>
                  <th className="text-right p-2">매출</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.beans || []).map((item, idx) => (
                  <tr key={item.product_code} className="border-t hover:bg-amber-50/50">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: BEAN_COLORS[idx % BEAN_COLORS.length] }}
                        />
                        <div>
                          <div className="font-medium">{item.product_name}</div>
                          <div className="text-xs text-gray-400">{item.product_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right p-2 font-bold text-amber-700">
                      {parseFloat(item.total_kg).toFixed(1)}kg
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
              <tfoot className="bg-amber-100 font-semibold">
                <tr>
                  <td className="p-2">합계</td>
                  <td className="text-right p-2 text-amber-700">
                    {parseFloat(summary?.beansTotal?.total_kg || 0).toFixed(1)}kg
                  </td>
                  <td className="text-right p-2">
                    {(summary?.beansTotal?.order_count || 0).toLocaleString()}건
                  </td>
                  <td className="text-right p-2">
                    {formatCurrency(summary?.beansTotal?.revenue || 0)}원
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* 드립백 상세 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-800 mb-4">드립백 상세 현황</h3>
          <div className="overflow-auto max-h-80">
            <table className="w-full text-sm">
              <thead className="bg-green-50 sticky top-0">
                <tr>
                  <th className="text-left p-2">상품명</th>
                  <th className="text-right p-2">출고량</th>
                  <th className="text-right p-2">주문수</th>
                  <th className="text-right p-2">매출</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.drips || []).map((item, idx) => (
                  <tr key={item.product_code} className="border-t hover:bg-green-50/50">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: DRIP_COLORS[idx % DRIP_COLORS.length] }}
                        />
                        <div>
                          <div className="font-medium">{item.product_name}</div>
                          <div className="text-xs text-gray-400">{item.product_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right p-2 font-bold text-green-600">
                      {item.total_count.toLocaleString()}박스
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
              <tfoot className="bg-green-100 font-semibold">
                <tr>
                  <td className="p-2">합계</td>
                  <td className="text-right p-2 text-green-600">
                    {(summary?.dripsTotal?.total_count || 0).toLocaleString()}박스
                  </td>
                  <td className="text-right p-2">
                    {(summary?.dripsTotal?.order_count || 0).toLocaleString()}건
                  </td>
                  <td className="text-right p-2">
                    {formatCurrency(summary?.dripsTotal?.revenue || 0)}원
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoffeeChart({ data, colors, unit, valueKey }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        데이터가 없습니다
      </div>
    );
  }

  const chartData = data.map(item => ({
    name: item.product_name,
    value: parseFloat(item[valueKey]) || 0,
    order_count: item.order_count
  }));

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white p-3 shadow-lg rounded border text-sm">
          <p className="font-semibold">{d.name}</p>
          <p className="text-amber-700">
            출고량: {unit === 'kg' ? `${d.value.toFixed(1)}kg` : `${d.value.toLocaleString()}박스`}
          </p>
          <p className="text-gray-600">주문수: {d.order_count?.toLocaleString()}건</p>
          <p className="text-gray-500">비중: {((d.value / total) * 100).toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  // 상품명 줄바꿈 처리 (긴 이름은 두 줄로)
  const CustomYAxisTick = ({ x, y, payload }) => {
    const name = payload.value;
    const maxLen = 12;

    if (name.length <= maxLen) {
      return (
        <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill="#374151">
          {name}
        </text>
      );
    }

    // 긴 이름은 두 줄로 분리
    const line1 = name.substring(0, maxLen);
    const line2 = name.substring(maxLen);

    return (
      <text x={x} y={y} textAnchor="end" fontSize={11} fill="#374151">
        <tspan x={x} dy={-4}>{line1}</tspan>
        <tspan x={x} dy={14}>{line2}</tspan>
      </text>
    );
  };

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 50)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30, top: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tick={<CustomYAxisTick />}
            interval={0}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="value" fill={colors[0]} radius={[0, 4, 4, 0]}>
            {chartData.map((_, index) => (
              <Cell key={index} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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

  // 날짜 오름차순 정렬 (과거 → 최신)
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
      원두: parseFloat(item.bean_kg) || 0,
      드립백: item.drip_count || 0,
      주문수: item.order_count || 0,
      매출: item.revenue || 0
    };
  });

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 shadow-lg rounded border text-sm">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map((p, i) => (
            <p key={i} style={{ color: p.color }}>
              {p.name}: {p.name === '원두' ? `${p.value.toFixed(1)}kg` :
                        p.name === '드립백' ? `${p.value.toLocaleString()}박스` :
                        p.value.toLocaleString()}
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
        <YAxis yAxisId="left" orientation="left" stroke="#8B4513" />
        <YAxis yAxisId="right" orientation="right" stroke="#2E8B57" />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="원두"
          stroke="#8B4513"
          strokeWidth={2}
          dot={viewMode === 'monthly'}
          name="원두 (kg)"
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="드립백"
          stroke="#2E8B57"
          strokeWidth={2}
          dot={viewMode === 'monthly'}
          name="드립백 (박스)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default CoffeeDashboard;
