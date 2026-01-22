/**
 * 쇼핑몰별 주문 현황 확인 스크립트
 * - DB에 저장된 각 쇼핑몰별 주문 수 확인
 * - 특정 쇼핑몰의 주문이 누락되었는지 확인
 */

import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

dotenv.config({ path: '../../.env' });

const pool = new Pool({
  host: process.env.DB_HOST || '15.164.112.237',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'bico0211',
  database: process.env.DB_NAME || 'dashboard',
});

const SCHEMA = 'playauto_platform';

async function main() {
  console.log('='.repeat(70));
  console.log('쇼핑몰별 주문 현황');
  console.log('='.repeat(70));

  try {
    // 1. DB에 저장된 쇼핑몰 목록
    console.log('\n[1] DB shops 테이블 현황:');
    console.log('-'.repeat(70));
    const shops = await pool.query(`
      SELECT shop_cd, shop_name, seller_nick, updated_at
      FROM ${SCHEMA}.shops
      ORDER BY shop_cd
    `);
    for (const shop of shops.rows) {
      console.log(`    [${shop.shop_cd}] ${shop.shop_name} (${shop.seller_nick || '-'})`);
    }

    // 2. 쇼핑몰별 주문 수 집계
    console.log('\n[2] 쇼핑몰별 주문 수 (orders 테이블):');
    console.log('-'.repeat(70));
    const orderStats = await pool.query(`
      SELECT
        shop_cd,
        shop_name,
        COUNT(*) as order_count,
        SUM(sales) as total_sales,
        MIN(ord_time) as first_order,
        MAX(ord_time) as last_order
      FROM ${SCHEMA}.orders
      GROUP BY shop_cd, shop_name
      ORDER BY order_count DESC
    `);

    console.log('    shop_cd     | shop_name               | 주문수    | 매출           | 기간');
    console.log('    ' + '-'.repeat(66));

    for (const stat of orderStats.rows) {
      const shopCd = (stat.shop_cd || '').padEnd(11);
      const shopName = (stat.shop_name || '').substring(0, 22).padEnd(22);
      const orderCount = String(stat.order_count).padStart(6);
      const totalSales = (parseInt(stat.total_sales) || 0).toLocaleString().padStart(14);
      const firstOrder = stat.first_order ? new Date(stat.first_order).toISOString().split('T')[0] : '-';
      const lastOrder = stat.last_order ? new Date(stat.last_order).toISOString().split('T')[0] : '-';
      console.log(`    ${shopCd} | ${shopName} | ${orderCount} | ${totalSales} | ${firstOrder} ~ ${lastOrder}`);
    }

    // 3. DB에 없는 쇼핑몰 (shops에는 있지만 orders에는 없는 경우)
    console.log('\n[3] 주문이 없는 쇼핑몰 (shops 테이블에만 존재):');
    console.log('-'.repeat(70));
    const noOrderShops = await pool.query(`
      SELECT s.shop_cd, s.shop_name, s.seller_nick
      FROM ${SCHEMA}.shops s
      LEFT JOIN ${SCHEMA}.orders o ON s.shop_cd = o.shop_cd
      WHERE o.shop_cd IS NULL
    `);

    if (noOrderShops.rows.length === 0) {
      console.log('    ✓ 모든 쇼핑몰에 주문이 있습니다.');
    } else {
      for (const shop of noOrderShops.rows) {
        console.log(`    ⚠ [${shop.shop_cd}] ${shop.shop_name} - 주문 없음`);
      }
    }

    // 4. orders에는 있지만 shops에는 없는 shop_cd
    console.log('\n[4] shops 테이블에 없는 쇼핑몰 코드 (orders 테이블에만 존재):');
    console.log('-'.repeat(70));
    const unknownShops = await pool.query(`
      SELECT DISTINCT o.shop_cd, o.shop_name, COUNT(*) as order_count
      FROM ${SCHEMA}.orders o
      LEFT JOIN ${SCHEMA}.shops s ON o.shop_cd = s.shop_cd
      WHERE s.shop_cd IS NULL
      GROUP BY o.shop_cd, o.shop_name
    `);

    if (unknownShops.rows.length === 0) {
      console.log('    ✓ 모든 주문의 쇼핑몰이 shops 테이블에 등록되어 있습니다.');
    } else {
      console.log('    ⚠ 다음 쇼핑몰은 shops 테이블에 등록되어 있지 않습니다:');
      for (const shop of unknownShops.rows) {
        console.log(`       [${shop.shop_cd}] ${shop.shop_name} - ${shop.order_count}건`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('완료');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n에러 발생:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
