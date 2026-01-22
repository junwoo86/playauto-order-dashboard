/**
 * 누락된 쇼핑몰 동기화 스크립트
 * - orders 테이블에 있지만 shops 테이블에 없는 쇼핑몰을 자동 추가
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

async function syncMissingShopsFromOrders() {
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
      console.log('✓ 누락된 쇼핑몰이 없습니다.');
      return { added: 0, shops: [] };
    }

    console.log(`⚠ ${missingShops.rows.length}개의 누락된 쇼핑몰 발견:`);

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

      console.log(`  → 추가됨: [${shop.shop_cd}] ${shop.shop_name} (${shop.seller_nick || '-'})`);
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

async function main() {
  console.log('='.repeat(60));
  console.log('누락된 쇼핑몰 동기화');
  console.log('='.repeat(60));

  try {
    const result = await syncMissingShopsFromOrders();

    console.log('\n결과:');
    console.log('-'.repeat(60));
    console.log(`  추가된 쇼핑몰: ${result.added}개`);

    // 최종 shops 테이블 확인
    console.log('\n현재 shops 테이블:');
    console.log('-'.repeat(60));
    const shops = await pool.query(`SELECT * FROM ${SCHEMA}.shops ORDER BY shop_cd`);
    for (const shop of shops.rows) {
      console.log(`  [${shop.shop_cd}] ${shop.shop_name} (${shop.seller_nick || '-'})`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('완료');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n에러 발생:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
