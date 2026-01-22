import { useQuery } from '@tanstack/react-query';
import { getSummary, getStoreStats, getProductStats, getTrend, getForecast } from '../../services/api';

import SummaryCards from './SummaryCards';
import SkuSalesCards from './SkuSalesCards';
import SkuTrendChart from './SkuTrendChart';
import StoreChart from '../Charts/StoreChart';
import ProductChart from '../Charts/ProductChart';
import TrendChart from '../Charts/TrendChart';
import ForecastChart from '../Charts/ForecastChart';

function Dashboard({ dateRange, selectedShop, excludeInternal }) {
  const queryParams = {
    sdate: dateRange.sdate,
    edate: dateRange.edate,
    ...(selectedShop && { shop_cd: selectedShop }),
    ...(excludeInternal && { exclude_internal: true })
  };

  // 요약 통계
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['summary', queryParams],
    queryFn: () => getSummary(queryParams)
  });

  // 스토어별 통계
  const { data: storeData, isLoading: storeLoading } = useQuery({
    queryKey: ['storeStats', queryParams],
    queryFn: () => getStoreStats(queryParams)
  });

  // 상품별 통계
  const { data: productData, isLoading: productLoading } = useQuery({
    queryKey: ['productStats', queryParams],
    queryFn: () => getProductStats({ ...queryParams, limit: 20 })
  });

  // 추이 데이터
  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ['trend', queryParams],
    queryFn: () => getTrend({ ...queryParams, groupBy: 'day' })
  });

  // 예측 데이터 (공구 일정 반영)
  const { data: forecastData, isLoading: forecastLoading } = useQuery({
    queryKey: ['forecast'],
    queryFn: () => getForecast({ days: 60, forecastDays: 30, useCampaignData: 'true' })
  });

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <SummaryCards data={summaryData} isLoading={summaryLoading} dateRange={dateRange} />

      {/* SKU별 판매량 */}
      <SkuSalesCards dateRange={dateRange} excludeInternal={excludeInternal} />

      {/* SKU별 판매 추이 */}
      <SkuTrendChart dateRange={dateRange} excludeInternal={excludeInternal} />

      {/* 차트 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 스토어별 매출 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span>🏪</span> 스토어별 매출
          </h3>
          {storeLoading ? (
            <LoadingSkeleton height={300} />
          ) : (
            <StoreChart data={storeData?.stores || []} />
          )}
        </div>

        {/* 상품별 판매 순위 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span>📦</span> 상품별 판매 TOP 20
          </h3>
          {productLoading ? (
            <LoadingSkeleton height={300} />
          ) : (
            <ProductChart data={productData?.products || []} />
          )}
        </div>
      </div>

      {/* 추이 차트 */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span>📈</span> 매출 추이
        </h3>
        {trendLoading ? (
          <LoadingSkeleton height={300} />
        ) : (
          <TrendChart data={trendData?.trend || []} />
        )}
      </div>

      {/* 예측 차트 */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <span>🔮</span> 판매 예측
        </h3>
        {forecastLoading ? (
          <LoadingSkeleton height={300} />
        ) : forecastData?.forecast?.length > 0 ? (
          <ForecastChart
            historical={forecastData?.historical || []}
            forecast={forecastData?.forecast || []}
            summary={forecastData?.summary}
            campaigns={forecastData?.campaigns}
          />
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400">
            예측을 위한 데이터가 충분하지 않습니다. (최소 7일 이상의 데이터 필요)
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton({ height }) {
  return (
    <div
      className="animate-pulse bg-gray-100 rounded"
      style={{ height: `${height}px` }}
    />
  );
}

export default Dashboard;
