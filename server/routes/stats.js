import { Router } from 'express';
import { query, SCHEMA } from '../services/database.js';

const router = Router();

// 매출에서 제외할 주문 상태값
// (실제 매출로 잡으면 안되는 상태들 - 반품/교환/취소/보류 관련)
const EXCLUDED_ORDER_STATUSES = [
  '반품요청',
  '교환요청',
  '교환회수완료',
  '취소완료',
  '반품완료',
  '주문보류',
  '주문재확인'
];

// 제외 상태 SQL 조건 (고정 리스트이므로 직접 생성)
const EXCLUDED_STATUS_SQL = `ord_status NOT IN ('${EXCLUDED_ORDER_STATUSES.join("', '")}')`;

// 모든 상태 포함 여부 (전체 주문 수 조회용)
const getStatusFilter = (includeAll = false) => includeAll ? '' : EXCLUDED_STATUS_SQL;

// 스마트스토어 shop_cd (pay_amt 기준 매출)
const SMARTSTORE_SHOP_CDS = ['A077', '1077'];

// 매출 계산 SQL 표현식
// 스마트스토어(A077, 1077)는 pay_amt, 나머지는 sales 사용
const REVENUE_SQL = `CASE WHEN shop_cd IN ('${SMARTSTORE_SHOP_CDS.join("', '")}') THEN pay_amt ELSE sales END`;

// 내부 확인용 제외 SQL 조건
const INTERNAL_EXCLUDE_SQL = `shop_sale_name NOT LIKE '%내부 확인용%'`;

// 기간 조건 생성 헬퍼
// PlayAuto API의 ord_time은 한국시간(KST) 기준으로 저장됨
function getDateCondition(sdate, edate, startParamIndex = 1, excludeInternal = false) {
  let conditions = [];
  let params = [];
  let paramIndex = startParamIndex;

  if (sdate) {
    conditions.push(`ord_time >= $${paramIndex}`);
    params.push(sdate);
    paramIndex++;
  }
  if (edate) {
    conditions.push(`ord_time <= $${paramIndex}`);
    params.push(edate + ' 23:59:59');
    paramIndex++;
  }

  // 내부 확인용 제외 필터
  if (excludeInternal) {
    conditions.push(INTERNAL_EXCLUDE_SQL);
  }

  return { conditions, params, nextParamIndex: paramIndex };
}

