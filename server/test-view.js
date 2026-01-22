import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: '15.164.112.237',
  port: 5432,
  user: 'postgres',
  password: 'bico0211',
  database: 'dashboard',
  connectionTimeoutMillis: 10000,
});

async function testView() {
  console.log('Connecting to database...');
  const client = await pool.connect();
  console.log('Connected!');

  try {
    // Test different regex patterns
    console.log('Testing regex patterns...\n');

    // Current pattern (problematic)
    const pattern1 = '드립백|드립 |^드립';
    console.log('Pattern 1:', pattern1);
    console.log('  핸드드립 분쇄:', (await client.query(`SELECT '핸드드립 분쇄' ~* '${pattern1}'`)).rows[0]['?column?']);
    console.log('  드립백 세트:', (await client.query(`SELECT '드립백 세트' ~* '${pattern1}'`)).rows[0]['?column?']);
    console.log('  드립 커피:', (await client.query(`SELECT '드립 커피' ~* '${pattern1}'`)).rows[0]['?column?']);
    console.log('  과테말라 SHB:', (await client.query(`SELECT '과테말라 SHB' ~* '${pattern1}'`)).rows[0]['?column?']);

    // Better pattern: 드립백 or starts with 드립
    const pattern2 = '드립백|^드립';
    console.log('\nPattern 2:', pattern2);
    console.log('  핸드드립 분쇄:', (await client.query(`SELECT '핸드드립 분쇄' ~* '${pattern2}'`)).rows[0]['?column?']);
    console.log('  드립백 세트:', (await client.query(`SELECT '드립백 세트' ~* '${pattern2}'`)).rows[0]['?column?']);
    console.log('  드립 커피:', (await client.query(`SELECT '드립 커피' ~* '${pattern2}'`)).rows[0]['?column?']);
    console.log('  과테말라 SHB:', (await client.query(`SELECT '과테말라 SHB' ~* '${pattern2}'`)).rows[0]['?column?']);
    console.log('  분쇄도:일반 (핸드드립) 분쇄:', (await client.query(`SELECT '분쇄도:일반 (핸드드립) 분쇄' ~* '${pattern2}'`)).rows[0]['?column?']);

    console.log('\nRegex tests passed!');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

testView();
