import { useState } from 'react';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { format, parseISO } from 'date-fns';

function TrendChart({ data }) {
  const [metric, setMetric] = useState('revenue'); // 'revenue' or 'orderCount'
  const [chartType, setChartType] = useState('area'); // 'area' or 'line'

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        데이터가 없습니다
      </div>
    );
  }

  const chartData = data.map(item => ({
    date: item.period,
    displayDate: formatDate(item.period),
    매출: item.revenue,
    주문수: item.orderCount,
    판매량: item.quantity,
    평균객단가: item.avgOrderValue
  }));

  function formatDate(dateStr) {
    try {
      if (dateStr.length === 7) { // YYYY-MM
        return dateStr;
      }
      return format(parseISO(dateStr), 'MM/dd');
    } catch {
      return dateStr;
    }
  }

  const formatCurrency = (value) => {
    if (value >= 100000000) {
      return `${(value / 100000000).toFixed(1)}억`;
    }
    if (value >= 10000000) {
      return `${(value / 10000000).toFixed(0)}천만`;
    }
    if (value >= 10000) {
      return `${(value / 10000).toFixed(0)}만`;
    }
    return value.toLocaleString();
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 shadow-lg rounded border text-sm">
          <p className="font-semibold text-gray-800 mb-1">{data.date}</p>
          <p className="text-blue-600">매출: ₩{data.매출?.toLocaleString()}</p>
          <p className="text-green-600">주문수: {data.주문수?.toLocaleString()}건</p>
          <p className="text-purple-600">판매량: {data.판매량?.toLocaleString()}개</p>
          <p className="text-orange-600">평균객단가: ₩{data.평균객단가?.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  const ChartComponent = chartType === 'area' ? AreaChart : LineChart;
  const DataComponent = chartType === 'area' ? Area : Line;

  const metricConfig = {
    revenue: { key: '매출', color: '#3B82F6', name: '매출' },
    orderCount: { key: '주문수', color: '#10B981', name: '주문수' }
  };

  const currentMetric = metricConfig[metric];

  return (
    <div>
      {/* 컨트롤 */}
      <div className="flex gap-4 mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setMetric('revenue')}
            className={`px-3 py-1 text-sm rounded ${
              metric === 'revenue' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            매출
          </button>
          <button
            onClick={() => setMetric('orderCount')}
            className={`px-3 py-1 text-sm rounded ${
              metric === 'orderCount' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            주문수
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setChartType('area')}
            className={`px-3 py-1 text-sm rounded ${
              chartType === 'area' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            영역
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`px-3 py-1 text-sm rounded ${
              chartType === 'line' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            선
          </button>
        </div>
      </div>

      {/* 차트 */}
      <ResponsiveContainer width="100%" height={300}>
        <ChartComponent data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={metric === 'revenue' ? formatCurrency : (v) => v.toLocaleString()}
            tick={{ fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} />
          {chartType === 'area' ? (
            <Area
              type="monotone"
              dataKey={currentMetric.key}
              stroke={currentMetric.color}
              fill={currentMetric.color}
              fillOpacity={0.3}
              strokeWidth={2}
            />
          ) : (
            <Line
              type="monotone"
              dataKey={currentMetric.key}
              stroke={currentMetric.color}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          )}
        </ChartComponent>
      </ResponsiveContainer>

      {/* 요약 통계 */}
      <div className="mt-4 grid grid-cols-4 gap-4 text-center">
        <div className="p-2 bg-gray-50 rounded">
          <div className="text-xs text-gray-500">기간 총 매출</div>
          <div className="font-semibold text-gray-800">
            ₩{chartData.reduce((sum, d) => sum + (d.매출 || 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="p-2 bg-gray-50 rounded">
          <div className="text-xs text-gray-500">기간 총 주문</div>
          <div className="font-semibold text-gray-800">
            {chartData.reduce((sum, d) => sum + (d.주문수 || 0), 0).toLocaleString()}건
          </div>
        </div>
        <div className="p-2 bg-gray-50 rounded">
          <div className="text-xs text-gray-500">일평균 매출</div>
          <div className="font-semibold text-gray-800">
            ₩{Math.round(chartData.reduce((sum, d) => sum + (d.매출 || 0), 0) / (chartData.length || 1)).toLocaleString()}
          </div>
        </div>
        <div className="p-2 bg-gray-50 rounded">
          <div className="text-xs text-gray-500">일평균 주문</div>
          <div className="font-semibold text-gray-800">
            {Math.round(chartData.reduce((sum, d) => sum + (d.주문수 || 0), 0) / (chartData.length || 1)).toLocaleString()}건
          </div>
        </div>
      </div>
    </div>
  );
}

export default TrendChart;