// 전체 요약 통계
router.get('/summary', async (req, res) => {
  try {
    const { sdate, edate, exclude_internal } = req.query;
    const excludeInternal = exclude_internal === 'true';
    const { conditions, params } = getDateCondition(sdate, edate, 1, excludeInternal);

    // 매출 제외 상태 필터 추가
    const revenueConditions = [...conditions, EXCLUDED_STATUS_SQL];
    const revenueWhereClause = 'WHERE ' + revenueConditions.join(' AND ');

    // 전체 주문 수는 모든 상태 포함 (참고용)
    const allOrdersWhereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 스마트스토어(A077, 1077)는 pay_amt, 나머지는 sales 기준 매출 계산
    // 매출에 반영되지 않아야 할 상태 제외
    const summaryResult = await query(`
      SELECT
        COUNT(*) as "totalOrders",
        COALESCE(SUM(${REVENUE_SQL}), 0) as "totalRevenue",
        COALESCE(SUM(pay_amt), 0) as "totalPayAmt",
        COALESCE(SUM(sale_cnt), 0) as "totalQuantity",
        COALESCE(AVG(${REVENUE_SQL}), 0) as "avgOrderValue",
        COUNT(DISTINCT shop_cd) as "totalStores",
        COUNT(DISTINCT shop_sale_name) as "totalProducts"
      FROM ${SCHEMA}.orders
      ${revenueWhereClause}
    `, params);

    const summary = summaryResult.rows[0];

    // 전체 주문 수 (제외 상태 포함)
    const allOrdersResult = await query(`
      SELECT COUNT(*) as "allOrders"
      FROM ${SCHEMA}.orders
      ${allOrdersWhereClause}
    `, params);

    // 주문 상태별 통계 (모든 상태 표시)
    const statusStatsResult = await query(`
      SELECT
        ord_status,
        COUNT(*) as count,
        COALESCE(SUM(${REVENUE_SQL}), 0) as revenue,
        CASE WHEN ord_status IN ('${EXCLUDED_ORDER_STATUSES.join("', '")}')
             THEN true ELSE false END as "excludedFromRevenue"
      FROM ${SCHEMA}.orders
      ${allOrdersWhereClause}
      GROUP BY ord_status
      ORDER BY count DESC
    `, params);

    res.json({
      summary: {
        totalOrders: parseInt(summary.totalOrders) || 0,  // 매출에 포함된 주문만
        allOrders: parseInt(allOrdersResult.rows[0].allOrders) || 0,  // 전체 주문 (참고용)
        totalRevenue: parseInt(summary.totalRevenue) || 0,
        totalQuantity: parseInt(summary.totalQuantity) || 0,
        avgOrderValue: Math.round(parseFloat(summary.avgOrderValue) || 0),
        totalStores: parseInt(summary.totalStores) || 0,
        totalProducts: parseInt(summary.totalProducts) || 0
      },
      statusStats: statusStatsResult.rows,
      excludedStatuses: EXCLUDED_ORDER_STATUSES  // 프론트에서 참고할 수 있도록
    });
  } catch (error) {
    console.error('Error getting summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// 스토어별 통계
router.get('/by-store', async (req, res) => {
  try {
    const { sdate, edate, exclude_internal } = req.query;
    const excludeInternal = exclude_internal === 'true';
    const { conditions, params } = getDateCondition(sdate, edate, 1, excludeInternal);

    // 매출 제외 상태 필터 추가
    const revenueConditions = [...conditions, EXCLUDED_STATUS_SQL];
    const whereClause = 'WHERE ' + revenueConditions.join(' AND ');

    // 스마트스토어(A077, 1077)는 pay_amt, 나머지는 sales 기준 매출 계산
    // 매출에서 제외해야 할 상태는 필터링
    const storesResult = await query(`
      SELECT
        shop_cd,
        shop_name,
        seller_nick,
        COUNT(*) as "orderCount",
        COALESCE(SUM(${REVENUE_SQL}), 0) as "totalRevenue",
        COALESCE(SUM(pay_amt), 0) as "totalPayAmt",
        COALESCE(SUM(sale_cnt), 0) as "totalQuantity",
        COALESCE(AVG(${REVENUE_SQL}), 0) as "avgOrderValue"
      FROM ${SCHEMA}.orders
      ${whereClause}
      GROUP BY shop_cd, shop_name, seller_nick
      ORDER BY SUM(${REVENUE_SQL}) DESC
    `, params);

    const stores = storesResult.rows;

    // 전체 합계 계산
    const total = stores.reduce((acc, store) => ({
      orderCount: acc.orderCount + parseInt(store.orderCount),
      totalRevenue: acc.totalRevenue + parseInt(store.totalRevenue),
      totalQuantity: acc.totalQuantity + parseInt(store.totalQuantity)
    }), { orderCount: 0, totalRevenue: 0, totalQuantity: 0 });

    // 비중 계산
    const storesWithPercentage = stores.map(store => ({
      ...store,
      orderCount: parseInt(store.orderCount),
      totalRevenue: parseInt(store.totalRevenue),
      totalPayAmt: parseInt(store.totalPayAmt),
      totalQuantity: parseInt(store.totalQuantity),
      avgOrderValue: Math.round(parseFloat(store.avgOrderValue) || 0),
      revenuePercentage: total.totalRevenue > 0
        ? Math.round((parseInt(store.totalRevenue) / total.totalRevenue) * 10000) / 100
        : 0
    }));

    res.json({
      stores: storesWithPercentage,
      total
    });
  } catch (error) {
    console.error('Error getting store stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// 상품별 통계
router.get('/by-product', async (req, res) => {
  try {
    const { sdate, edate, shop_cd, limit = 50, exclude_internal } = req.query;
    const excludeInternal = exclude_internal === 'true';
    const { conditions, params, nextParamIndex } = getDateCondition(sdate, edate, 1, excludeInternal);

    let paramIndex = nextParamIndex;

    if (shop_cd) {
      conditions.push(`shop_cd = $${paramIndex}`);
      params.push(shop_cd);
      paramIndex++;
    }

    // 매출 제외 상태 필터 추가
    const revenueConditions = [...conditions, EXCLUDED_STATUS_SQL];
    const whereClause = 'WHERE ' + revenueConditions.join(' AND ');

    // 스마트스토어(A077, 1077)는 pay_amt, 나머지는 sales 기준 매출 계산
    // 매출에서 제외해야 할 상태는 필터링
    const productsResult = await query(`
      SELECT
        shop_sale_name as "productName",
        shop_cd,
        shop_name,
        COUNT(*) as "orderCount",
        COALESCE(SUM(sale_cnt), 0) as "totalQuantity",
        COALESCE(SUM(${REVENUE_SQL}), 0) as "totalRevenue",
        COALESCE(SUM(pay_amt), 0) as "totalPayAmt",
        COALESCE(AVG(${REVENUE_SQL}), 0) as "avgPrice"
      FROM ${SCHEMA}.orders
      ${whereClause}
      GROUP BY shop_sale_name, shop_cd, shop_name
      ORDER BY SUM(${REVENUE_SQL}) DESC
      LIMIT $${paramIndex}
    `, [...params, parseInt(limit)]);

    const products = productsResult.rows;

    const productsWithRank = products.map((product, index) => ({
      ...product,
      rank: index + 1,
      orderCount: parseInt(product.orderCount),
      totalQuantity: parseInt(product.totalQuantity),
      totalRevenue: parseInt(product.totalRevenue),
      totalPayAmt: parseInt(product.totalPayAmt),
      avgPrice: Math.round(parseFloat(product.avgPrice) || 0)
    }));

    res.json({
      products: productsWithRank,
      total: products.length
    });
  } catch (error) {
    console.error('Error getting product stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// 추이 데이터 (일별/월별)
router.get('/trend', async (req, res) => {
  try {
    const { sdate, edate, groupBy = 'day', shop_cd, exclude_internal } = req.query;
    const excludeInternal = exclude_internal === 'true';
    const { conditions, params, nextParamIndex } = getDateCondition(sdate, edate, 1, excludeInternal);

    let paramIndex = nextParamIndex;

    if (shop_cd) {
      conditions.push(`shop_cd = $${paramIndex}`);
      params.push(shop_cd);
      paramIndex++;
    }

    // 매출 제외 상태 필터 추가
    const revenueConditions = [...conditions, EXCLUDED_STATUS_SQL];
    const whereClause = 'WHERE ' + revenueConditions.join(' AND ');

    let dateFormat;
    switch (groupBy) {
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      case 'week':
        dateFormat = 'IYYY-IW';
        break;
      case 'day':
      default:
        dateFormat = 'YYYY-MM-DD';
    }

    // 스마트스토어(A077, 1077)는 pay_amt, 나머지는 sales 기준 매출 계산
    // 매출에서 제외해야 할 상태는 필터링
    const trendResult = await query(`
      SELECT
        to_char(ord_time, '${dateFormat}') as period,
        COUNT(*) as "orderCount",
        COALESCE(SUM(${REVENUE_SQL}), 0) as revenue,
        COALESCE(SUM(sale_cnt), 0) as quantity,
        COALESCE(AVG(${REVENUE_SQL}), 0) as "avgOrderValue"
      FROM ${SCHEMA}.orders
      ${whereClause}
      GROUP BY to_char(ord_time, '${dateFormat}')
      ORDER BY period ASC
    `, params);

    const trendData = trendResult.rows.map(item => ({
      ...item,
      orderCount: parseInt(item.orderCount),
      revenue: parseInt(item.revenue),
      quantity: parseInt(item.quantity),
      avgOrderValue: Math.round(parseFloat(item.avgOrderValue) || 0)
    }));

    res.json({
      trend: trendData,
      groupBy
    });
  } catch (error) {
    console.error('Error getting trend:', error);
    res.status(500).json({ error: error.message });
  }
});

// 판매 예측 (이동평균 기반 + 공구 일정 반영)
// useCampaignData: true면 등록된 공구 데이터를 사용하여 예측
router.get('/forecast', async (req, res) => {
  try {
    const { days = 30, forecastDays = 30, useCampaignData = 'true', exclude_internal } = req.query;
    const useCampaigns = useCampaignData === 'true';
    const excludeInternal = exclude_internal === 'true';

    // 내부 확인용 제외 조건
    const internalFilter = excludeInternal ? ` AND ${INTERNAL_EXCLUDE_SQL}` : '';

    // 최근 N일 일별 데이터 조회
    const recentDataResult = await query(`
      SELECT
        DATE(ord_time) as date,
        COUNT(*) as "orderCount",
        COALESCE(SUM(${REVENUE_SQL}), 0) as revenue,
        COALESCE(SUM(sale_cnt), 0) as quantity
      FROM ${SCHEMA}.orders
      WHERE ord_time >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
        AND ${EXCLUDED_STATUS_SQL}${internalFilter}
      GROUP BY DATE(ord_time)
      ORDER BY date ASC
    `);

    const recentData = recentDataResult.rows.map(row => ({
      date: row.date,
      orderCount: parseInt(row.orderCount),
      revenue: parseInt(row.revenue),
      quantity: parseInt(row.quantity)
    }));

    if (recentData.length < 7) {
      return res.json({
        message: '예측을 위한 데이터가 충분하지 않습니다.',
        historical: recentData,
        forecast: [],
        campaigns: { past: [], upcoming: [] }
      });
    }

    // 공구 데이터 조회 (과거 공구는 비율 기반 제외, 미래 공구는 추가 매출)
    let campaignRatioByDate = new Map(); // 날짜별 공구 제외 비율
    let upcomingCampaigns = [];
    let pastCampaigns = [];

    if (useCampaigns) {
      // 과거 공구 (완료된 것만, 취소 제외) - manual_actual_revenue 포함
      const pastResult = await query(`
        SELECT id, name, influencer_name, start_date, end_date, expected_revenue, actual_revenue, manual_actual_revenue
        FROM ${SCHEMA}.influencer_campaigns
        WHERE end_date < CURRENT_DATE AND status != 'cancelled'
      `);
      pastCampaigns = pastResult.rows;

      // 과거 공구 날짜들 수집 및 비율 계산
      // manual_actual_revenue가 있으면 비율 기반 제외, 없으면 날짜 전체 제외(비율=1)
      for (const campaign of pastCampaigns) {
        const start = new Date(campaign.start_date);
        const end = new Date(campaign.end_date);
        const actualRevenue = parseInt(campaign.actual_revenue) || 0;
        const manualActualRevenue = campaign.manual_actual_revenue !== null
          ? parseInt(campaign.manual_actual_revenue)
          : null;

        // 비율 계산:
        // - manual_actual_revenue가 있으면: 공구 비율 = manual / actual (최대 1)
        // - manual_actual_revenue가 없으면: 비율 = 1 (전체 제외)
        const ratio = (manualActualRevenue !== null && actualRevenue > 0)
          ? Math.min(1, manualActualRevenue / actualRevenue)
          : 1; // 수기 입력 없으면 기존처럼 전체 제외

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          // 같은 날짜에 여러 공구가 있을 수 있으므로 비율을 합산 (최대 1)
          const existingRatio = campaignRatioByDate.get(dateStr) || 0;
          campaignRatioByDate.set(dateStr, Math.min(1, existingRatio + ratio));
        }
      }

      // 예정/진행중 공구
      const upcomingResult = await query(`
        SELECT id, name, influencer_name, start_date, end_date, expected_revenue, status
        FROM ${SCHEMA}.influencer_campaigns
        WHERE end_date >= CURRENT_DATE AND status IN ('planned', 'active')
        ORDER BY start_date ASC
      `);
      upcomingCampaigns = upcomingResult.rows;
    }

    // 비율 기반으로 조정된 기본 추세 데이터 계산
    // 공구 비율만큼 매출을 제외한 값으로 기본 추세 계산
    const baselineData = recentData.map(d => {
      const dateStr = d.date.toISOString ? d.date.toISOString().split('T')[0] : d.date;
      const ratio = campaignRatioByDate.get(dateStr) || 0;
      return {
        ...d,
        adjustedRevenue: Math.round(d.revenue * (1 - ratio)), // 공구 비율 제외
        campaignRatio: ratio
      };
    });

    // 공구 기간에 해당하는 날짜 목록 (정보 표시용)
    const excludedDays = recentData
      .filter(d => {
        const dateStr = d.date.toISOString ? d.date.toISOString().split('T')[0] : d.date;
        return campaignRatioByDate.has(dateStr);
      })
      .map(d => {
        const dateStr = d.date.toISOString ? d.date.toISOString().split('T')[0] : d.date;
        const ratio = campaignRatioByDate.get(dateStr) || 0;
        return {
          date: dateStr,
          revenue: d.revenue,
          campaignRevenue: Math.round(d.revenue * ratio),
          baselineRevenue: Math.round(d.revenue * (1 - ratio)),
          ratio: ratio,
          orderCount: d.orderCount,
          reason: 'campaign'
        };
      });

    // 기본 매출 평균 계산 (비율 기반 조정)
    const adjustedRevenues = baselineData.map(d => d.adjustedRevenue);
    const avgBaselineRevenue = adjustedRevenues.length > 0
      ? adjustedRevenues.reduce((a, b) => a + b, 0) / adjustedRevenues.length
      : 0;

    // 선형 회귀로 추세 계산 (비율 조정된 데이터 기반)
    const trend = calculateLinearTrend(adjustedRevenues);

    // 전체 데이터로 이동평균 계산 (차트 표시용)
    const movingAvg7 = calculateMovingAverage(recentData.map(d => d.revenue), 7);
    const movingAvg30 = calculateMovingAverage(recentData.map(d => d.revenue), Math.min(30, recentData.length));

    // 예측 데이터 생성 (기본 추세 + 공구 예상 매출)
    const lastDate = new Date(recentData[recentData.length - 1].date);
    const forecast = [];

    // 예정 공구를 날짜별 매핑으로 변환
    const campaignByDate = new Map();
    for (const campaign of upcomingCampaigns) {
      const start = new Date(campaign.start_date);
      const end = new Date(campaign.end_date);
      const daysCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
      const dailyExpected = Math.round(parseInt(campaign.expected_revenue) / daysCount);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        if (!campaignByDate.has(dateStr)) {
          campaignByDate.set(dateStr, { campaigns: [], totalExpected: 0 });
        }
        const entry = campaignByDate.get(dateStr);
        entry.campaigns.push({
          id: campaign.id,
          name: campaign.name,
          influencer: campaign.influencer_name,
          dailyExpected
        });
        entry.totalExpected += dailyExpected;
      }
    }

    for (let i = 1; i <= parseInt(forecastDays); i++) {
      const forecastDate = new Date(lastDate);
      forecastDate.setDate(forecastDate.getDate() + i);
      const dateStr = forecastDate.toISOString().split('T')[0];

      // 기본 예측 (추세 반영)
      const baselinePrediction = Math.max(0, avgBaselineRevenue + (trend.slope * i));

      // 해당 날짜에 공구가 있으면 추가 매출 합산
      const campaignInfo = campaignByDate.get(dateStr);
      const campaignRevenue = campaignInfo ? campaignInfo.totalExpected : 0;
      const hasCampaign = campaignInfo ? true : false;

      forecast.push({
        date: dateStr,
        baselineRevenue: Math.round(baselinePrediction),
        campaignRevenue: campaignRevenue,
        predictedRevenue: Math.round(baselinePrediction + campaignRevenue),
        confidence: Math.max(0.5, 1 - (i * 0.02)),
        hasCampaign,
        campaigns: hasCampaign ? campaignInfo.campaigns : []
      });
    }

    // 히스토리 데이터에 이동평균 및 공구 여부 추가
    const historicalWithMA = recentData.map((d, i) => {
      const dateStr = d.date.toISOString ? d.date.toISOString().split('T')[0] : d.date;
      const campaignRatio = campaignRatioByDate.get(dateStr) || 0;
      const isCampaignDay = campaignRatio > 0;
      return {
        ...d,
        date: dateStr,
        ma7: movingAvg7[i] ? Math.round(movingAvg7[i]) : null,
        ma30: movingAvg30[i] ? Math.round(movingAvg30[i]) : null,
        isCampaignDay,
        campaignRatio: campaignRatio,
        adjustedRevenue: Math.round(d.revenue * (1 - campaignRatio)),
        isExcludedFromForecast: isCampaignDay
      };
    });

    // 요약 통계
    const totalUpcomingCampaignRevenue = upcomingCampaigns.reduce(
      (sum, c) => sum + parseInt(c.expected_revenue || 0), 0
    );

    res.json({
      historical: historicalWithMA,
      forecast,
      trend: {
        slope: trend.slope,
        direction: trend.slope > 0 ? 'up' : trend.slope < 0 ? 'down' : 'stable'
      },
      summary: {
        avgDailyRevenue: Math.round(avgBaselineRevenue),
        avgDailyRevenueBeforeExclusion: Math.round(recentData.reduce((a, b) => a + b.revenue, 0) / recentData.length),
        predictedMonthlyRevenue: Math.round(avgBaselineRevenue * 30),
        predictedMonthlyWithCampaigns: Math.round(avgBaselineRevenue * 30) + totalUpcomingCampaignRevenue,
        trendPercentage: Math.round((trend.slope / (avgBaselineRevenue || 1)) * 100 * 30)
      },
      campaigns: {
        useCampaignData: useCampaigns,
        excludedDays: excludedDays.length,
        excludedDaysList: excludedDays,
        pastCampaigns: pastCampaigns.map(c => {
          const actualRevenue = parseInt(c.actual_revenue) || 0;
          const manualActualRevenue = c.manual_actual_revenue !== null
            ? parseInt(c.manual_actual_revenue)
            : null;
          const ratio = (manualActualRevenue !== null && actualRevenue > 0)
            ? Math.min(1, manualActualRevenue / actualRevenue)
            : 1;
          return {
            id: c.id,
            name: c.name,
            influencer: c.influencer_name,
            startDate: c.start_date,
            endDate: c.end_date,
            actualRevenue: actualRevenue, // 기간 전체 매출
            manualActualRevenue: manualActualRevenue, // 수기 입력 공구 매출
            campaignRatio: ratio // 공구 비율
          };
        }),
        upcomingCampaigns: upcomingCampaigns.map(c => ({
          id: c.id,
          name: c.name,
          influencer: c.influencer_name,
          startDate: c.start_date,
          endDate: c.end_date,
          expectedRevenue: parseInt(c.expected_revenue || 0),
          status: c.status
        })),
        totalUpcomingRevenue: totalUpcomingCampaignRevenue
      }
    });
  } catch (error) {
    console.error('Error getting forecast:', error);
    res.status(500).json({ error: error.message });
  }
});

// 이동평균 계산
function calculateMovingAverage(data, window) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      result.push(null);
    } else {
      const sum = data.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / window);
    }
  }
  return result;
}

// 선형 회귀 (추세선)
function calculateLinearTrend(data) {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i];
    sumXY += i * data[i];
    sumXX += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

export default router;
