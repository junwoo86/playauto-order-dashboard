import pg from 'pg';
const { Pool } = pg;

// PostgreSQL 연결 설정 (연결 안정성 강화)
const pool = new Pool({
  host: process.env.DB_HOST || '34.70.164.113',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'bico0211',
  database: process.env.DB_NAME || 'dashboard',

  // 연결 풀 설정
  max: 10,                          // 최대 연결 수
  min: 2,                           // 최소 연결 유지
  idleTimeoutMillis: 60000,         // 1분 유휴 후 연결 해제
  connectionTimeoutMillis: 10000,   // 연결 타임아웃 10초

  // Keep-Alive 설정 (연결 유지)
  keepAlive: true,
  keepAliveInitialDelayMillis: 30000,  // 30초마다 keep-alive 패킷

  // 연결 재시도
  allowExitOnIdle: false,           // 유휴 시에도 종료하지 않음
});

// Pool 에러 핸들러 - 크래시 방지
pool.on('error', (err, client) => {
  console.error('[DB Pool] Unexpected error on idle client:', err.message);
  // 로그만 남기고 크래시하지 않음 - 다음 요청 시 새 연결 생성됨
});

pool.on('connect', (client) => {
  console.log('[DB Pool] New client connected');
});

pool.on('remove', (client) => {
  console.log('[DB Pool] Client removed from pool');
});

// DB Heartbeat - 5분마다 연결 상태 확인
let heartbeatInterval = null;
function startHeartbeat() {
  if (heartbeatInterval) return;

  heartbeatInterval = setInterval(async () => {
    try {
      await pool.query('SELECT 1');
      console.log('[DB Heartbeat] OK -', new Date().toISOString());
    } catch (err) {
      console.error('[DB Heartbeat] Failed:', err.message);
      // 풀이 자동으로 새 연결 생성 시도
    }
  }, 5 * 60 * 1000); // 5분

  console.log('[DB Heartbeat] Started (interval: 5min)');
}

// 애플리케이션 시작 시 heartbeat 시작
startHeartbeat();

const SCHEMA = 'playauto_platform';

// 쿼리 실행 헬퍼
export async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// getDb - 호환성을 위한 래퍼 (기존 코드와의 호환성)
export function getDb() {
  return {
    // prepare().get() 대체
    prepare: (sql) => ({
      get: async (...params) => {
        const result = await query(sql.replace(/\?/g, (_, i) => `$${params.indexOf(_) + 1}`), params);
        return result.rows[0];
      },
      all: async (...params) => {
        const result = await query(sql.replace(/\?/g, (_, i) => `$${params.indexOf(_) + 1}`), params);
        return result.rows;
      },
      run: async (...params) => {
        const result = await query(sql.replace(/\?/g, (_, i) => `$${params.indexOf(_) + 1}`), params);
        return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
      }
    }),
    exec: async (sql) => {
      await query(sql);
    }
  };
}

// v_auto_product_mapping VIEW는 DB에서 직접 관리합니다.
// 뷰 수정이 필요한 경우 DB에서 직접 ALTER/CREATE OR REPLACE를 실행하세요.
// 코드에서 뷰를 자동으로 수정하는 것은 위험하므로 제거되었습니다.

// VIEW 재생성 함수 (호환성 유지를 위해 no-op으로 남겨둠)
export async function refreshAutoMappingView() {
  console.log('[refreshAutoMappingView] View는 DB에서 직접 관리됩니다. 코드에서 수정하지 않습니다.');
  // 뷰 수정이 필요하면 DB에서 직접 실행하세요.
}

