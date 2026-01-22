import { Router } from 'express';
import { query, SCHEMA } from '../services/database.js';

const router = Router();

// 공구 목록 조회 (상품 수 포함)
router.get('/', async (req, res) => {
  try {
    const { status, include_past = 'true' } = req.query;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`c.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (include_past === 'false') {
      conditions.push(`c.end_date >= CURRENT_DATE`);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    const result = await query(`
      SELECT
        c.id,
        c.name,
        c.influencer_name,
        c.start_date,
        c.end_date,
        c.expected_revenue,
        c.actual_revenue,
        c.manual_actual_revenue,
        c.status,
        c.notes,
        c.created_at,
        c.updated_at,
        CASE
          WHEN CURRENT_DATE BETWEEN c.start_date AND c.end_date THEN 'active'
          WHEN CURRENT_DATE > c.end_date THEN 'past'
          ELSE 'upcoming'
        END as period_status,
        COALESCE(cp.product_count, 0) as product_count,
        COALESCE(cp.total_expected_quantity, 0) as total_expected_quantity
      FROM ${SCHEMA}.influencer_campaigns c
      LEFT JOIN (
        SELECT
          campaign_id,
          COUNT(*) as product_count,
          SUM(expected_quantity) as total_expected_quantity
        FROM ${SCHEMA}.campaign_products
        GROUP BY campaign_id
      ) cp ON c.id = cp.campaign_id
      ${whereClause}
      ORDER BY c.start_date DESC
    `, params);

    res.json({
      campaigns: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: error.message });
  }
});

// 단일 공구 조회 (상품 목록 포함)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT *
      FROM ${SCHEMA}.influencer_campaigns
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '공구를 찾을 수 없습니다.' });
    }

    // 공구에 연결된 상품 목록 조회
    const productsResult = await query(`
      SELECT
        cp.id,
        cp.product_code,
        cp.expected_quantity,
        cp.actual_quantity,
        cp.notes,
        dp.product_name,
        dp.category
      FROM ${SCHEMA}.campaign_products cp
      LEFT JOIN ${SCHEMA}.dashboard_products dp ON cp.product_code = dp.product_code
      WHERE cp.campaign_id = $1
      ORDER BY dp.category, dp.sort_order
    `, [id]);

    res.json({
      ...result.rows[0],
      products: productsResult.rows
    });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

// 공구 등록 (상품 목록 포함)
router.post('/', async (req, res) => {
  try {
    const {
      name,
      influencer_name,
      start_date,
      end_date,
      expected_revenue = 0,
      status = 'planned',
      notes,
      products = [] // [{ product_code, expected_quantity, notes }]
    } = req.body;

    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: '공구명, 시작일, 종료일은 필수입니다.' });
    }

    // 공구 생성
    const result = await query(`
      INSERT INTO ${SCHEMA}.influencer_campaigns
      (name, influencer_name, start_date, end_date, expected_revenue, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, influencer_name, start_date, end_date, expected_revenue, status, notes]);

    const campaign = result.rows[0];

    // 상품 목록 추가
    if (products.length > 0) {
      for (const product of products) {
        await query(`
          INSERT INTO ${SCHEMA}.campaign_products
          (campaign_id, product_code, expected_quantity, notes)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (campaign_id, product_code) DO UPDATE SET
            expected_quantity = EXCLUDED.expected_quantity,
            notes = EXCLUDED.notes
        `, [campaign.id, product.product_code, product.expected_quantity || 0, product.notes || null]);
      }
    }

    // 상품 목록과 함께 반환
    const productsResult = await query(`
      SELECT cp.*, dp.product_name, dp.category
      FROM ${SCHEMA}.campaign_products cp
      LEFT JOIN ${SCHEMA}.dashboard_products dp ON cp.product_code = dp.product_code
      WHERE cp.campaign_id = $1
    `, [campaign.id]);

    res.status(201).json({
      ...campaign,
      products: productsResult.rows
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

// 공구 수정 (상품 목록 포함)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      influencer_name,
      start_date,
      end_date,
      expected_revenue,
      actual_revenue,
      manual_actual_revenue,
      status,
      notes,
      products // [{ product_code, expected_quantity, notes }] - 전달되면 전체 교체
    } = req.body;

    const result = await query(`
      UPDATE ${SCHEMA}.influencer_campaigns
      SET
        name = COALESCE($1, name),
        influencer_name = COALESCE($2, influencer_name),
        start_date = COALESCE($3, start_date),
        end_date = COALESCE($4, end_date),
        expected_revenue = COALESCE($5, expected_revenue),
        actual_revenue = COALESCE($6, actual_revenue),
        manual_actual_revenue = COALESCE($7, manual_actual_revenue),
        status = COALESCE($8, status),
        notes = COALESCE($9, notes),
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [name, influencer_name, start_date, end_date, expected_revenue, actual_revenue, manual_actual_revenue, status, notes, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '공구를 찾을 수 없습니다.' });
    }

    const campaign = result.rows[0];

    // products가 전달되면 상품 목록 전체 교체
    if (products !== undefined) {
      // 기존 상품 삭제
      await query(`DELETE FROM ${SCHEMA}.campaign_products WHERE campaign_id = $1`, [id]);

      // 새 상품 목록 추가
      if (products.length > 0) {
        for (const product of products) {
          await query(`
            INSERT INTO ${SCHEMA}.campaign_products
            (campaign_id, product_code, expected_quantity, notes)
            VALUES ($1, $2, $3, $4)
          `, [id, product.product_code, product.expected_quantity || 0, product.notes || null]);
        }
      }
    }

    // 상품 목록과 함께 반환
    const productsResult = await query(`
      SELECT cp.*, dp.product_name, dp.category
      FROM ${SCHEMA}.campaign_products cp
      LEFT JOIN ${SCHEMA}.dashboard_products dp ON cp.product_code = dp.product_code
      WHERE cp.campaign_id = $1
    `, [id]);

    res.json({
      ...campaign,
      products: productsResult.rows
    });
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

// 공구 삭제
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      DELETE FROM ${SCHEMA}.influencer_campaigns
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '공구를 찾을 수 없습니다.' });
    }

    res.json({ message: '삭제되었습니다.', id: parseInt(id) });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

// 공구 기간의 실제 매출 계산 및 업데이트
router.post('/:id/calculate-actual', async (req, res) => {
  try {
    const { id } = req.params;

    // 공구 정보 조회
    const campaignResult = await query(`
      SELECT start_date, end_date FROM ${SCHEMA}.influencer_campaigns WHERE id = $1
    `, [id]);

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: '공구를 찾을 수 없습니다.' });
    }

    const { start_date, end_date } = campaignResult.rows[0];

    // 해당 기간 실제 매출 계산
    const revenueResult = await query(`
      SELECT COALESCE(SUM(
        CASE WHEN shop_cd IN ('A077', '1077') THEN pay_amt ELSE sales END
      ), 0) as actual_revenue
      FROM ${SCHEMA}.orders
      WHERE DATE(ord_time) BETWEEN $1 AND $2
        AND ord_status NOT IN ('반품요청', '교환요청', '교환회수완료', '취소완료', '반품완료', '주문보류', '주문재확인')
    `, [start_date, end_date]);

    const actualRevenue = parseInt(revenueResult.rows[0].actual_revenue);

    // 실제 매출 업데이트
    const updateResult = await query(`
      UPDATE ${SCHEMA}.influencer_campaigns
      SET actual_revenue = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [actualRevenue, id]);

    // 공구에 연결된 상품들의 실제 판매량도 계산
    const campaignProducts = await query(`
      SELECT product_code FROM ${SCHEMA}.campaign_products WHERE campaign_id = $1
    `, [id]);

    const productActuals = [];
    for (const product of campaignProducts.rows) {
      // v_auto_product_mapping을 통해 실제 판매량 계산
      const quantityResult = await query(`
        SELECT COALESCE(SUM(vm.quantity * o.sale_cnt), 0) as actual_quantity
        FROM ${SCHEMA}.orders o
        JOIN ${SCHEMA}.v_auto_product_mapping vm
          ON o.shop_sale_name = vm.shop_sale_name
          AND COALESCE(o.shop_opt_name, '') = COALESCE(vm.shop_opt_name, '')
        WHERE vm.product_code = $1
          AND DATE(o.ord_time) BETWEEN $2 AND $3
          AND o.ord_status NOT IN ('취소완료', '반품완료', '교환완료', '환불')
      `, [product.product_code, start_date, end_date]);

      const actualQuantity = parseInt(quantityResult.rows[0].actual_quantity);

      // 실제 판매량 업데이트
      await query(`
        UPDATE ${SCHEMA}.campaign_products
        SET actual_quantity = $1
        WHERE campaign_id = $2 AND product_code = $3
      `, [actualQuantity, id, product.product_code]);

      productActuals.push({
        product_code: product.product_code,
        actual_quantity: actualQuantity
      });
    }

    // 상품 목록과 함께 반환
    const productsResult = await query(`
      SELECT cp.*, dp.product_name, dp.category
      FROM ${SCHEMA}.campaign_products cp
      LEFT JOIN ${SCHEMA}.dashboard_products dp ON cp.product_code = dp.product_code
      WHERE cp.campaign_id = $1
    `, [id]);

    res.json({
      message: '실제 매출 및 상품별 판매량이 계산되었습니다.',
      campaign: {
        ...updateResult.rows[0],
        products: productsResult.rows
      }
    });
  } catch (error) {
    console.error('Error calculating actual revenue:', error);
    res.status(500).json({ error: error.message });
  }
});

