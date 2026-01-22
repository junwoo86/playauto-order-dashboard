import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSkuSales, getSkuDailyTrend } from '../../services/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { format } from 'date-fns';

function SkuTrendChart({ dateRange, excludeInternal }) {
  const [selectedProduct, setSelectedProduct] = useState(null);

  // SKU 목록 조회
  const { data: skuData } = useQuery({
    queryKey: ['skuSales', dateRange, excludeInternal],
    queryFn: () => getSkuSales({
      sdate: dateRange.sdate,
      edate: dateRange.edate,
      ...(excludeInternal && { exclude_internal: true })
    }),
    enabled: !!dateRange?.sdate && !!dateRange?.edate
  });

  // 선택된 SKU의 일별 데이터 조회
  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ['skuTrend', dateRange, selectedProduct, excludeInternal],
    queryFn: () => getSkuDailyTrend({
      sdate: dateRange.sdate,
      edate: dateRange.edate,
      product_code: selectedProduct,
      ...(excludeInternal && { exclude_internal: true })
    }),
    enabled: !!dateRange?.sdate && !!dateRange?.edate && !!selectedProduct
  });

  // 모든 상품 목록 (검사권 + 건기식)
  const allProducts = useMemo(() => {
    const analysis = (skuData?.analysis || []).map(p => ({
      ...p,
      category: 'analysis',
      categoryLabel: '검사권'
    }));
    const supplements = (skuData?.supplements || []).map(p => ({
      ...p,
      category: 'supplement',
      categoryLabel: '건기식'
    }));
    return [...analysis, ...supplements];
  }, [skuData]);

  // 차트 데이터 가공
  const chartData = useMemo(() => {
    if (!trendData?.data) return [];
    return trendData.data.map(item => ({
      date: item.order_date,
      dateLabel: item.order_date ? `${item.order_date.split('-')[1]}/${item.order_date.split('-')[2]}` : '',
      판매량: parseInt(item.total_quantity) || 0,
      주문수: parseInt(item.order_count) || 0
    }));
  }, [trendData]);

  // 요약 통계
  const summary = useMemo(() => {
    if (!chartData.length) return null;
    const totalQuantity = chartData.reduce((sum, d) => sum + d.판매량, 0);
    const totalOrders = chartData.reduce((sum, d) => sum + d.주문수, 0);
    const avgQuantity = Math.round(totalQuantity / chartData.length);
    return { totalQuantity, totalOrders, avgQuantity, days: chartData.length };
  }, [chartData]);

  const selectedProductInfo = allProducts.find(p => p.product_code === selectedProduct);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 shadow-lg rounded border text-sm">
          <p className="font-semibold text-gray-800">{label}</p>
          <p className="text-purple-600">판매량: {payload[0]?.value?.toLocaleString()}개</p>
          <p className="text-gray-600">주문수: {payload[1]?.value?.toLocaleString()}건</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <span>📊</span> SKU별 판매 추이
        </h3>

        {/* 상품 선택 드롭다운 */}
        <select
          value={selectedProduct || ''}
          onChange={(e) => setSelectedProduct(e.target.value || null)}
          className="flex-1 max-w-md px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        >
          <option value="">-- 상품을 선택하세요 --</option>
          <optgroup label="🔬 검사권 (BKG)">
            {(skuData?.analysis || []).map(p => (
              <option key={p.product_code} value={p.product_code}>
                {p.product_name} ({p.quantity.toLocaleString()}개)
              </option>
            ))}
          </optgroup>
          <optgroup label="💊 건기식 (BHN)">
            {(skuData?.supplements || []).map(p => (
              <option key={p.product_code} value={p.product_code}>
                {p.product_name} ({p.quantity.toLocaleString()}개)
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {!selectedProduct ? (
        <div className="h-64 flex items-center justify-center text-gray-400 border-2 border-dashed rounded-lg">
          <div className="text-center">
            <div className="text-4xl mb-2">📈</div>
            <p>상품을 선택하면 판매 추이가 표시됩니다</p>
          </div>
        </div>
      ) : trendLoading ? (
        <div className="h-64 bg-gray-100 rounded animate-pulse" />
      ) : chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-400">
          해당 기간에 판매 데이터가 없습니다
        </div>
      ) : (
        <>
          {/* 선택된 상품 정보 */}
          <div className="mb-4 p-3 bg-purple-50 rounded-lg flex flex-wrap items-center gap-4">
            <div>
              <span className={`text-xs px-2 py-0.5 rounded ${
                selectedProductInfo?.category === 'analysis' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {selectedProductInfo?.categoryLabel}
              </span>
              <span className="ml-2 font-medium text-gray-800">{selectedProductInfo?.product_name}</span>
              <span className="ml-2 text-xs text-gray-500">{selectedProduct}</span>
            </div>
            {summary && (
              <div className="flex gap-4 ml-auto text-sm">
                <div>
                  <span className="text-gray-500">총 판매량:</span>
                  <span className="ml-1 font-bold text-purple-600">{summary.totalQuantity.toLocaleString()}개</span>
                </div>
                <div>
                  <span className="text-gray-500">일평균:</span>
                  <span className="ml-1 font-bold text-gray-700">{summary.avgQuantity.toLocaleString()}개</span>
                </div>
                <div>
                  <span className="text-gray-500">총 주문:</span>
                  <span className="ml-1 font-bold text-gray-700">{summary.totalOrders.toLocaleString()}건</span>
                </div>
              </div>
            )}
          </div>

          {/* 차트 */}
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorQuantity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(0)}천` : value}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="판매량"
                stroke="#8B5CF6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorQuantity)"
              />
              <Area
                type="monotone"
                dataKey="주문수"
                stroke="#6B7280"
                strokeWidth={1}
                strokeDasharray="3 3"
                fillOpacity={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

export default SkuTrendChart;
