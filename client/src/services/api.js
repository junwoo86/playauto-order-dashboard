import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000 // 동기화 시 시간이 오래 걸릴 수 있음
});

// 쇼핑몰 관련
export const getShops = () => api.get('/shops').then(res => res.data);
export const refreshShops = () => api.post('/shops/refresh').then(res => res.data);

// 주문 관련
export const getOrders = (params) => api.get('/orders', { params }).then(res => res.data);
export const getOrder = (uniq) => api.get(`/orders/${uniq}`).then(res => res.data);

// 동기화 관련
export const getSyncStatus = () => api.get('/sync/status').then(res => res.data);
export const startSync = (sdate, edate) =>
  api.post('/sync', { sdate, edate, syncType: 'full' }).then(res => res.data);
export const startIncrementalSync = () =>
  api.post('/sync/incremental').then(res => res.data);
export const startRecentSync = (weeks = 3) =>
  api.post('/sync/recent', { weeks }).then(res => res.data);
export const startYearlySync = (sdate, edate) =>
  api.post('/sync/yearly', { sdate, edate }).then(res => res.data);
export const startWeeklySync = (sdate, edate, months) =>
  api.post('/sync/weekly', { sdate, edate, months }).then(res => res.data);
export const getSyncHistory = (limit = 10) =>
  api.get('/sync/history', { params: { limit } }).then(res => res.data);

// 스케줄러 관련
export const getSchedulerStatus = () =>
  api.get('/sync/scheduler').then(res => res.data);
export const startSmartSync = () =>
  api.post('/sync/smart').then(res => res.data);
export const startValidationSync = () =>
  api.post('/sync/validation').then(res => res.data);

// 통계 관련
export const getSummary = (params) => api.get('/stats/summary', { params }).then(res => res.data);
export const getStoreStats = (params) => api.get('/stats/by-store', { params }).then(res => res.data);
export const getProductStats = (params) => api.get('/stats/by-product', { params }).then(res => res.data);
export const getTrend = (params) => api.get('/stats/trend', { params }).then(res => res.data);
export const getForecast = (params) => api.get('/stats/forecast', { params }).then(res => res.data);

// 리포트 다운로드
export const downloadExcel = (params) => {
  const queryString = new URLSearchParams(params).toString();
  window.location.href = `/api/reports/excel?${queryString}`;
};

export const downloadCSV = (params) => {
  const queryString = new URLSearchParams(params).toString();
  window.location.href = `/api/reports/csv?${queryString}`;
};

// 매핑 관련
export const getUnmappedItems = (params) =>
  api.get('/mappings/auto/unmapped', { params }).then(res => res.data);
export const getAutoMappings = (params) =>
  api.get('/mappings/auto', { params }).then(res => res.data);
export const getProductList = () =>
  api.get('/mappings/product-list').then(res => res.data);
export const getMappingStats = (params) =>
  api.get('/mappings/stats/summary', { params }).then(res => res.data);
export const getSkuSales = (params) =>
  api.get('/mappings/stats/sku-sales', { params }).then(res => res.data);
export const getSkuDailyTrend = (params) =>
  api.get('/mappings/stats/daily', { params }).then(res => res.data);
export const createManualMapping = (data) =>
  api.post('/mappings/manual', data).then(res => res.data);
export const deleteManualMapping = (data) =>
  api.delete('/mappings/manual', { data }).then(res => res.data);

// 대시보드 상품 관리 (CRUD)
export const getDashboardProducts = (params) =>
  api.get('/mappings/dashboard-products', { params }).then(res => res.data);
export const createDashboardProduct = (data) =>
  api.post('/mappings/dashboard-products', data).then(res => res.data);
export const updateDashboardProduct = (id, data) =>
  api.put(`/mappings/dashboard-products/${id}`, data).then(res => res.data);
export const deleteDashboardProduct = (id, permanent = false) =>
  api.delete(`/mappings/dashboard-products/${id}`, { params: { permanent } }).then(res => res.data);

// 인플루언서 공구 관리
export const getCampaigns = (params) =>
  api.get('/campaigns', { params }).then(res => res.data);
export const getCampaign = (id) =>
  api.get(`/campaigns/${id}`).then(res => res.data);
export const createCampaign = (data) =>
  api.post('/campaigns', data).then(res => res.data);
export const updateCampaign = (id, data) =>
  api.put(`/campaigns/${id}`, data).then(res => res.data);
export const deleteCampaign = (id) =>
  api.delete(`/campaigns/${id}`).then(res => res.data);
export const calculateCampaignActual = (id) =>
  api.post(`/campaigns/${id}/calculate-actual`).then(res => res.data);
export const getCampaignForecastData = () =>
  api.get('/campaigns/forecast/data').then(res => res.data);

// 커피 출고량 관련
export const getCoffeeSummary = (params) =>
  api.get('/mappings/stats/coffee-summary', { params }).then(res => res.data);
export const getCoffeeDaily = (params) =>
  api.get('/mappings/stats/coffee-daily', { params }).then(res => res.data);
export const getCoffeeMonthly = (params) =>
  api.get('/mappings/stats/coffee-monthly', { params }).then(res => res.data);

// 팀키토 출고량 관련
export const getTeamketoSummary = (params) =>
  api.get('/mappings/stats/teamketo-summary', { params }).then(res => res.data);
export const getTeamketoDaily = (params) =>
  api.get('/mappings/stats/teamketo-daily', { params }).then(res => res.data);
export const getTeamketoMonthly = (params) =>
  api.get('/mappings/stats/teamketo-monthly', { params }).then(res => res.data);

export default api;