// 데이터베이스 초기화
export async function initDatabase() {
  console.log('[DB Init] Starting database initialization...');
  const client = await pool.connect();
  console.log('[DB Init] Client connected, creating schema...');
  try {
    // 스키마 생성
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    console.log('[DB Init] Schema created');

    // 쇼핑몰 마스터 테이블
    console.log('[DB Init] Creating shops table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.shops (
        shop_cd TEXT PRIMARY KEY,
        shop_name TEXT,
        seller_nick TEXT,
        shop_id TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('[DB Init] Shops table created');

    // 주문 데이터 테이블
    console.log('[DB Init] Creating orders table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.orders (
        uniq TEXT PRIMARY KEY,
        shop_cd TEXT,
        shop_name TEXT,
        seller_nick TEXT,
        shop_sale_name TEXT,
        shop_opt_name TEXT,
        set_name TEXT,
        c_sale_cd TEXT,
        ord_status TEXT,
        sale_cnt INTEGER DEFAULT 0,
        pack_unit INTEGER DEFAULT 0,
        pay_amt INTEGER DEFAULT 0,
        sales INTEGER DEFAULT 0,
        ord_time TIMESTAMP,
        pay_time TIMESTAMP,
        order_name TEXT,
        shop_ord_no TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 동기화 이력 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.sync_history (
        id SERIAL PRIMARY KEY,
        sync_type TEXT,
        sdate TEXT,
        edate TEXT,
        total_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'running',
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        error_message TEXT
      )
    `);

    // 상품명+옵션명 매핑 테이블 (PK: shop_sale_name + shop_opt_name)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.product_name_mappings (
        id SERIAL PRIMARY KEY,
        shop_sale_name TEXT NOT NULL,
        shop_opt_name TEXT DEFAULT '',
        product_code TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        mapping_type TEXT DEFAULT 'manual',
        verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(shop_sale_name, shop_opt_name, product_code)
      )
    `);

    // 대시보드 전용 상품 마스터 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.dashboard_products (
        id SERIAL PRIMARY KEY,
        product_code TEXT UNIQUE NOT NULL,
        product_name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'etc',
        keywords TEXT[] DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // keywords 컬럼이 없으면 추가 (기존 테이블 마이그레이션)
    await client.query(`
      ALTER TABLE ${SCHEMA}.dashboard_products
      ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}'
    `);

    // 초기 상품 데이터 삽입 (없는 경우에만)
    const existingProducts = await client.query(`
      SELECT COUNT(*) as count FROM ${SCHEMA}.dashboard_products
    `);

    if (parseInt(existingProducts.rows[0].count) === 0) {
      // 분석/검사 서비스 (BKG)
      await client.query(`
        INSERT INTO ${SCHEMA}.dashboard_products (product_code, product_name, category, sort_order) VALUES
        ('BKG000001', '음식물 과민증/지연성 분석', 'analysis', 1),
        ('BKG000002', '영양/중금속 분석', 'analysis', 2),
        ('BKG000003', '펫 분석', 'analysis', 3),
        ('BKG000004', '장내세균 분석', 'analysis', 4),
        ('BKG000005', '대사기능 분석', 'analysis', 5),
        ('BKG000006', '스트레스/노화 분석', 'analysis', 6),
        ('BKG000007', '종합 호르몬 분석', 'analysis', 7)
        ON CONFLICT (product_code) DO NOTHING
      `);

      // 건강기능식품 (BHN) - keywords 포함
      await client.query(`
        INSERT INTO ${SCHEMA}.dashboard_products (product_code, product_name, category, sort_order, keywords) VALUES
        ('BHN000001', '바이오밸런스', 'supplement', 101, ARRAY['바이오밸런스', '바이오 밸런스']),
        ('BHN000002', '풍성밸런스', 'supplement', 102, ARRAY['풍성밸런스', '풍성 밸런스']),
        ('BHN000003', '클린밸런스', 'supplement', 103, ARRAY['클린밸런스', '클린 밸런스']),
        ('BHN000004', '뉴로마스터', 'supplement', 104, ARRAY['뉴로마스터']),
        ('BHN000005', '키네코어', 'supplement', 105, ARRAY['키네코어']),
        ('BHN000006', '다래케어', 'supplement', 106, ARRAY['다래케어']),
        ('BHN000007', '영데이즈', 'supplement', 107, ARRAY['영데이즈']),
        ('BHN000008', '선화이버', 'supplement', 108, ARRAY['선화이버', '썬화이버']),
        ('BHN000009', '당당케어', 'supplement', 109, ARRAY['당당케어']),
        ('BHN000098', '메타드림', 'supplement', 198, ARRAY['메타드림']),
        ('BHN000099', '리셋데이', 'supplement', 199, ARRAY['리셋데이'])
        ON CONFLICT (product_code) DO NOTHING
      `);

      console.log('Initial dashboard products inserted');
    }

    // 기존 데이터에 keywords 업데이트 (매번 실행하여 빈 키워드 채움)
    await client.query(`
      UPDATE ${SCHEMA}.dashboard_products SET keywords = ARRAY['바이오밸런스', '바이오 밸런스'] WHERE product_code = 'BHN000001' AND (keywords IS NULL OR keywords = '{}');
      UPDATE ${SCHEMA}.dashboard_products SET keywords = ARRAY['풍성밸런스', '풍성 밸런스'] WHERE product_code = 'BHN000002' AND (keywords IS NULL OR keywords = '{}');
      UPDATE ${SCHEMA}.dashboard_products SET keywords = ARRAY['클린밸런스', '클린 밸런스'] WHERE product_code = 'BHN000003' AND (keywords IS NULL OR keywords = '{}');
      UPDATE ${SCHEMA}.dashboard_products SET keywords = ARRAY['뉴로마스터'] WHERE product_code = 'BHN000004' AND (keywords IS NULL OR keywords = '{}');
      UPDATE ${SCHEMA}.dashboard_products SET keywords = ARRAY['키네코어'] WHERE product_code = 'BHN000005' AND (keywords IS NULL OR keywords = '{}');
      UPDATE ${SCHEMA}.dashboard_products SET keywords = ARRAY['다래케어'] WHERE product_code = 'BHN000006' AND (keywords IS NULL OR keywords = '{}');
      UPDATE ${SCHEMA}.dashboard_products SET keywords = ARRAY['영데이즈'] WHERE product_code = 'BHN000007' AND (keywords IS NULL OR keywords = '{}');
      UPDATE ${SCHEMA}.dashboard_products SET keywords = ARRAY['선화이버', '썬화이버'] WHERE product_code = 'BHN000008' AND (keywords IS NULL OR keywords = '{}');
      UPDATE ${SCHEMA}.dashboard_products SET keywords = ARRAY['당당케어'] WHERE product_code = 'BHN000009' AND (keywords IS NULL OR keywords = '{}');
      UPDATE ${SCHEMA}.dashboard_products SET keywords = ARRAY['메타드림'] WHERE product_code = 'BHN000098' AND (keywords IS NULL OR keywords = '{}');
      UPDATE ${SCHEMA}.dashboard_products SET keywords = ARRAY['리셋데이'] WHERE product_code = 'BHN000099' AND (keywords IS NULL OR keywords = '{}');
    `);

    // 인플루언서 공구 일정 관리 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.influencer_campaigns (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        influencer_name TEXT,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        expected_revenue BIGINT DEFAULT 0,
        actual_revenue BIGINT DEFAULT 0,
        status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // manual_actual_revenue 컬럼 추가 (수기 입력 실제 공구 매출)
    await client.query(`
      ALTER TABLE ${SCHEMA}.influencer_campaigns
      ADD COLUMN IF NOT EXISTS manual_actual_revenue BIGINT DEFAULT NULL
    `);

    // 인덱스 추가 (날짜 조회 최적화)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON ${SCHEMA}.influencer_campaigns(start_date, end_date);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_campaigns_status ON ${SCHEMA}.influencer_campaigns(status);
    `);

    // 공구별 취급 상품 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.campaign_products (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES ${SCHEMA}.influencer_campaigns(id) ON DELETE CASCADE,
        product_code TEXT NOT NULL,
        expected_quantity INTEGER DEFAULT 0,
        actual_quantity INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(campaign_id, product_code)
      )
    `);

    // 인덱스 추가
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_products_campaign ON ${SCHEMA}.campaign_products(campaign_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_campaign_products_product ON ${SCHEMA}.campaign_products(product_code);
    `);

    // ============================================
    // 뷰 테이블은 DB에서 직접 관리 (코드에서 수정하지 않음)
    // ============================================
    // - v_auto_product_mapping: 상품 매핑 뷰
    // - v_product_shipment_stats: 상품별 출고 통계 뷰
    // - v_product_monthly_trend: 상품별 월간 추이 뷰
    // 뷰 수정이 필요한 경우 DB에서 직접 ALTER/CREATE OR REPLACE를 실행하세요.
    console.log('[DB Init] 뷰 테이블(v_auto_product_mapping, v_product_shipment_stats, v_product_monthly_trend)은 DB에서 직접 관리됩니다.');

    // 인덱스 생성
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_shop_cd ON ${SCHEMA}.orders(shop_cd);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_ord_time ON ${SCHEMA}.orders(ord_time);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_shop_sale_name ON ${SCHEMA}.orders(shop_sale_name);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_ord_status ON ${SCHEMA}.orders(ord_status);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_product_name_mappings_sale_name ON ${SCHEMA}.product_name_mappings(shop_sale_name);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_product_name_mappings_product_code ON ${SCHEMA}.product_name_mappings(product_code);
    `);

    console.log('PostgreSQL database tables created successfully');
    console.log(`Schema: ${SCHEMA}`);
  } finally {
    client.release();
  }
}

