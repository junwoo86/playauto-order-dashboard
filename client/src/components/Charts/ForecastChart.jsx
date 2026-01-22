import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import { format, parseISO } from 'date-fns';

function ForecastChart({ historical, forecast, summary, campaigns }) {
  if (!historical || historical.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        예측을 위한 데이터가 충분하지 않습니다
      </div>
    );
  }

  // 히스토리와 예측 데이터 결합
  const chartData = [
    ...historical.map(d => ({
      date: d.date,
      displayDate: formatDate(d.date),
      실제매출: d.revenue,
      공구매출: d.isCampaignDay ? d.revenue : null,
      이동평균7일: d.ma7,
      이동평균30일: d.ma30,
      예측매출: null,
      기본예측: null,
      공구예측: null,
      isCampaignDay: d.isCampaignDay,
      type: 'historical'
    })),
    ...forecast.map(d => ({
      date: d.date,
      displayDate: formatDate(d.date),
      실제매출: null,
      공구매출: null,
      이동평균7일: null,
      이동평균30일: null,
      예측매출: d.predictedRevenue,
      기본예측: d.baselineRevenue,
      공구예측: d.hasCampaign ? d.campaignRevenue : null,
      신뢰도: d.confidence,
      hasCampaign: d.hasCampaign,
      campaigns: d.campaigns || [],
      type: 'forecast'
    }))
  ];

  function formatDate(dateStr) {
    try {
      return format(parseISO(dateStr), 'MM/dd');
    } catch {
      return dateStr;
    }
  }

  const formatCurrency = (value) => {
    if (!value) return '';
    if (value >= 10000000) {
      return `${(value / 10000000).toFixed(0)}천만`;
    }
    if (value >= 10000) {
      return `${(value / 10000).toFixed(0)}만`;
    }
    return value.toLocaleString();
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isForecast = data.type === 'forecast';

      return (
        <div className="bg-white p-3 shadow-lg rounded border text-sm max-w-xs">
          <p className="font-semibold text-gray-800 mb-1">
            {data.date}
            {data.isCampaignDay && (
              <span className="ml-2 text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">
                공구 기간
              </span>
            )}
            {data.hasCampaign && (
              <span className="ml-2 text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded">
                예정 공구
              </span>
            )}
          </p>
          {isForecast ? (
            <>
              <p className="text-orange-600">
                예측 매출: ₩{data.예측매출?.toLocaleString()}
              </p>
              {data.hasCampaign && (
                <>
                  <p className="text-gray-500 text-xs mt-1">
                    기본: ₩{data.기본예측?.toLocaleString()} + 공구: ₩{data.공구예측?.toLocaleString()}
                  </p>
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    {data.campaigns.map((c, i) => (
                      <p key={i} className="text-xs text-purple-600">
                        {c.name} ({c.influencer})
                      </p>
                    ))}
                  </div>
                </>
              )}
              <p className="text-gray-400 text-xs mt-1">신뢰도: {(data.신뢰도 * 100).toFixed(0)}%</p>
            </>
          ) : (
            <>
              <p className={data.isCampaignDay ? "text-purple-600" : "text-blue-600"}>
                실제 매출: ₩{data.실제매출?.toLocaleString()}
                {data.isCampaignDay && " (공구)"}
              </p>
              {data.이동평균7일 && (
                <p className="text-green-600">7일 이동평균: ₩{data.이동평균7일?.toLocaleString()}</p>
              )}
            </>
          )}
        </div>
      );
    }
    return null;
  };

  // 예측 시작 날짜 (히스토리와 예측의 경계)
  const forecastStartIndex = historical.length;

  return (
    <div>
      {/* 예측 요약 */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="text-xs text-blue-600">일평균 매출 (기본)</div>
            <div className="text-xl font-bold text-blue-800">
              ₩{summary.avgDailyRevenue?.toLocaleString()}
            </div>
            {summary.avgDailyRevenueBeforeExclusion && summary.avgDailyRevenueBeforeExclusion !== summary.avgDailyRevenue && (
              <div className="text-xs text-gray-400 mt-1">
                공구 포함: ₩{summary.avgDailyRevenueBeforeExclusion?.toLocaleString()}
              </div>
            )}
          </div>
          <div className="p-3 bg-orange-50 rounded-lg">
            <div className="text-xs text-orange-600">예상 월 매출 (기본)</div>
            <div className="text-xl font-bold text-orange-800">
              ₩{summary.predictedMonthlyRevenue?.toLocaleString()}
            </div>
          </div>
          {summary.predictedMonthlyWithCampaigns > summary.predictedMonthlyRevenue && (
            <div className="p-3 bg-purple-50 rounded-lg">
              <div className="text-xs text-purple-600">예상 월 매출 (공구 포함)</div>
              <div className="text-xl font-bold text-purple-800">
                ₩{summary.predictedMonthlyWithCampaigns?.toLocaleString()}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                +₩{(summary.predictedMonthlyWithCampaigns - summary.predictedMonthlyRevenue)?.toLocaleString()} (공구)
              </div>
            </div>
          )}
          <div className="p-3 bg-green-50 rounded-lg">
            <div className="text-xs text-green-600">추세</div>
            <div className={`text-xl font-bold ${
              summary.trendPercentage > 0 ? 'text-green-800' :
              summary.trendPercentage < 0 ? 'text-red-800' : 'text-gray-800'
            }`}>
              {summary.trendPercentage > 0 ? '↑' : summary.trendPercentage < 0 ? '↓' : '→'}
              {Math.abs(summary.trendPercentage)}%
              <span className="text-xs font-normal text-gray-500 ml-1">월간</span>
            </div>
          </div>
        </div>
      )}

      {/* 공구 정보 */}
      {campaigns && (
        <div className="mb-4 space-y-2">
          {/* 과거 공구 제외 정보 */}
          {campaigns.excludedDays > 0 && (
            <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-purple-600 font-medium">
                  과거 공구 기간 제외 ({campaigns.excludedDays}일)
                </span>
                <span className="text-gray-500">|</span>
                <span className="text-gray-600">
                  {campaigns.pastCampaigns?.map(c => c.name).join(', ')}
                </span>
              </div>
            </div>
          )}

          {/* 예정 공구 정보 */}
          {campaigns.upcomingCampaigns?.length > 0 && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-100">
              <div className="text-sm">
                <span className="text-green-600 font-medium">
                  예정된 공구 ({campaigns.upcomingCampaigns.length}건)
                </span>
                <span className="text-gray-500 mx-2">|</span>
                <span className="text-gray-600">
                  총 예상 매출: ₩{campaigns.totalUpcomingRevenue?.toLocaleString()}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {campaigns.upcomingCampaigns.map((c, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-1 bg-white rounded text-xs border border-green-200">
                    <span className="font-medium text-green-700">{c.name}</span>
                    <span className="mx-1 text-gray-400">|</span>
                    <span className="text-gray-500">
                      {c.startDate?.split('T')[0]} ~ {c.endDate?.split('T')[0]}
                    </span>
                    <span className="mx-1 text-gray-400">|</span>
                    <span className="text-purple-600">₩{(c.expectedRevenue/10000).toFixed(0)}만</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 차트 */}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 11 }}
            interval={Math.floor(chartData.length / 10)}
          />
          <YAxis
            tickFormatter={formatCurrency}
            tick={{ fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* 실제 매출 (막대 - 공구일은 보라색) */}
          <Bar dataKey="실제매출" barSize={8}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.isCampaignDay ? '#8B5CF6' : '#3B82F6'}
                fillOpacity={entry.isCampaignDay ? 0.8 : 0.6}
              />
            ))}
          </Bar>

          {/* 7일 이동평균 (라인) */}
          <Line
            type="monotone"
            dataKey="이동평균7일"
            stroke="#10B981"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 5"
          />

          {/* 예측 매출 (영역 차트) */}
          <Area
            type="monotone"
            dataKey="기본예측"
            stroke="#F59E0B"
            fill="#F59E0B"
            fillOpacity={0.15}
            strokeWidth={2}
            strokeDasharray="5 5"
          />

          {/* 공구 예상 매출 (스택) */}
          <Bar dataKey="공구예측" stackId="forecast" fill="#8B5CF6" fillOpacity={0.5} barSize={8} />

          {/* 예측 시작선 */}
          {forecastStartIndex > 0 && forecastStartIndex < chartData.length && (
            <ReferenceLine
              x={chartData[forecastStartIndex]?.displayDate}
              stroke="#EF4444"
              strokeDasharray="3 3"
              label={{ value: '예측', position: 'top', fontSize: 11, fill: '#EF4444' }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* 범례 */}
      <div className="flex justify-center gap-6 mt-4 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 bg-blue-500 opacity-60 rounded" />
          <span className="text-gray-600">실제 매출</span>
        </div>
        {campaigns?.excludedDays > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 bg-purple-500 opacity-80 rounded" />
            <span className="text-gray-600">공구 매출 (제외)</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-green-500 border-dashed border-t-2 border-green-500" />
          <span className="text-gray-600">7일 이동평균</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 bg-orange-500 opacity-30 rounded border border-dashed border-orange-500" />
          <span className="text-gray-600">기본 예측</span>
        </div>
        {campaigns?.upcomingCampaigns?.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 bg-purple-500 opacity-50 rounded" />
            <span className="text-gray-600">공구 예상</span>
          </div>
        )}
      </div>

      {/* 주의사항 */}
      <div className="mt-4 p-3 bg-yellow-50 rounded text-sm text-yellow-800">
        <p>
          <strong>예측 방식:</strong> 과거 공구 기간을 제외한 기본 매출 추세 + 예정 공구 예상 매출
        </p>
        <p className="mt-1 text-xs text-yellow-600">
          ※ 예측값은 참고용입니다. 실제 매출은 시장 상황에 따라 달라질 수 있습니다.
        </p>
      </div>
    </div>
  );
}

export default ForecastChart;
