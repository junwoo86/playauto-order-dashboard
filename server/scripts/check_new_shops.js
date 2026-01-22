/**
 * 신규 쇼핑몰 확인 스크립트
 * - PlayAuto API에서 현재 쇼핑몰 목록 조회
 * - DB의 shops 테이블과 비교
 * - 새로운 쇼핑몰이 있으면 출력
 */

import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

dotenv.config({ path: '../../.env' });

const API_KEY = process.env.PLAYAUTO_API_KEY;
const EMAIL = process.env.PLAYAUTO_EMAIL;
const PASSWORD = process.env.PLAYAUTO_PASSWORD;
const BASE_URL = process.env.PLAYAUTO_BASE_URL || 'https://openapi.playauto.io/api';

const pool = new Pool({
  host: process.env.DB_HOST || '15.164.112.237',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'bico0211',
  database: process.env.DB_NAME || 'dashboard',
});

const SCHEMA = 'playauto_platform';

// PlayAuto 토큰 발급
async function getToken() {
  const response = await fetch(`${BASE_URL}/auth`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });

  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.status}`);
  }

  const data = await response.json();
  return data[0].token;
}

// PlayAuto에서 쇼핑몰 목록 조회
async function getShopsFromAPI() {
  const token = await getToken();

  const response = await fetch(`${BASE_URL}/shops?used=true`, {
    method: 'GET',
    headers: {
      'x-api-key': API_KEY,
      'Authorization': `Token ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get shops: ${response.status}`);
  }

  return await response.json();
}

// DB에서 쇼핑몰 목록 조회
async function getShopsFromDB() {
  const result = await pool.query(`SELECT * FROM ${SCHEMA}.shops ORDER BY shop_cd`);
  return result.rows;
}

// 쇼핑몰 DB에 저장/업데이트
async function saveShopsToDB(shops) {
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

// 메인 실행
async function main() {
  console.log('='.repeat(60));
  console.log('신규 쇼핑몰 확인 스크립트');
  console.log('='.repeat(60));

  try {
    // 1. PlayAuto API에서 쇼핑몰 목록 조회
    console.log('\n[1] PlayAuto API에서 쇼핑몰 목록 조회 중...');
    const apiShops = await getShopsFromAPI();
    console.log(`    → API에서 ${apiShops.length}개 쇼핑몰 조회됨`);

    // 2. DB에서 쇼핑몰 목록 조회
    console.log('\n[2] DB에서 쇼핑몰 목록 조회 중...');
    const dbShops = await getShopsFromDB();
    console.log(`    → DB에 ${dbShops.length}개 쇼핑몰 저장됨`);

    // 3. 비교
    const dbShopCodes = new Set(dbShops.map(s => s.shop_cd));
    const newShops = apiShops.filter(s => !dbShopCodes.has(s.shop_cd));

    console.log('\n[3] 비교 결과:');
    console.log('-'.repeat(60));

    if (newShops.length === 0) {
      console.log('    ✓ 신규 쇼핑몰이 없습니다. 모든 쇼핑몰이 동기화되어 있습니다.');
    } else {
      console.log(`    ⚠ ${newShops.length}개의 신규 쇼핑몰 발견!`);
      console.log('');
      console.log('    신규 쇼핑몰 목록:');
      for (const shop of newShops) {
        console.log(`    - [${shop.shop_cd}] ${shop.shop_name} (${shop.seller_nick || '-'})`);
      }

      // 4. 신규 쇼핑몰 DB에 추가
      console.log('\n[4] 신규 쇼핑몰을 DB에 추가 중...');
      await saveShopsToDB(newShops);
      console.log(`    ✓ ${newShops.length}개 쇼핑몰 추가 완료`);
    }

    // 5. 전체 쇼핑몰 목록 출력
    console.log('\n[5] 현재 전체 쇼핑몰 목록 (API 기준):');
    console.log('-'.repeat(60));
    console.log('    shop_cd     | shop_name               | seller_nick');
    console.log('    ' + '-'.repeat(56));
    for (const shop of apiShops) {
      const shopCd = (shop.shop_cd || '').padEnd(11);
      const shopName = (shop.shop_name || '').substring(0, 22).padEnd(22);
      const sellerNick = (shop.seller_nick || '-').substring(0, 20);
      console.log(`    ${shopCd} | ${shopName} | ${sellerNick}`);
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