// 예측에 사용할 공구 데이터 조회 (과거 공구 날짜 + 미래 예정 공구)
router.get('/forecast/data', async (req, res) => {
  try {
    // 과거 공구 날짜들 (제외 대상)
    const pastCampaigns = await query(`
      SELECT
        id, name, influencer_name,
        start_date, end_date,
        expected_revenue, actual_revenue, manual_actual_revenue
      FROM ${SCHEMA}.influencer_campaigns
      WHERE end_date < CURRENT_DATE
        AND status != 'cancelled'
      ORDER BY start_date DESC
    `);

    // 현재 진행중 + 예정된 공구
    const upcomingCampaigns = await query(`
      SELECT
        id, name, influencer_name,
        start_date, end_date,
        expected_revenue, status
      FROM ${SCHEMA}.influencer_campaigns
      WHERE end_date >= CURRENT_DATE
        AND status IN ('planned', 'active')
      ORDER BY start_date ASC
    `);

    // 과거 공구 날짜 리스트 및 비율 정보 생성
    const excludeDates = [];
    const campaignRatios = []; // 비율 기반 제외 정보
    for (const campaign of pastCampaigns.rows) {
      const start = new Date(campaign.start_date);
      const end = new Date(campaign.end_date);
      const actualRevenue = parseInt(campaign.actual_revenue) || 0;
      const manualActualRevenue = campaign.manual_actual_revenue !== null
        ? parseInt(campaign.manual_actual_revenue)
        : null;

      // 비율 계산: manual_actual_revenue가 있으면 사용, 없으면 비율 정보 없음
      const ratio = (manualActualRevenue !== null && actualRevenue > 0)
        ? Math.min(1, manualActualRevenue / actualRevenue)  // 최대 100%
        : null;

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        excludeDates.push(dateStr);
        if (ratio !== null) {
          campaignRatios.push({
            date: dateStr,
            campaignId: campaign.id,
            campaignName: campaign.name,
            ratio: ratio
          });
        }
      }
    }

    res.json({
      pastCampaigns: pastCampaigns.rows,
      upcomingCampaigns: upcomingCampaigns.rows,
      excludeDates: [...new Set(excludeDates)], // 중복 제거
      campaignRatios: campaignRatios, // 비율 정보 추가
      totalPastCampaigns: pastCampaigns.rows.length,
      totalUpcomingCampaigns: upcomingCampaigns.rows.length
    });
  } catch (error) {
    console.error('Error fetching forecast data:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