// 쇼핑몰 목록 저장
export async function saveShops(shops) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const shop of shops) {
      await client.query(`
        INSERT INTO ${SCHEMA}.shops (shop_cd, shop_name, seller_nick, shop_id, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (shop_cd) DO UPDATE SET
          shop_name = EXCLUDED.shop_name,
          seller_nick = EXCLUDED.seller_nick,
          shop_id = EXCLUDED.shop_id,
          updated_at = NOW()
      `, [shop.shop_cd, shop.shop_name, shop.seller_nick, shop.shop_id]);
    }

    await client.query('COMMIT');
    return shops.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// 주문 데이터 저장 (upsert)
export async function saveOrders(orders) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const order of orders) {
      await client.query(`
        INSERT INTO ${SCHEMA}.orders (
          uniq, shop_cd, shop_name, seller_nick, shop_sale_name, shop_opt_name,
          set_name, c_sale_cd, ord_status, sale_cnt, pack_unit, pay_amt, sales,
          ord_time, pay_time, order_name, shop_ord_no, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
        ON CONFLICT (uniq) DO UPDATE SET
          shop_cd = EXCLUDED.shop_cd,
          shop_name = EXCLUDED.shop_name,
          seller_nick = EXCLUDED.seller_nick,
          shop_sale_name = EXCLUDED.shop_sale_name,
          shop_opt_name = EXCLUDED.shop_opt_name,
          set_name = EXCLUDED.set_name,
          c_sale_cd = EXCLUDED.c_sale_cd,
          ord_status = EXCLUDED.ord_status,
          sale_cnt = EXCLUDED.sale_cnt,
          pack_unit = EXCLUDED.pack_unit,
          pay_amt = EXCLUDED.pay_amt,
          sales = EXCLUDED.sales,
          ord_time = EXCLUDED.ord_time,
          pay_time = EXCLUDED.pay_time,
          order_name = EXCLUDED.order_name,
          shop_ord_no = EXCLUDED.shop_ord_no,
          created_at = NOW()
      `, [
        order.uniq,
        order.shop_cd,
        order.shop_name,
        order.seller_nick,
        order.shop_sale_name,
        order.shop_opt_name,
        order.set_name,
        order.c_sale_cd,
        order.ord_status,
        order.sale_cnt || 0,
        order.pack_unit || 0,
        order.pay_amt || 0,
        order.sales || 0,
        order.ord_time,
        order.pay_time,
        order.order_name,
        order.shop_ord_no
      ]);
    }

    await client.query('COMMIT');
    return orders.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// 주문 데이터에서 누락된 쇼핑몰을 shops 테이블에 자동 추가
