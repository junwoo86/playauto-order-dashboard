import { Router } from 'express';
import { query, SCHEMA, refreshAutoMappingView } from '../services/database.js';

const router = Router();

// ============================================
// 자동 매핑 결과 조회 (VIEW 기반)
// ============================================

// 전체 자동 매핑 결과 조회
router.get('/auto', async (req, res) => {
  try {
    const { page = 1, limit = 100, product_code, mapped_only, search, sort = 'order_count' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (product_code) {
      conditions.push(`product_code = $${paramIndex}`);
      params.push(product_code);
      paramIndex++;
    }

    if (mapped_only === 'true') {
      conditions.push(`product_code IS NOT NULL`);
    }

    // 검색어 필터 (상품명 또는 옵션명에서 검색)
    if (search && search.trim()) {
      conditions.push(`(shop_sale_name ILIKE $${paramIndex} OR shop_opt_name ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // 정렬 옵션
    let orderBy = 'ORDER BY order_count DESC';
    if (sort === 'product_name') {
      orderBy = 'ORDER BY shop_sale_name ASC, shop_opt_name ASC';
    } else if (sort === 'option_name') {
      orderBy = 'ORDER BY shop_opt_name ASC, shop_sale_name ASC';
    }

    // 총 건수
    const countResult = await query(`
      SELECT COUNT(*) as total FROM ${SCHEMA}.v_auto_product_mapping ${whereClause}
    `, params);

    // 매핑 결과
    const result = await query(`
      SELECT
        shop_sale_name,
        shop_opt_name,
        product_code,
        quantity,
        mapping_type,
        verified,
        order_count
      FROM ${SCHEMA}.v_auto_product_mapping
      ${whereClause}
      ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), offset]);

    res.json({
      mappings: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching auto mappings:', error);
    res.status(500).json({ error: error.message });
  }
});

// 미매핑 항목 조회
router.get('/auto/unmapped', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, sort = 'order_count' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = ['product_code IS NULL'];
    let params = [];
    let paramIndex = 1;

    // 검색어 필터 (상품명 또는 옵션명에서 검색)
    if (search && search.trim()) {
      conditions.push(`(shop_sale_name ILIKE $${paramIndex} OR shop_opt_name ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    // 정렬 옵션
    let orderBy = 'ORDER BY order_count DESC';
    if (sort === 'product_name') {
      orderBy = 'ORDER BY shop_sale_name ASC, shop_opt_name ASC';
    } else if (sort === 'option_name') {
      orderBy = 'ORDER BY shop_opt_name ASC, shop_sale_name ASC';
    }

    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM ${SCHEMA}.v_auto_product_mapping
      ${whereClause}
    `, params);

    const result = await query(`
      SELECT
        shop_sale_name,
        shop_opt_name,
        order_count
      FROM ${SCHEMA}.v_auto_product_mapping
      ${whereClause}
      ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), offset]);

    res.json({
      unmapped: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching unmapped items:', error);
    res.status(500).json({ error: error.message });
  }
});

// 검증 필요 항목 조회 (주문 건수 많은 순)
router.get('/auto/verify', async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const result = await query(`
      SELECT
        shop_sale_name,
        shop_opt_name,
        product_code,
        quantity,
        mapping_type,
        verified,
        order_count
      FROM ${SCHEMA}.v_auto_product_mapping
      WHERE product_code IS NOT NULL AND verified = false
      ORDER BY order_count DESC
      LIMIT $1
    `, [parseInt(limit)]);

    res.json({
      items: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching verify items:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 수동 매핑 관리
// ============================================

// 수동 매핑 추가/수정
router.post('/manual', async (req, res) => {
  try {
    const { shop_sale_name, shop_opt_name, product_code, quantity = 1 } = req.body;

    if (!shop_sale_name || !product_code) {
      return res.status(400).json({ error: 'shop_sale_name과 product_code는 필수입니다.' });
    }

    const result = await query(`
      INSERT INTO ${SCHEMA}.product_name_mappings
        (shop_sale_name, shop_opt_name, product_code, quantity, mapping_type, verified)
      VALUES ($1, $2, $3, $4, 'manual', true)
      ON CONFLICT (shop_sale_name, shop_opt_name, product_code) DO UPDATE SET
        quantity = EXCLUDED.quantity,
        mapping_type = 'manual',
        verified = true,
        updated_at = NOW()
      RETURNING *
    `, [shop_sale_name, shop_opt_name || '', product_code, quantity]);

    res.json({
      success: true,
      mapping: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating manual mapping:', error);
    res.status(500).json({ error: error.message });
  }
});

// 수동 매핑 삭제
router.delete('/manual', async (req, res) => {
  try {
    const { shop_sale_name, shop_opt_name, product_code } = req.body;

    if (!shop_sale_name || !product_code) {
      return res.status(400).json({ error: 'shop_sale_name과 product_code는 필수입니다.' });
    }

    const result = await query(`
      DELETE FROM ${SCHEMA}.product_name_mappings
      WHERE shop_sale_name = $1
        AND shop_opt_name = $2
        AND product_code = $3
      RETURNING *
    `, [shop_sale_name, shop_opt_name || '', product_code]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '매핑을 찾을 수 없습니다.' });
    }

    res.json({
      success: true,
      deleted: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting manual mapping:', error);
    res.status(500).json({ error: error.message });
  }
});

// 매핑 검증 완료 처리
router.put('/verify', async (req, res) => {
  try {
    const { shop_sale_name, shop_opt_name, product_code, quantity = 1 } = req.body;

    if (!shop_sale_name || !product_code) {
      return res.status(400).json({ error: 'shop_sale_name과 product_code는 필수입니다.' });
    }

    // 검증된 매핑을 product_name_mappings 테이블에 저장
    const result = await query(`
      INSERT INTO ${SCHEMA}.product_name_mappings
        (shop_sale_name, shop_opt_name, product_code, quantity, mapping_type, verified)
      VALUES ($1, $2, $3, $4, 'verified', true)
      ON CONFLICT (shop_sale_name, shop_opt_name, product_code) DO UPDATE SET
        quantity = EXCLUDED.quantity,
        mapping_type = 'verified',
        verified = true,
        updated_at = NOW()
      RETURNING *
    `, [shop_sale_name, shop_opt_name || '', product_code, quantity]);

    res.json({
      success: true,
      mapping: result.rows[0]
    });
  } catch (error) {
    console.error('Error verifying mapping:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 상품 출고 통계 (대시보드용)
// ============================================

// 상품별 출고 요약
router.get('/stats/summary', async (req, res) => {
  try {
    const { sdate, edate } = req.query;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (sdate) {
      conditions.push(`order_date >= $${paramIndex}`);
      params.push(sdate);
      paramIndex++;
    }

    if (edate) {
      conditions.push(`order_date <= $${paramIndex}`);
      params.push(edate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await query(`
      SELECT
        product_code,
        SUM(total_quantity) as total_quantity,
        SUM(order_count) as order_count,
        SUM(revenue) as revenue
      FROM ${SCHEMA}.v_product_shipment_stats
      ${whereClause}
      GROUP BY product_code
      ORDER BY total_quantity DESC
    `, params);

    // 전체 매핑 통계
    const mappingStatsResult = await query(`
      SELECT
        COUNT(*) as total_combinations,
        COUNT(*) FILTER (WHERE product_code IS NOT NULL) as mapped_combinations,
        SUM(order_count) as total_orders,
        SUM(order_count) FILTER (WHERE product_code IS NOT NULL) as mapped_orders
      FROM ${SCHEMA}.v_auto_product_mapping
    `);

    const mappingStats = mappingStatsResult.rows[0];

    res.json({
      productStats: result.rows,
      mappingStats: {
        totalCombinations: parseInt(mappingStats.total_combinations) || 0,
        mappedCombinations: parseInt(mappingStats.mapped_combinations) || 0,
        totalOrders: parseInt(mappingStats.total_orders) || 0,
        mappedOrders: parseInt(mappingStats.mapped_orders) || 0,
        mappingRate: mappingStats.total_orders > 0
          ? Math.round((mappingStats.mapped_orders / mappingStats.total_orders) * 10000) / 100
          : 0
      }
    });
  } catch (error) {
    console.error('Error fetching stats summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// 일별 출고 추이
router.get('/stats/daily', async (req, res) => {
  try {
    const { sdate, edate, product_code, exclude_internal } = req.query;
    const excludeInternal = exclude_internal === 'true';

    let result;

    if (excludeInternal) {
      // 내부 확인용 제외 시 orders 테이블에서 직접 조회
      let conditions = [`o.shop_sale_name NOT LIKE '%내부 확인용%'`];
      let params = [];
      let paramIndex = 1;

      if (sdate) {
        conditions.push(`DATE(o.ord_time) >= $${paramIndex}`);
        params.push(sdate);
        paramIndex++;
      }

      if (edate) {
        conditions.push(`DATE(o.ord_time) <= $${paramIndex}`);
        params.push(edate);
        paramIndex++;
      }

      if (product_code) {
        conditions.push(`vm.product_code = $${paramIndex}`);
        params.push(product_code);
        paramIndex++;
      }

      conditions.push(`o.ord_status NOT IN ('취소완료', '반품완료', '교환완료', '환불')`);
      const whereClause = 'WHERE ' + conditions.join(' AND ');

      result = await query(`
        SELECT
          DATE(o.ord_time) as order_date,
          vm.product_code,
          SUM(vm.quantity * o.sale_cnt)::integer as total_quantity,
          COUNT(DISTINCT o.uniq)::integer as order_count,
          SUM(CASE WHEN o.shop_cd IN ('A077', '1077') THEN o.pay_amt ELSE o.sales END)::numeric as revenue
        FROM ${SCHEMA}.orders o
        JOIN ${SCHEMA}.v_auto_product_mapping vm
          ON o.shop_sale_name = vm.shop_sale_name
          AND COALESCE(o.shop_opt_name, '') = COALESCE(vm.shop_opt_name, '')
        ${whereClause}
        GROUP BY DATE(o.ord_time), vm.product_code
        ORDER BY order_date ASC, product_code
      `, params);
    } else {
      // 기존 로직: v_product_shipment_stats 뷰 사용
      let conditions = [];
      let params = [];
      let paramIndex = 1;

      if (sdate) {
        conditions.push(`order_date >= $${paramIndex}`);
        params.push(sdate);
        paramIndex++;
      }

      if (edate) {
        conditions.push(`order_date <= $${paramIndex}`);
        params.push(edate);
        paramIndex++;
      }

      if (product_code) {
        conditions.push(`product_code = $${paramIndex}`);
        params.push(product_code);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      result = await query(`
        SELECT
          order_date,
          product_code,
          total_quantity,
          order_count,
          revenue
        FROM ${SCHEMA}.v_product_shipment_stats
        ${whereClause}
        ORDER BY order_date ASC, product_code
      `, params);
    }

    res.json({
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching daily stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// 월별 출고 추이
router.get('/stats/monthly', async (req, res) => {
  try {
    const { product_code } = req.query;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (product_code) {
      conditions.push(`product_code = $${paramIndex}`);
      params.push(product_code);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await query(`
      SELECT
        month,
        product_code,
        total_quantity,
        order_count,
        revenue
      FROM ${SCHEMA}.v_product_monthly_trend
      ${whereClause}
      ORDER BY month ASC, product_code
    `, params);

    res.json({
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching monthly stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// 특정 상품 상세 통계
router.get('/stats/by-product/:productCode', async (req, res) => {
  try {
    const { productCode } = req.params;
    const { sdate, edate } = req.query;

    let conditions = [`product_code = $1`];
    let params = [productCode];
    let paramIndex = 2;

    if (sdate) {
      conditions.push(`order_date >= $${paramIndex}`);
      params.push(sdate);
      paramIndex++;
    }

    if (edate) {
      conditions.push(`order_date <= $${paramIndex}`);
      params.push(edate);
      paramIndex++;
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    // 일별 데이터
    const dailyResult = await query(`
      SELECT order_date, total_quantity, order_count, revenue
      FROM ${SCHEMA}.v_product_shipment_stats
      ${whereClause}
      ORDER BY order_date ASC
    `, params);

    // 요약 데이터
    const summaryResult = await query(`
      SELECT
        SUM(total_quantity) as total_quantity,
        SUM(order_count) as order_count,
        SUM(revenue) as revenue,
        AVG(total_quantity) as avg_daily_quantity
      FROM ${SCHEMA}.v_product_shipment_stats
      ${whereClause}
    `, params);

    // 매핑된 상품명/옵션명 조합 목록
    const mappingsResult = await query(`
      SELECT shop_sale_name, shop_opt_name, quantity, order_count, mapping_type, verified
      FROM ${SCHEMA}.v_auto_product_mapping
      WHERE product_code = $1
      ORDER BY order_count DESC
    `, [productCode]);

    res.json({
      productCode,
      daily: dailyResult.rows,
      summary: summaryResult.rows[0],
      mappings: mappingsResult.rows
    });
  } catch (error) {
    console.error('Error fetching product stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 상품(SKU) 목록 조회
// ============================================

router.get('/products', async (req, res) => {
  try {
    const { search } = req.query;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(product_code ILIKE $${paramIndex} OR product_name ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await query(`
      SELECT product_code, product_name
      FROM ${SCHEMA}.products
      ${whereClause}
      ORDER BY product_code
    `, params);

    res.json({
      products: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 전체 상품 목록 (드롭다운 선택용) - DB 기반
// ============================================

router.get('/product-list', async (req, res) => {
  try {
    const result = await query(`
      SELECT product_code, product_name, category
      FROM ${SCHEMA}.dashboard_products
      WHERE is_active = true
      ORDER BY sort_order ASC, product_code ASC
    `);

    // 카테고리별로 그룹화
    const analysis = result.rows
      .filter(p => p.category === 'analysis')
      .map(p => ({ code: p.product_code, name: p.product_name }));

    const supplements = result.rows
      .filter(p => p.category === 'supplement')
      .map(p => ({ code: p.product_code, name: p.product_name }));

    const teamketo = result.rows
      .filter(p => p.category === 'teamketo')
      .map(p => ({ code: p.product_code, name: p.product_name }));

    const etc = result.rows
      .filter(p => p.category !== 'analysis' && p.category !== 'supplement' && p.category !== 'teamketo')
      .map(p => ({ code: p.product_code, name: p.product_name }));

    res.json({
      analysis,
      supplements,
      teamketo: teamketo.length > 0 ? teamketo : undefined,
      etc: etc.length > 0 ? etc : undefined
    });
  } catch (error) {
    console.error('Error fetching product list:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 대시보드 상품 관리 API (CRUD)
// ============================================

// 전체 상품 목록 조회 (관리용)
router.get('/dashboard-products', async (req, res) => {
  try {
    const { category, include_inactive } = req.query;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    if (include_inactive !== 'true') {
      conditions.push(`is_active = true`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await query(`
      SELECT id, product_code, product_name, category, keywords, is_active, sort_order, created_at, updated_at
      FROM ${SCHEMA}.dashboard_products
      ${whereClause}
      ORDER BY sort_order ASC, product_code ASC
    `, params);

    res.json({
      products: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching dashboard products:', error);
    res.status(500).json({ error: error.message });
  }
});

// 상품 추가
router.post('/dashboard-products', async (req, res) => {
  try {
    const { product_code, product_name, category = 'etc', sort_order = 0, keywords = [] } = req.body;

    if (!product_code || !product_name) {
      return res.status(400).json({ error: 'product_code와 product_name은 필수입니다.' });
    }

    // SKU 코드 중복 체크
    const existing = await query(`
      SELECT id FROM ${SCHEMA}.dashboard_products WHERE product_code = $1
    `, [product_code]);

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: '이미 존재하는 SKU 코드입니다.' });
    }

    // 키워드가 비어있으면 상품명을 기본 키워드로 사용
    const finalKeywords = keywords.length > 0 ? keywords : [product_name];

    const result = await query(`
      INSERT INTO ${SCHEMA}.dashboard_products (product_code, product_name, category, sort_order, keywords)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [product_code, product_name, category, sort_order, finalKeywords]);

    // 건기식 상품인 경우 VIEW 재생성
    if (category === 'supplement') {
      await refreshAutoMappingView();
    }

    res.json({
      success: true,
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating dashboard product:', error);
    res.status(500).json({ error: error.message });
  }
});

// 상품 수정
router.put('/dashboard-products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { product_code, product_name, category, is_active, sort_order, keywords } = req.body;

    // 기존 상품 확인
    const existing = await query(`
      SELECT * FROM ${SCHEMA}.dashboard_products WHERE id = $1
    `, [id]);

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    }

    const oldProduct = existing.rows[0];

    // SKU 코드 변경 시 중복 체크
    if (product_code && product_code !== oldProduct.product_code) {
      const duplicateCheck = await query(`
        SELECT id FROM ${SCHEMA}.dashboard_products WHERE product_code = $1 AND id != $2
      `, [product_code, id]);

      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({ error: '이미 존재하는 SKU 코드입니다.' });
      }
    }

    const result = await query(`
      UPDATE ${SCHEMA}.dashboard_products
      SET
        product_code = COALESCE($1, product_code),
        product_name = COALESCE($2, product_name),
        category = COALESCE($3, category),
        is_active = COALESCE($4, is_active),
        sort_order = COALESCE($5, sort_order),
        keywords = COALESCE($6, keywords),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [product_code, product_name, category, is_active, sort_order, keywords, id]);

    const newProduct = result.rows[0];

    // 건기식 상품의 키워드 변경 또는 카테고리 변경 시 VIEW 재생성
    const needRefresh =
      oldProduct.category === 'supplement' ||
      newProduct.category === 'supplement';

    if (needRefresh) {
      await refreshAutoMappingView();
    }

    res.json({
      success: true,
      product: newProduct
    });
  } catch (error) {
    console.error('Error updating dashboard product:', error);
    res.status(500).json({ error: error.message });
  }
});

// 상품 삭제 (소프트 삭제 - is_active = false)
router.delete('/dashboard-products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent } = req.query;

    // 삭제 전 카테고리 확인
    const existing = await query(`
      SELECT category FROM ${SCHEMA}.dashboard_products WHERE id = $1
    `, [id]);

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    }

    const category = existing.rows[0].category;

    if (permanent === 'true') {
      // 완전 삭제
      const result = await query(`
        DELETE FROM ${SCHEMA}.dashboard_products WHERE id = $1 RETURNING *
      `, [id]);

      // 건기식 상품인 경우 VIEW 재생성
      if (category === 'supplement') {
        await refreshAutoMappingView();
      }

      res.json({
        success: true,
        deleted: result.rows[0]
      });
    } else {
      // 소프트 삭제 (비활성화)
      const result = await query(`
        UPDATE ${SCHEMA}.dashboard_products SET is_active = false, updated_at = NOW()
        WHERE id = $1 RETURNING *
      `, [id]);

      // 건기식 상품인 경우 VIEW 재생성
      if (category === 'supplement') {
        await refreshAutoMappingView();
      }

      res.json({
        success: true,
        deactivated: result.rows[0]
      });
    }
  } catch (error) {
    console.error('Error deleting dashboard product:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SKU별 판매량 (대시보드 메인 섹션용)
// ============================================

router.get('/stats/sku-sales', async (req, res) => {
  try {
    const { sdate, edate, exclude_internal } = req.query;
    const excludeInternal = exclude_internal === 'true';

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (sdate) {
      conditions.push(`s.order_date >= $${paramIndex}`);
      params.push(sdate);
      paramIndex++;
    }

    if (edate) {
      conditions.push(`s.order_date <= $${paramIndex}`);
      params.push(edate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    let result;

    if (excludeInternal) {
      // 내부 확인용 제외 시 orders 테이블에서 직접 조회
      let orderConditions = [];
      let orderParams = [];
      let orderParamIndex = 1;

      if (sdate) {
        orderConditions.push(`DATE(o.ord_time) >= $${orderParamIndex}`);
        orderParams.push(sdate);
        orderParamIndex++;
      }
      if (edate) {
        orderConditions.push(`DATE(o.ord_time) <= $${orderParamIndex}`);
        orderParams.push(edate);
        orderParamIndex++;
      }
      orderConditions.push(`o.shop_sale_name NOT LIKE '%내부 확인용%'`);
      orderConditions.push(`o.ord_status NOT IN ('취소완료', '반품완료', '교환완료', '환불')`);

      const orderWhereClause = orderConditions.length > 0 ? 'AND ' + orderConditions.join(' AND ') : '';

      result = await query(`
        SELECT
          dp.product_code,
          dp.product_name,
          dp.category,
          COALESCE(SUM(vm.quantity * o.sale_cnt), 0)::integer as total_quantity,
          COALESCE(COUNT(DISTINCT o.uniq), 0)::integer as order_count,
          COALESCE(SUM(CASE WHEN o.shop_cd IN ('A077', '1077') THEN o.pay_amt ELSE o.sales END), 0)::numeric as revenue
        FROM ${SCHEMA}.dashboard_products dp
        LEFT JOIN ${SCHEMA}.v_auto_product_mapping vm ON dp.product_code = vm.product_code
        LEFT JOIN ${SCHEMA}.orders o
          ON o.shop_sale_name = vm.shop_sale_name
          AND COALESCE(o.shop_opt_name, '') = COALESCE(vm.shop_opt_name, '')
          ${orderWhereClause}
        WHERE dp.is_active = true
        GROUP BY dp.product_code, dp.product_name, dp.category, dp.sort_order
        ORDER BY dp.category, dp.sort_order, dp.product_code
      `, orderParams);
    } else {
      // 기존 로직: v_product_shipment_stats 뷰 사용
      result = await query(`
        SELECT
          dp.product_code,
          dp.product_name,
          dp.category,
          COALESCE(SUM(s.total_quantity), 0)::integer as total_quantity,
          COALESCE(SUM(s.order_count), 0)::integer as order_count,
          COALESCE(SUM(s.revenue), 0)::numeric as revenue
        FROM ${SCHEMA}.dashboard_products dp
        LEFT JOIN ${SCHEMA}.v_product_shipment_stats s ON dp.product_code = s.product_code
          ${conditions.length > 0 ? 'AND ' + conditions.map(c => c.replace('s.', 's.')).join(' AND ') : ''}
        WHERE dp.is_active = true
        GROUP BY dp.product_code, dp.product_name, dp.category, dp.sort_order
        ORDER BY dp.category, dp.sort_order, dp.product_code
      `, params);
    }

    // 카테고리별 그룹화
    const analysis = result.rows
      .filter(r => r.category === 'analysis')
      .map(r => ({
        product_code: r.product_code,
        product_name: r.product_name,
        quantity: parseInt(r.total_quantity) || 0,
        order_count: parseInt(r.order_count) || 0,
        revenue: parseFloat(r.revenue) || 0
      }));

    const supplements = result.rows
      .filter(r => r.category === 'supplement')
      .map(r => ({
        product_code: r.product_code,
        product_name: r.product_name,
        quantity: parseInt(r.total_quantity) || 0,
        order_count: parseInt(r.order_count) || 0,
        revenue: parseFloat(r.revenue) || 0
      }));

    res.json({
      analysis,
      supplements,
      analysisTotal: {
        quantity: analysis.reduce((sum, item) => sum + item.quantity, 0),
        order_count: analysis.reduce((sum, item) => sum + item.order_count, 0),
        revenue: analysis.reduce((sum, item) => sum + item.revenue, 0)
      },
      supplementsTotal: {
        quantity: supplements.reduce((sum, item) => sum + item.quantity, 0),
        order_count: supplements.reduce((sum, item) => sum + item.order_count, 0),
        revenue: supplements.reduce((sum, item) => sum + item.revenue, 0)
      }
    });
  } catch (error) {
    console.error('Error fetching SKU sales:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// BKG 상품 코드 목록 (참조용)
// ============================================

router.get('/bkg-codes', async (req, res) => {
  res.json({
    codes: [
      { code: 'BKG000001', name: '음식물 과민증/지연성 분석', keywords: ['과민증', '지연성'] },
      { code: 'BKG000002', name: '영양/중금속 분석', keywords: ['영양', '중금속'] },
      { code: 'BKG000003', name: '펫 분석', keywords: ['펫'] },
      { code: 'BKG000004', name: '장내세균 분석', keywords: ['장내세균'] },
      { code: 'BKG000005', name: '대사기능 분석', keywords: ['대사기능'] },
      { code: 'BKG000006', name: '스트레스/노화 분석', keywords: ['스트레스', '노화'] },
      { code: 'BKG000007', name: '호르몬 분석', keywords: ['호르몬'] }
    ],
    note: '분석/검사 키워드가 있는 경우 shop_opt_name 기준으로 매핑됩니다.'
  });
});

// ============================================
// 커피 출고량 집계 API
// ============================================

// 커피 종류별 출고량 요약
router.get('/stats/coffee-summary', async (req, res) => {
  try {
    const { sdate, edate } = req.query;

    // 먼저 dashboard_products에서 모든 커피 상품 목록을 가져옴
    const allProducts = await query(`
      SELECT product_code, product_name, category, sort_order
      FROM ${SCHEMA}.dashboard_products
      WHERE is_active = true
        AND (category IN ('coffee_bean', 'coffee_drip'))
      ORDER BY category, sort_order, product_name
    `);

    // 기간 내 주문 데이터 집계
    let params = [];
    let paramIndex = 1;
    let dateConditions = [];

    if (sdate) {
      dateConditions.push(`DATE(o.ord_time) >= $${paramIndex}`);
      params.push(sdate);
      paramIndex++;
    }
    if (edate) {
      dateConditions.push(`DATE(o.ord_time) <= $${paramIndex}`);
      params.push(edate);
      paramIndex++;
    }

    const dateClause = dateConditions.length > 0 ? 'AND ' + dateConditions.join(' AND ') : '';

    const orderData = await query(`
      SELECT
        vm.product_code,
        SUM(vm.quantity * o.sale_cnt) as total_quantity,
        COUNT(DISTINCT o.uniq) as order_count,
        SUM(CASE WHEN o.shop_cd IN ('A077', '1077') THEN o.pay_amt ELSE o.sales END) as revenue
      FROM ${SCHEMA}.orders o
      JOIN ${SCHEMA}.v_auto_product_mapping vm
        ON o.shop_sale_name = vm.shop_sale_name
        AND COALESCE(o.shop_opt_name, '') = COALESCE(vm.shop_opt_name, '')
      WHERE (vm.product_code LIKE 'COFFEE_%' OR vm.product_code LIKE 'DRIP_%')
        AND o.ord_status NOT IN ('취소완료', '반품완료', '교환완료', '환불')
        ${dateClause}
      GROUP BY vm.product_code
    `, params);

    // 주문 데이터를 Map으로 변환
    const orderMap = new Map();
    orderData.rows.forEach(row => {
      orderMap.set(row.product_code, {
        total_quantity: parseInt(row.total_quantity) || 0,
        order_count: parseInt(row.order_count) || 0,
        revenue: parseFloat(row.revenue) || 0
      });
    });

    // 모든 상품에 주문 데이터 병합 (0건 포함)
    const beans = allProducts.rows
      .filter(p => p.category === 'coffee_bean')
      .map(p => {
        const order = orderMap.get(p.product_code) || { total_quantity: 0, order_count: 0, revenue: 0 };
        return {
          product_code: p.product_code,
          product_name: p.product_name,
          total_grams: order.total_quantity,
          total_kg: (order.total_quantity / 1000).toFixed(2),
          order_count: order.order_count,
          revenue: order.revenue
        };
      })
      .sort((a, b) => b.total_grams - a.total_grams); // 출고량 내림차순

    const drips = allProducts.rows
      .filter(p => p.category === 'coffee_drip')
      .map(p => {
        const order = orderMap.get(p.product_code) || { total_quantity: 0, order_count: 0, revenue: 0 };
        return {
          product_code: p.product_code,
          product_name: p.product_name,
          total_count: order.total_quantity,
          order_count: order.order_count,
          revenue: order.revenue
        };
      })
      .sort((a, b) => b.total_count - a.total_count); // 출고량 내림차순

    res.json({
      beans,
      drips,
      beansTotal: {
        total_grams: beans.reduce((sum, item) => sum + item.total_grams, 0),
        total_kg: (beans.reduce((sum, item) => sum + item.total_grams, 0) / 1000).toFixed(2),
        order_count: beans.reduce((sum, item) => sum + item.order_count, 0),
        revenue: beans.reduce((sum, item) => sum + item.revenue, 0)
      },
      dripsTotal: {
        total_count: drips.reduce((sum, item) => sum + item.total_count, 0),
        order_count: drips.reduce((sum, item) => sum + item.order_count, 0),
        revenue: drips.reduce((sum, item) => sum + item.revenue, 0)
      }
    });
  } catch (error) {
    console.error('Error fetching coffee summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// 커피 일별 출고량 추이
router.get('/stats/coffee-daily', async (req, res) => {
  try {
    const { sdate, edate, type = 'all' } = req.query;

    let productCondition = `(vm.product_code LIKE 'COFFEE_%' OR vm.product_code LIKE 'DRIP_%')`;
    if (type === 'bean') {
      productCondition = `vm.product_code LIKE 'COFFEE_%'`;
    } else if (type === 'drip') {
      productCondition = `vm.product_code LIKE 'DRIP_%'`;
    }

    let conditions = [productCondition];
    let params = [];
    let paramIndex = 1;

    if (sdate) {
      conditions.push(`DATE(o.ord_time) >= $${paramIndex}`);
      params.push(sdate);
      paramIndex++;
    }
    if (edate) {
      conditions.push(`DATE(o.ord_time) <= $${paramIndex}`);
      params.push(edate);
      paramIndex++;
    }

    conditions.push(`o.ord_status NOT IN ('취소완료', '반품완료', '교환완료', '환불')`);

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const result = await query(`
      SELECT
        DATE(o.ord_time) as order_date,
        SUM(CASE WHEN vm.product_code LIKE 'COFFEE_%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as bean_grams,
        SUM(CASE WHEN vm.product_code LIKE 'DRIP_%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as drip_count,
        COUNT(DISTINCT o.uniq) as order_count,
        SUM(CASE WHEN o.shop_cd IN ('A077', '1077') THEN o.pay_amt ELSE o.sales END) as revenue
      FROM ${SCHEMA}.orders o
      JOIN ${SCHEMA}.v_auto_product_mapping vm
        ON o.shop_sale_name = vm.shop_sale_name
        AND COALESCE(o.shop_opt_name, '') = COALESCE(vm.shop_opt_name, '')
      ${whereClause}
      GROUP BY DATE(o.ord_time)
      ORDER BY order_date DESC
      LIMIT 90
    `, params);

    res.json({
      daily: result.rows.map(r => ({
        date: r.order_date,
        bean_grams: parseInt(r.bean_grams) || 0,
        bean_kg: ((parseInt(r.bean_grams) || 0) / 1000).toFixed(2),
        drip_count: parseInt(r.drip_count) || 0,
        order_count: parseInt(r.order_count) || 0,
        revenue: parseFloat(r.revenue) || 0
      }))
    });
  } catch (error) {
    console.error('Error fetching coffee daily stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// 커피 월별 출고량 추이
router.get('/stats/coffee-monthly', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        TO_CHAR(DATE(o.ord_time), 'YYYY-MM') as month,
        SUM(CASE WHEN vm.product_code LIKE 'COFFEE_%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as bean_grams,
        SUM(CASE WHEN vm.product_code LIKE 'DRIP_%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as drip_count,
        COUNT(DISTINCT o.uniq) as order_count,
        SUM(CASE WHEN o.shop_cd IN ('A077', '1077') THEN o.pay_amt ELSE o.sales END) as revenue
      FROM ${SCHEMA}.orders o
      JOIN ${SCHEMA}.v_auto_product_mapping vm
        ON o.shop_sale_name = vm.shop_sale_name
        AND COALESCE(o.shop_opt_name, '') = COALESCE(vm.shop_opt_name, '')
      WHERE (vm.product_code LIKE 'COFFEE_%' OR vm.product_code LIKE 'DRIP_%')
        AND o.ord_status NOT IN ('취소완료', '반품완료', '교환완료', '환불')
      GROUP BY TO_CHAR(DATE(o.ord_time), 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `);

    res.json({
      monthly: result.rows.map(r => ({
        month: r.month,
        bean_grams: parseInt(r.bean_grams) || 0,
        bean_kg: ((parseInt(r.bean_grams) || 0) / 1000).toFixed(2),
        drip_count: parseInt(r.drip_count) || 0,
        order_count: parseInt(r.order_count) || 0,
        revenue: parseFloat(r.revenue) || 0
      }))
    });
  } catch (error) {
    console.error('Error fetching coffee monthly stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 팀키토 출고량 집계 API
// ============================================

// 팀키토 라인별 출고량 요약
router.get('/stats/teamketo-summary', async (req, res) => {
  try {
    const { sdate, edate } = req.query;

    // 먼저 dashboard_products에서 모든 팀키토 상품 목록을 가져옴
    const allProducts = await query(`
      SELECT product_code, product_name, category, sort_order
      FROM ${SCHEMA}.dashboard_products
      WHERE is_active = true
        AND product_code LIKE 'TEAMKETO_%'
      ORDER BY sort_order, product_name
    `);

    // 기간 내 주문 데이터 집계
    let params = [];
    let paramIndex = 1;
    let dateConditions = [];

    if (sdate) {
      dateConditions.push(`DATE(o.ord_time) >= $${paramIndex}`);
      params.push(sdate);
      paramIndex++;
    }
    if (edate) {
      dateConditions.push(`DATE(o.ord_time) <= $${paramIndex}`);
      params.push(edate);
      paramIndex++;
    }

    const dateClause = dateConditions.length > 0 ? 'AND ' + dateConditions.join(' AND ') : '';

    const orderData = await query(`
      SELECT
        vm.product_code,
        SUM(vm.quantity * o.sale_cnt) as total_quantity,
        COUNT(DISTINCT o.uniq) as order_count,
        SUM(CASE WHEN o.shop_cd IN ('A077', '1077') THEN o.pay_amt ELSE o.sales END) as revenue
      FROM ${SCHEMA}.orders o
      JOIN ${SCHEMA}.v_auto_product_mapping vm
        ON o.shop_sale_name = vm.shop_sale_name
        AND COALESCE(o.shop_opt_name, '') = COALESCE(vm.shop_opt_name, '')
      WHERE vm.product_code LIKE 'TEAMKETO_%'
        AND o.ord_status NOT IN ('취소완료', '반품완료', '교환완료', '환불')
        ${dateClause}
      GROUP BY vm.product_code
    `, params);

    // 주문 데이터를 Map으로 변환
    const orderMap = new Map();
    orderData.rows.forEach(row => {
      orderMap.set(row.product_code, {
        total_quantity: parseInt(row.total_quantity) || 0,
        order_count: parseInt(row.order_count) || 0,
        revenue: parseFloat(row.revenue) || 0
      });
    });

    // 라인별 분류 함수
    const getLineCode = (productCode) => {
      if (productCode.startsWith('TEAMKETO_NS')) return 'NS';
      if (productCode.startsWith('TEAMKETO_SA')) return 'SA';
      if (productCode.startsWith('TEAMKETO_SK')) return 'SK';
      if (productCode.startsWith('TEAMKETO_OK')) return 'OK';
      if (productCode.startsWith('TEAMKETO_LF')) return 'LF';
      return 'ETC';
    };

    const lineNames = {
      NS: '무설탕',
      SA: '슬로우 에이징',
      SK: '시그니처 키토',
      OK: '오리지널 키토',
      LF: '저포드맵'
    };

    // 라인별 그룹화
    const lineGroups = { NS: [], SA: [], SK: [], OK: [], LF: [] };

    allProducts.rows.forEach(p => {
      const lineCode = getLineCode(p.product_code);
      const order = orderMap.get(p.product_code) || { total_quantity: 0, order_count: 0, revenue: 0 };
      const item = {
        product_code: p.product_code,
        product_name: p.product_name,
        total_count: order.total_quantity,
        order_count: order.order_count,
        revenue: order.revenue
      };
      if (lineGroups[lineCode]) {
        lineGroups[lineCode].push(item);
      }
    });

    // 라인별 합계 계산
    const calcTotal = (items) => ({
      total_count: items.reduce((sum, i) => sum + i.total_count, 0),
      order_count: items.reduce((sum, i) => sum + i.order_count, 0),
      revenue: items.reduce((sum, i) => sum + i.revenue, 0)
    });

    // 도시락 라인들 (NS 제외)
    const lunchboxLines = ['SA', 'SK', 'OK', 'LF'];
    const lunchboxItems = lunchboxLines.flatMap(code => lineGroups[code]);
    const lunchboxTotal = calcTotal(lunchboxItems);

    // 전체 합계 (NS 포함)
    const allItems = Object.values(lineGroups).flat();
    const grandTotal = calcTotal(allItems);

    res.json({
      lines: {
        noSugar: { name: lineNames.NS, code: 'NS', items: lineGroups.NS.sort((a, b) => b.total_count - a.total_count), total: calcTotal(lineGroups.NS) },
        slowAging: { name: lineNames.SA, code: 'SA', items: lineGroups.SA.sort((a, b) => b.total_count - a.total_count), total: calcTotal(lineGroups.SA) },
        signatureKeto: { name: lineNames.SK, code: 'SK', items: lineGroups.SK.sort((a, b) => b.total_count - a.total_count), total: calcTotal(lineGroups.SK) },
        originalKeto: { name: lineNames.OK, code: 'OK', items: lineGroups.OK.sort((a, b) => b.total_count - a.total_count), total: calcTotal(lineGroups.OK) },
        lowFodmap: { name: lineNames.LF, code: 'LF', items: lineGroups.LF.sort((a, b) => b.total_count - a.total_count), total: calcTotal(lineGroups.LF) }
      },
      lunchboxTotal,
      grandTotal
    });
  } catch (error) {
    console.error('Error fetching teamketo summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// 팀키토 일별 출고량 추이
router.get('/stats/teamketo-daily', async (req, res) => {
  try {
    const { sdate, edate } = req.query;

    let conditions = [`vm.product_code LIKE 'TEAMKETO_%'`];
    let params = [];
    let paramIndex = 1;

    if (sdate) {
      conditions.push(`DATE(o.ord_time) >= $${paramIndex}`);
      params.push(sdate);
      paramIndex++;
    }
    if (edate) {
      conditions.push(`DATE(o.ord_time) <= $${paramIndex}`);
      params.push(edate);
      paramIndex++;
    }

    conditions.push(`o.ord_status NOT IN ('취소완료', '반품완료', '교환완료', '환불')`);

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const result = await query(`
      SELECT
        DATE(o.ord_time) as order_date,
        SUM(CASE WHEN vm.product_code LIKE 'TEAMKETO_NS%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as ns_count,
        SUM(CASE WHEN vm.product_code LIKE 'TEAMKETO_SA%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as sa_count,
        SUM(CASE WHEN vm.product_code LIKE 'TEAMKETO_SK%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as sk_count,
        SUM(CASE WHEN vm.product_code LIKE 'TEAMKETO_OK%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as ok_count,
        SUM(CASE WHEN vm.product_code LIKE 'TEAMKETO_LF%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as lf_count,
        SUM(CASE WHEN vm.product_code LIKE 'TEAMKETO_SA%' OR vm.product_code LIKE 'TEAMKETO_SK%' OR vm.product_code LIKE 'TEAMKETO_OK%' OR vm.product_code LIKE 'TEAMKETO_LF%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as lunchbox_count,
        SUM(vm.quantity * o.sale_cnt) as total_count,
        COUNT(DISTINCT o.uniq) as order_count,
        SUM(CASE WHEN o.shop_cd IN ('A077', '1077') THEN o.pay_amt ELSE o.sales END) as revenue
      FROM ${SCHEMA}.orders o
      JOIN ${SCHEMA}.v_auto_product_mapping vm
        ON o.shop_sale_name = vm.shop_sale_name
        AND COALESCE(o.shop_opt_name, '') = COALESCE(vm.shop_opt_name, '')
      ${whereClause}
      GROUP BY DATE(o.ord_time)
      ORDER BY order_date DESC
      LIMIT 90
    `, params);

    res.json({
      daily: result.rows.map(r => ({
        date: r.order_date,
        ns_count: parseInt(r.ns_count) || 0,
        sa_count: parseInt(r.sa_count) || 0,
        sk_count: parseInt(r.sk_count) || 0,
        ok_count: parseInt(r.ok_count) || 0,
        lf_count: parseInt(r.lf_count) || 0,
        lunchbox_count: parseInt(r.lunchbox_count) || 0,
        total_count: parseInt(r.total_count) || 0,
        order_count: parseInt(r.order_count) || 0,
        revenue: parseFloat(r.revenue) || 0
      }))
    });
  } catch (error) {
    console.error('Error fetching teamketo daily stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// 팀키토 월별 출고량 추이
router.get('/stats/teamketo-monthly', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        TO_CHAR(DATE(o.ord_time), 'YYYY-MM') as month,
        SUM(CASE WHEN vm.product_code LIKE 'TEAMKETO_NS%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as ns_count,
        SUM(CASE WHEN vm.product_code LIKE 'TEAMKETO_SA%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as sa_count,
        SUM(CASE WHEN vm.product_code LIKE 'TEAMKETO_SK%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as sk_count,
        SUM(CASE WHEN vm.product_code LIKE 'TEAMKETO_OK%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as ok_count,
        SUM(CASE WHEN vm.product_code LIKE 'TEAMKETO_LF%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as lf_count,
        SUM(CASE WHEN vm.product_code LIKE 'TEAMKETO_SA%' OR vm.product_code LIKE 'TEAMKETO_SK%' OR vm.product_code LIKE 'TEAMKETO_OK%' OR vm.product_code LIKE 'TEAMKETO_LF%' THEN vm.quantity * o.sale_cnt ELSE 0 END) as lunchbox_count,
        SUM(vm.quantity * o.sale_cnt) as total_count,
        COUNT(DISTINCT o.uniq) as order_count,
        SUM(CASE WHEN o.shop_cd IN ('A077', '1077') THEN o.pay_amt ELSE o.sales END) as revenue
      FROM ${SCHEMA}.orders o
      JOIN ${SCHEMA}.v_auto_product_mapping vm
        ON o.shop_sale_name = vm.shop_sale_name
        AND COALESCE(o.shop_opt_name, '') = COALESCE(vm.shop_opt_name, '')
      WHERE vm.product_code LIKE 'TEAMKETO_%'
        AND o.ord_status NOT IN ('취소완료', '반품완료', '교환완료', '환불')
      GROUP BY TO_CHAR(DATE(o.ord_time), 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `);

    res.json({
      monthly: result.rows.map(r => ({
        month: r.month,
        ns_count: parseInt(r.ns_count) || 0,
        sa_count: parseInt(r.sa_count) || 0,
        sk_count: parseInt(r.sk_count) || 0,
        ok_count: parseInt(r.ok_count) || 0,
        lf_count: parseInt(r.lf_count) || 0,
        lunchbox_count: parseInt(r.lunchbox_count) || 0,
        total_count: parseInt(r.total_count) || 0,
        order_count: parseInt(r.order_count) || 0,
        revenue: parseFloat(r.revenue) || 0
      }))
    });
  } catch (error) {
    console.error('Error fetching teamketo monthly stats:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
