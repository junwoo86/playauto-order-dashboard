import { Router } from 'express';
import { query, SCHEMA } from '../services/database.js';
import XLSX from 'xlsx';

const router = Router();

// 스마트스토어 shop_cd (pay_amt 기준 매출)
const SMARTSTORE_SHOP_CDS = ['A077', '1077'];

// 매출 계산 SQL 표현식
// 스마트스토어(A077, 1077)는 pay_amt, 나머지는 sales 사용
const REVENUE_SQL = `CASE WHEN shop_cd IN ('${SMARTSTORE_SHOP_CDS.join("', '")}') THEN pay_amt ELSE sales END`;

// 엑셀 리포트 다운로드
router.get('/excel', async (req, res) => {
  try {
    const { sdate, edate, shop_cd, reportType = 'all' } = req.query;

    // 기간 조건
    let conditions = [];
    let params = [];
    let paramIndex = 1;

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
    if (shop_cd) {
      conditions.push(`shop_cd = $${paramIndex}`);
      params.push(shop_cd);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 워크북 생성
    const wb = XLSX.utils.book_new();

    // 1. 요약 시트
    if (reportType === 'all' || reportType === 'summary') {
      const summaryResult = await query(`
        SELECT
          COUNT(*) as "총 주문수",
          COALESCE(SUM(${REVENUE_SQL}), 0) as "총 매출액",
          COALESCE(SUM(sale_cnt), 0) as "총 판매수량",
          ROUND(COALESCE(AVG(${REVENUE_SQL}), 0)) as "평균 객단가"
        FROM ${SCHEMA}.orders
        ${whereClause}
      `, params);

      const summaryData = summaryResult.rows;
      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, '요약');
    }

    // 2. 스토어별 매출 시트
    if (reportType === 'all' || reportType === 'store') {
      const storeResult = await query(`
        SELECT
          shop_name as "쇼핑몰",
          seller_nick as "스토어명",
          COUNT(*) as "주문수",
          COALESCE(SUM(sale_cnt), 0) as "판매수량",
          COALESCE(SUM(${REVENUE_SQL}), 0) as "매출액",
          COALESCE(SUM(pay_amt), 0) as "실결제금액",
          COALESCE(SUM(sales), 0) as "판매금액",
          ROUND(COALESCE(AVG(${REVENUE_SQL}), 0)) as "평균객단가"
        FROM ${SCHEMA}.orders
        ${whereClause}
        GROUP BY shop_cd, shop_name, seller_nick
        ORDER BY SUM(${REVENUE_SQL}) DESC
      `, params);

      const storeWs = XLSX.utils.json_to_sheet(storeResult.rows);
      XLSX.utils.book_append_sheet(wb, storeWs, '스토어별 매출');
    }

    // 3. 상품별 판매 시트
    if (reportType === 'all' || reportType === 'product') {
      const productResult = await query(`
        SELECT
          shop_sale_name as "상품명",
          shop_name as "쇼핑몰",
          COUNT(*) as "주문수",
          COALESCE(SUM(sale_cnt), 0) as "판매수량",
          COALESCE(SUM(${REVENUE_SQL}), 0) as "매출액",
          COALESCE(SUM(pay_amt), 0) as "실결제금액",
          COALESCE(SUM(sales), 0) as "판매금액",
          ROUND(COALESCE(AVG(${REVENUE_SQL}), 0)) as "평균판매가"
        FROM ${SCHEMA}.orders
        ${whereClause}
        GROUP BY shop_sale_name, shop_cd, shop_name
        ORDER BY SUM(${REVENUE_SQL}) DESC
        LIMIT 100
      `, params);

      const productWs = XLSX.utils.json_to_sheet(productResult.rows);
      XLSX.utils.book_append_sheet(wb, productWs, '상품별 판매');
    }

    // 4. 일별 추이 시트
    if (reportType === 'all' || reportType === 'trend') {
      const trendResult = await query(`
        SELECT
          DATE(ord_time) as "날짜",
          COUNT(*) as "주문수",
          COALESCE(SUM(sale_cnt), 0) as "판매수량",
          COALESCE(SUM(${REVENUE_SQL}), 0) as "매출액",
          ROUND(COALESCE(AVG(${REVENUE_SQL}), 0)) as "평균객단가"
        FROM ${SCHEMA}.orders
        ${whereClause}
        GROUP BY DATE(ord_time)
        ORDER BY DATE(ord_time) ASC
      `, params);

      const trendWs = XLSX.utils.json_to_sheet(trendResult.rows);
      XLSX.utils.book_append_sheet(wb, trendWs, '일별 추이');
    }

    // 5. 월별 추이 시트
    if (reportType === 'all' || reportType === 'monthly') {
      const monthlyResult = await query(`
        SELECT
          to_char(ord_time, 'YYYY-MM') as "월",
          COUNT(*) as "주문수",
          COALESCE(SUM(sale_cnt), 0) as "판매수량",
          COALESCE(SUM(${REVENUE_SQL}), 0) as "매출액",
          ROUND(COALESCE(AVG(${REVENUE_SQL}), 0)) as "평균객단가"
        FROM ${SCHEMA}.orders
        ${whereClause}
        GROUP BY to_char(ord_time, 'YYYY-MM')
        ORDER BY to_char(ord_time, 'YYYY-MM') ASC
      `, params);

      const monthlyWs = XLSX.utils.json_to_sheet(monthlyResult.rows);
      XLSX.utils.book_append_sheet(wb, monthlyWs, '월별 추이');
    }

    // 6. 주문 상세 시트 (최대 5000건)
    if (reportType === 'all' || reportType === 'detail') {
      const detailResult = await query(`
        SELECT
          ord_time as "주문일시",
          shop_name as "쇼핑몰",
          seller_nick as "스토어명",
          shop_ord_no as "주문번호",
          shop_sale_name as "상품명",
          shop_opt_name as "옵션",
          order_name as "주문자",
          sale_cnt as "수량",
          pay_amt as "결제금액",
          ord_status as "주문상태"
        FROM ${SCHEMA}.orders
        ${whereClause}
        ORDER BY ord_time DESC
        LIMIT 5000
      `, params);

      const detailWs = XLSX.utils.json_to_sheet(detailResult.rows);
      XLSX.utils.book_append_sheet(wb, detailWs, '주문상세');
    }

    // 엑셀 파일 생성
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // 파일명 생성
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `playauto_report_${dateStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: error.message });
  }
});

// CSV 다운로드 (주문 상세)
router.get('/csv', async (req, res) => {
  try {
    const { sdate, edate, shop_cd } = req.query;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

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
    if (shop_cd) {
      conditions.push(`shop_cd = $${paramIndex}`);
      params.push(shop_cd);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const ordersResult = await query(`
      SELECT
        ord_time, shop_name, seller_nick, shop_ord_no,
        shop_sale_name, shop_opt_name, order_name,
        sale_cnt, pay_amt, sales, ord_status
      FROM ${SCHEMA}.orders
      ${whereClause}
      ORDER BY ord_time DESC
      LIMIT 10000
    `, params);

    // CSV 생성
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(ordersResult.rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');

    const csvBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'csv' });

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `playauto_orders_${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.concat([Buffer.from('\uFEFF'), csvBuffer])); // BOM 추가

  } catch (error) {
    console.error('Error generating CSV:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