export async function syncMissingShopsFromOrders() {
  const client = await pool.connect();
  try {
    // orders에는 있지만 shops에는 없는 shop_cd 찾기
    const missingShops = await client.query(`
      SELECT DISTINCT o.shop_cd, o.shop_name, o.seller_nick
      FROM ${SCHEMA}.orders o
      LEFT JOIN ${SCHEMA}.shops s ON o.shop_cd = s.shop_cd
      WHERE s.shop_cd IS NULL AND o.shop_cd IS NOT NULL
    `);

    if (missingShops.rows.length === 0) {
      return { added: 0, shops: [] };
    }

    console.log(`[syncMissingShops] ${missingShops.rows.length}개의 누락된 쇼핑몰 발견`);

    await client.query('BEGIN');

    const addedShops = [];
    for (const shop of missingShops.rows) {
      await client.query(`
        INSERT INTO ${SCHEMA}.shops (shop_cd, shop_name, seller_nick, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (shop_cd) DO UPDATE SET
          shop_name = EXCLUDED.shop_name,
          seller_nick = EXCLUDED.seller_nick,
          updated_at = NOW()
      `, [shop.shop_cd, shop.shop_name, shop.seller_nick]);

      addedShops.push({
        shop_cd: shop.shop_cd,
        shop_name: shop.shop_name,
        seller_nick: shop.seller_nick
      });

      console.log(`  → 추가됨: [${shop.shop_cd}] ${shop.shop_name}`);
    }

    await client.query('COMMIT');

    return { added: addedShops.length, shops: addedShops };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// 동기화 이력 시작
export async function startSyncHistory(syncType, sdate, edate) {
  const result = await query(`
    INSERT INTO ${SCHEMA}.sync_history (sync_type, sdate, edate, status, started_at)
    VALUES ($1, $2, $3, 'running', NOW())
    RETURNING id
  `, [syncType, sdate, edate]);
  return result.rows[0].id;
}

// 동기화 이력 완료
export async function completeSyncHistory(id, totalCount, status = 'completed', errorMessage = null) {
  await query(`
    UPDATE ${SCHEMA}.sync_history
    SET total_count = $1, status = $2, completed_at = NOW(), error_message = $3
    WHERE id = $4
  `, [totalCount, status, errorMessage, id]);
}

// 마지막 동기화 정보 조회
export async function getLastSync() {
  const result = await query(`
    SELECT * FROM ${SCHEMA}.sync_history
    WHERE status = 'completed'
    ORDER BY completed_at DESC
    LIMIT 1
  `);
  return result.rows[0];
}

// 현재 진행 중인 동기화 조회
export async function getRunningSyncHistory() {
  const result = await query(`
    SELECT * FROM ${SCHEMA}.sync_history
    WHERE status = 'running'
    ORDER BY started_at DESC
    LIMIT 1
  `);
  return result.rows[0];
}

// 스키마 이름 export
export { SCHEMA };

export default {
  query,
  getDb,
  initDatabase,
  saveShops,
  saveOrders,
  syncMissingShopsFromOrders,
  refreshAutoMappingView,
  SCHEMA
};
