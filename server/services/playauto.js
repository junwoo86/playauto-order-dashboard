import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const API_KEY = process.env.PLAYAUTO_API_KEY;
const EMAIL = process.env.PLAYAUTO_EMAIL;
const PASSWORD = process.env.PLAYAUTO_PASSWORD;
const BASE_URL = process.env.PLAYAUTO_BASE_URL || 'https://openapi.playauto.io/api';

let cachedToken = null;
let tokenExpiry = null;

// 토큰 발급
export async function getToken() {
  // 캐시된 토큰이 있고 만료되지 않았으면 재사용
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const response = await fetch(`${BASE_URL}/auth`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD
    })
  });

  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = data[0].token;
  // 토큰은 24시간 유효, 23시간 후 갱신하도록 설정
  tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);

  return cachedToken;
}

// 연동된 쇼핑몰 목록 조회
export async function getShops() {
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

// 주문 조회 (단일 요청)
export async function fetchOrders(sdate, edate, options = {}) {
  const token = await getToken();

  const body = {
    date_type: options.date_type || 'wdate',
    sdate,
    edate,
    start: options.start || 0,
    length: options.length || 3000
  };

  // ord_status는 필요할 때만 추가
  if (options.ord_status) {
    body.ord_status = options.ord_status;
  }

  console.log('API Request:', JSON.stringify(body));

  if (options.shop_cd) {
    body.shop_cd = options.shop_cd;
  }

  const response = await fetch(`${BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Failed to get orders: ${response.status}`);
  }

  const data = await response.json();
  console.log('API Response keys:', Object.keys(data));
  return data;
}

// 전체 주문 조회 (페이징 처리)
export async function getAllOrders(sdate, edate, options = {}, onProgress = null) {
  let allOrders = [];
  let start = 0;
  const length = 3000;
  let totalRecords = 0;

  while (true) {
    const data = await fetchOrders(sdate, edate, {
      ...options,
      start,
      length
    });

    allOrders = allOrders.concat(data.results);
    totalRecords = data.recordsTotal;

    if (onProgress) {
      onProgress({
        fetched: allOrders.length,
        total: totalRecords,
        percentage: Math.round((allOrders.length / totalRecords) * 100)
      });
    }

    console.log(`Fetched ${allOrders.length}/${totalRecords} orders`);

    // 더 이상 데이터가 없으면 종료
    if (data.results.length < length) {
      break;
    }

    start += length;

    // API 부하 방지를 위한 딜레이
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return {
    orders: allOrders,
    total: totalRecords
  };
}

export default {
  getToken,
  getShops,
  fetchOrders,
  getAllOrders
};
