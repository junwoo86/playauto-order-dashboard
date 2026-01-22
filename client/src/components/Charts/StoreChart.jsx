import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { useState } from 'react';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

function StoreChart({ data }) {
  const [viewType, setViewType] = useState('bar'); // 'bar' or 'pie'

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        데이터가 없습니다
      </div>
    );
  }

  // 차트용 데이터 가공
  const chartData = data.map(store => ({
    name: store.seller_nick || store.shop_name,
    매출: store.totalRevenue,
    주문수: store.orderCount,
    percentage: store.revenuePercentage
  }));

  const formatCurrency = (value) => {
    if (value >= 100000000) {
      return `${(value / 100000000).toFixed(1)}억`;
    }
    if (value >= 10000) {
      return `${(value / 10000).toFixed(0)}만`;
    }
    return value.toLocaleString();
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 shadow-lg rounded border text-sm">
          <p className="font-semibold text-gray-800">{data.name}</p>
          <p className="text-blue-600">매출: ₩{data.매출?.toLocaleString()}</p>
          <p className="text-green-600">주문수: {data.주문수?.toLocaleString()}건</p>
          <p className="text-gray-500">비중: {data.percentage?.toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      {/* 뷰 타입 토글 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setViewType('bar')}
          className={`px-3 py-1 text-sm rounded ${
            viewType === 'bar' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          막대
        </button>
        <button
          onClick={() => setViewType('pie')}
          className={`px-3 py-1 text-sm rounded ${
            viewType === 'pie' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          파이
        </button>
      </div>

      {viewType === 'bar' ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={formatCurrency} />
            <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} interval={0} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="매출" fill="#3B82F6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="매출"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={({ name, percentage }) => `${name} (${percentage?.toFixed(1)}%)`}
              labelLine={{ strokeWidth: 1 }}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      )}

      {/* 테이블 */}
      <div className="mt-4 max-h-48 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="text-left p-2">스토어</th>
              <th className="text-right p-2">매출</th>
              <th className="text-right p-2">주문수</th>
              <th className="text-right p-2">비중</th>
            </tr>
          </thead>
          <tbody>
            {data.map((store, index) => (
              <tr key={store.shop_cd} className="border-t hover:bg-gray-50">
                <td className="p-2 flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  {store.seller_nick || store.shop_name}
                </td>
                <td className="text-right p-2 number-format">
                  ₩{store.totalRevenue?.toLocaleString()}
                </td>
                <td className="text-right p-2 number-format">
                  {store.orderCount?.toLocaleString()}
                </td>
                <td className="text-right p-2">
                  {store.revenuePercentage?.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default StoreChart;
