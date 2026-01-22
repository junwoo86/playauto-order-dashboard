import { useQuery } from '@tanstack/react-query';
import { getSkuSales } from '../../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const ANALYSIS_COLORS = ['#6366F1', '#818CF8', '#A5B4FC', '#C7D2FE', '#E0E7FF', '#4F46E5', '#4338CA'];
const SUPPLEMENT_COLORS = ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5', '#059669', '#047857'];

function SkuSalesCards({ dateRange, excludeInternal }) {
  const { data, isLoading } = useQuery({
    queryKey: ['skuSales', dateRange, excludeInternal],
    queryFn: () => getSkuSales({
      sdate: dateRange.sdate,
      edate: dateRange.edate,
      ...(excludeInternal && { exclude_internal: true })
    }),
    enabled: !!dateRange?.sdate && !!dateRange?.edate
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonCard title="검사권 (BKG)" />
        <SkeletonCard title="건기식 (BHN)" />
      </div>
    );
  }

  // 판매량 순으로 정렬
  const sortedAnalysis = [...(data?.analysis || [])].sort((a, b) => b.quantity - a.quantity);
  const sortedSupplements = [...(data?.supplements || [])].sort((a, b) => b.quantity - a.quantity);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 검사권 (BKG) */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span>🔬</span> 검사권 (BKG)
        </h3>
        <SkuChart
          data={sortedAnalysis}
          colors={ANALYSIS_COLORS}
          total={data?.analysisTotal?.quantity || 0}
          category="analysis"
        />
      </div>

      {/* 건기식 (BHN) */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span>💊</span> 건기식 (BHN)
        </h3>
        <SkuChart
          data={sortedSupplements}
          colors={SUPPLEMENT_COLORS}
          total={data?.supplementsTotal?.quantity || 0}
          category="supplement"
        />
      </div>
    </div>
  );
}

function SkuChart({ data, colors, total, category }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        데이터가 없습니다
      </div>
    );
  }

  // 차트용 데이터 가공
  const chartData = data.map(item => ({
    name: item.product_name,
    code: item.product_code,
    판매량: item.quantity,
    주문수: item.order_count,
    percentage: total > 0 ? (item.quantity / total * 100) : 0
  }));

  const formatQuantity = (value) => {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}만`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}천`;
    }
    return value.toLocaleString();
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white p-3 shadow-lg rounded border text-sm">
          <p className="font-semibold text-gray-800">{d.name}</p>
          <p className="text-xs text-gray-500 mb-1">{d.code}</p>
          <p className={category === 'analysis' ? 'text-indigo-600' : 'text-emerald-600'}>
            판매량: {d.판매량?.toLocaleString()}개
          </p>
          <p className="text-gray-600">주문수: {d.주문수?.toLocaleString()}건</p>
          <p className="text-gray-500">비중: {d.percentage?.toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  const barColor = category === 'analysis' ? '#6366F1' : '#10B981';

  return (
    <div>
      {/* 막대 그래프 */}
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" tickFormatter={formatQuantity} />
          <YAxis
            type="category"
            dataKey="name"
            width={160}
            tick={{ fontSize: 11 }}
            interval={0}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="판매량" fill={barColor} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* 테이블 */}
      <div className="mt-4 max-h-64 overflow-auto">
        <table className="w-full text-sm">
          <thead className={`sticky top-0 ${category === 'analysis' ? 'bg-indigo-50' : 'bg-emerald-50'}`}>
            <tr>
              <th className="text-left p-2">상품명</th>
              <th className="text-right p-2">판매량</th>
              <th className="text-right p-2">주문수</th>
              <th className="text-right p-2">비중</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => {
              const percentage = total > 0 ? (item.quantity / total * 100) : 0;
              return (
                <tr key={item.product_code} className="border-t hover:bg-gray-50">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: colors[index % colors.length] }}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.product_name}</div>
                        <div className="text-xs text-gray-400">{item.product_code}</div>
                      </div>
                    </div>
                  </td>
                  <td className={`text-right p-2 font-bold ${category === 'analysis' ? 'text-indigo-600' : 'text-emerald-600'}`}>
                    {item.quantity.toLocaleString()}개
                  </td>
                  <td className="text-right p-2 text-gray-600">
                    {item.order_count.toLocaleString()}건
                  </td>
                  <td className="text-right p-2 text-gray-500">
                    {percentage.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className={`${category === 'analysis' ? 'bg-indigo-100' : 'bg-emerald-100'} font-semibold`}>
            <tr>
              <td className="p-2">합계</td>
              <td className={`text-right p-2 ${category === 'analysis' ? 'text-indigo-700' : 'text-emerald-700'}`}>
                {total.toLocaleString()}개
              </td>
              <td className="text-right p-2 text-gray-700">
                {data.reduce((sum, item) => sum + item.order_count, 0).toLocaleString()}건
              </td>
              <td className="text-right p-2">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function SkeletonCard({ title }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <span>{title.includes('검사') ? '🔬' : '💊'}</span> {title}
      </h3>
      <div className="h-48 bg-gray-100 rounded animate-pulse mb-4" />
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default SkuSalesCards;
