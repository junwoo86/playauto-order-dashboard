import { Router } from 'express';
import {
  query,
  SCHEMA,
  saveOrders,
  saveShops,
  startSyncHistory,
  completeSyncHistory,
  getLastSync,
  getRunningSyncHistory,
  syncMissingShopsFromOrders
} from '../services/database.js';
import { getAllOrders, getShops } from '../services/playauto.js';
import {
  getSchedulerStatus,
  triggerSmartSync,
  triggerFullValidation
} from '../services/scheduler.js';

const router = Router();

// 현재 동기화 상태 조회
router.get('/status', async (req, res) => {
  try {
    const running = await getRunningSyncHistory();
    const lastSync = await getLastSync();

    const orderCountResult = await query(`SELECT COUNT(*) as count FROM ${SCHEMA}.orders`);
    const dateRangeResult = await query(`
      SELECT MIN(ord_time) as "minDate", MAX(ord_time) as "maxDate"
      FROM ${SCHEMA}.orders
    `);

    res.json({
      isRunning: !!running,
      running,
      lastSync,
      stats: {
        totalOrders: parseInt(orderCountResult.rows[0].count),
        dateRange: {
          from: dateRangeResult.rows[0].minDate,
          to: dateRangeResult.rows[0].maxDate
        }
      }
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({ error: error.message });
  }
});

// 동기화 실행
router.post('/', async (req, res) => {
  try {
    // 이미 실행 중인 동기화가 있는지 확인
    const running = await getRunningSyncHistory();
    if (running) {
      return res.status(409).json({
        error: '이미 동기화가 진행 중입니다.',
        running
      });
    }

    const { sdate, edate, syncType = 'full' } = req.body;

    // 날짜 검증
    if (!sdate || !edate) {
      return res.status(400).json({ error: 'sdate와 edate는 필수입니다.' });
    }

    // 동기화 시작
    const syncId = await startSyncHistory(syncType, sdate, edate);

    // 비동기로 동기화 실행 (응답은 먼저 반환)
    res.json({
      success: true,
      message: '동기화가 시작되었습니다.',
      syncId,
      sdate,
      edate
    });

    // 백그라운드에서 동기화 실행
    performSync(syncId, sdate, edate).catch(async error => {
      console.error('Sync failed:', error);
      await completeSyncHistory(syncId, 0, 'failed', error.message);
    });

  } catch (error) {
    console.error('Error starting sync:', error);
    res.status(500).json({ error: error.message });
  }
});

// 월별 분할 동기화 (1년 데이터를 월별로 나눠서 동기화)
router.post('/yearly', async (req, res) => {
  try {
    const running = await getRunningSyncHistory();
    if (running) {
      return res.status(409).json({
        error: '이미 동기화가 진행 중입니다.',
        running
      });
    }

    const today = new Date();
    const yearAgo = new Date(today);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);

    const sdate = req.body.sdate || yearAgo.toISOString().split('T')[0];
    const edate = req.body.edate || today.toISOString().split('T')[0];

    const syncId = await startSyncHistory('yearly', sdate, edate);

    res.json({
      success: true,
      message: '1년 월별 분할 동기화가 시작되었습니다.',
      syncId,
      sdate,
      edate
    });

    // 백그라운드에서 월별 분할 동기화 실행
    performMonthlySplit(syncId, sdate, edate).catch(async error => {
      console.error('Yearly sync failed:', error);
      await completeSyncHistory(syncId, 0, 'failed', error.message);
    });

  } catch (error) {
    console.error('Error starting yearly sync:', error);
    res.status(500).json({ error: error.message });
  }
});

// 월별 분할 동기화 수행 함수
async function performMonthlySplit(syncId, sdate, edate) {
  console.log(`Starting monthly split sync [${syncId}]: ${sdate} ~ ${edate}`);

  try {
    // 1. 쇼핑몰 목록 동기화
    console.log('Syncing shops...');
    const shops = await getShops();
    await saveShops(shops);
    console.log(`Synced ${shops.length} shops`);

    // 2. 월별로 기간 분할
    const months = getMonthRanges(sdate, edate);
    console.log(`Split into ${months.length} monthly chunks`);

    let totalOrders = 0;
    let successCount = 0;
    let failCount = 0;

    // 3. 각 월별로 순차 동기화
    for (let i = 0; i < months.length; i++) {
      const { start, end } = months[i];
      console.log(`\n[${i + 1}/${months.length}] Syncing: ${start} ~ ${end}`);

      try {
        const { orders, total } = await getAllOrders(start, end, {}, (progress) => {
          console.log(`  Progress: ${progress.fetched}/${progress.total} (${progress.percentage}%)`);
        });

        if (orders.length > 0) {
          await saveOrders(orders);
          totalOrders += orders.length;
          console.log(`  Saved ${orders.length} orders (total: ${totalOrders})`);
        } else {
          console.log(`  No orders in this period`);
        }
        successCount++;

        // API 부하 방지를 위한 딜레이 (월 사이)
        if (i < months.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (monthError) {
        console.error(`  Error syncing ${start} ~ ${end}:`, monthError.message);
        failCount++;
        // 실패해도 다음 월 계속 진행
      }
    }

    // 4. 주문 데이터에서 발견된 신규 쇼핑몰 자동 추가
    console.log('Checking for new shops from orders...');
    const missingResult = await syncMissingShopsFromOrders();
    if (missingResult.added > 0) {
      console.log(`Added ${missingResult.added} new shops from order data`);
    }

    // 5. 완료 처리
    const status = failCount === 0 ? 'completed' :
                   failCount === months.length ? 'failed' : 'partial';
    const message = failCount > 0 ? `${failCount}/${months.length} months failed` : null;

    await completeSyncHistory(syncId, totalOrders, status, message);
    console.log(`\nMonthly split sync completed: ${totalOrders} orders saved (${successCount} success, ${failCount} failed)`);

  } catch (error) {
    console.error('Monthly split sync error:', error);
    await completeSyncHistory(syncId, 0, 'failed', error.message);
    throw error;
  }
}

// 날짜 범위를 월별로 분할하는 헬퍼 함수
function getMonthRanges(startDate, endDate) {
  const ranges = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let current = new Date(start);

  while (current <= end) {
    const monthStart = new Date(current);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0); // 해당 월의 마지막 날

    // 종료일이 원래 종료일보다 크면 원래 종료일 사용
    const actualEnd = monthEnd > end ? end : monthEnd;

    ranges.push({
      start: monthStart.toISOString().split('T')[0],
      end: actualEnd.toISOString().split('T')[0]
    });

    // 다음 월의 1일로 이동
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return ranges;
}

// 날짜 범위를 7일(주간) 단위로 분할하는 헬퍼 함수
function getWeekRanges(startDate, endDate) {
  const ranges = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let current = new Date(start);

  while (current <= end) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6); // 7일 후

    // 종료일이 원래 종료일보다 크면 원래 종료일 사용
    const actualEnd = weekEnd > end ? end : weekEnd;

    ranges.push({
      start: weekStart.toISOString().split('T')[0],
      end: actualEnd.toISOString().split('T')[0]
    });

    // 다음 주로 이동 (7일 후)
    current.setDate(current.getDate() + 7);
  }

  return ranges;
}

// N일 단위로 분할하는 범용 헬퍼 함수
function getDayRanges(startDate, endDate, days) {
  const ranges = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let current = new Date(start);

  while (current <= end) {
    const rangeStart = new Date(current);
    const rangeEnd = new Date(current);
    rangeEnd.setDate(rangeEnd.getDate() + days - 1);

    const actualEnd = rangeEnd > end ? end : rangeEnd;

    ranges.push({
      start: rangeStart.toISOString().split('T')[0],
      end: actualEnd.toISOString().split('T')[0]
    });

    current.setDate(current.getDate() + days);
  }

  return ranges;
}

// 점진적 분할 재시도로 기간 동기화 (7일 → 4일 → 2일 → 1일)
async function syncPeriodWithRetry(start, end, onProgress = null) {
  const splitStrategies = [
    { days: 7, name: '7일' },
    { days: 4, name: '4일' },
    { days: 2, name: '2일' },
    { days: 1, name: '1일' }
  ];

  return await syncPeriodWithStrategies(start, end, splitStrategies, onProgress);
}

// 7일이 이미 실패한 경우 더 작은 단위부터 시작 (4일 → 2일 → 1일)
async function syncPeriodWithRetrySmaller(start, end, onProgress = null) {
  const splitStrategies = [
    { days: 4, name: '4일' },
    { days: 2, name: '2일' },
    { days: 1, name: '1일' }
  ];

  return await syncPeriodWithStrategies(start, end, splitStrategies, onProgress);
}

// 공통 점진적 분할 로직
async function syncPeriodWithStrategies(start, end, splitStrategies, onProgress = null) {

  let allOrders = [];
  let failedRanges = [{ start, end }];

  for (const strategy of splitStrategies) {
    if (failedRanges.length === 0) break;

    const currentFailedRanges = [...failedRanges];
    failedRanges = [];

    console.log(`    → ${strategy.name} 단위로 ${currentFailedRanges.length}개 구간 시도`);

    for (const range of currentFailedRanges) {
      const subRanges = getDayRanges(range.start, range.end, strategy.days);

      for (const subRange of subRanges) {
        try {
          const { orders } = await getAllOrders(subRange.start, subRange.end, {}, onProgress);

          if (orders.length > 0) {
            await saveOrders(orders);
            allOrders = allOrders.concat(orders);
            console.log(`      ✓ ${subRange.start} ~ ${subRange.end}: ${orders.length}건`);
          } else {
            console.log(`      - ${subRange.start} ~ ${subRange.end}: 0건`);
          }

          // API 부하 방지
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
          console.log(`      ✗ ${subRange.start} ~ ${subRange.end}: 실패`);

          // 1일 단위가 아니면 더 작은 단위로 재시도를 위해 기록
          if (strategy.days > 1) {
            failedRanges.push(subRange);
          } else {
            // 1일 단위도 실패하면 최종 실패로 기록
            console.log(`      ⚠ ${subRange.start}: 1일 단위도 실패 - 건너뜀`);
          }
        }
      }
    }
  }

  return {
    orders: allOrders,
    totalSaved: allOrders.length,
    failedCount: failedRanges.length
  };
}

// 주간(7일) 분할 동기화 - 최대 5개월
router.post('/weekly', async (req, res) => {
  try {
    const running = await getRunningSyncHistory();
    if (running) {
      return res.status(409).json({
        error: '이미 동기화가 진행 중입니다.',
        running
      });
    }

    const today = new Date();
    // 기본값: 5개월 전부터 (API 제한이 약 5-6개월)
    const monthsBack = parseInt(req.body.months) || 5;
    const startDefault = new Date(today);
    startDefault.setMonth(startDefault.getMonth() - monthsBack);

    const sdate = req.body.sdate || startDefault.toISOString().split('T')[0];
    const edate = req.body.edate || today.toISOString().split('T')[0];

    const syncId = await startSyncHistory('weekly', sdate, edate);

    res.json({
      success: true,
      message: '주간(7일) 분할 동기화가 시작되었습니다.',
      syncId,
      sdate,
      edate
    });

    // 백그라운드에서 주간 분할 동기화 실행
    performWeeklySplit(syncId, sdate, edate).catch(async error => {
      console.error('Weekly sync failed:', error);
      await completeSyncHistory(syncId, 0, 'failed', error.message);
    });

  } catch (error) {
    console.error('Error starting weekly sync:', error);
    res.status(500).json({ error: error.message });
  }
});

// 주간 분할 동기화 수행 함수
async function performWeeklySplit(syncId, sdate, edate) {
  console.log(`Starting weekly split sync [${syncId}]: ${sdate} ~ ${edate}`);

  try {
    // 1. 쇼핑몰 목록 동기화
    console.log('Syncing shops...');
    const shops = await getShops();
    await saveShops(shops);
    console.log(`Synced ${shops.length} shops`);

    // 2. 주간(7일)로 기간 분할
    const weeks = getWeekRanges(sdate, edate);
    console.log(`Split into ${weeks.length} weekly chunks`);

    let totalOrders = 0;
    let successCount = 0;
    let failCount = 0;

    // 3. 각 주별로 순차 동기화
    for (let i = 0; i < weeks.length; i++) {
      const { start, end } = weeks[i];
      console.log(`\n[${i + 1}/${weeks.length}] Syncing: ${start} ~ ${end}`);

      try {
        const { orders, total } = await getAllOrders(start, end, {}, (progress) => {
          console.log(`  Progress: ${progress.fetched}/${progress.total} (${progress.percentage}%)`);
        });

        if (orders.length > 0) {
          await saveOrders(orders);
          totalOrders += orders.length;
          console.log(`  ✓ Saved ${orders.length} orders (total: ${totalOrders})`);
        } else {
          console.log(`  - No orders in this period`);
        }
        successCount++;

        // API 부하 방지를 위한 딜레이 (주 사이)
        if (i < weeks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (weekError) {
        console.error(`  ✗ 7일 단위 실패: ${weekError.message}`);
        console.log(`  → 점진적 분할 재시도 시작 (4일 → 2일 → 1일)`);

        // 점진적 분할로 재시도 (7일은 이미 실패했으므로 4일부터)
        try {
          const retryResult = await syncPeriodWithRetrySmaller(start, end, (progress) => {
            console.log(`    Progress: ${progress.fetched}/${progress.total}`);
          });

          if (retryResult.totalSaved > 0) {
            totalOrders += retryResult.totalSaved;
            console.log(`  ✓ 점진적 분할로 ${retryResult.totalSaved}건 저장 성공`);
            successCount++;
          } else if (retryResult.failedCount === 0) {
            console.log(`  - 해당 기간 데이터 없음`);
            successCount++;
          } else {
            console.log(`  ⚠ 일부 기간 실패 (${retryResult.failedCount}개 구간)`);
            failCount++;
          }
        } catch (retryError) {
          console.error(`  ✗ 점진적 분할도 실패: ${retryError.message}`);
          failCount++;
        }
      }
    }

    // 4. 주문 데이터에서 발견된 신규 쇼핑몰 자동 추가
    console.log('Checking for new shops from orders...');
    const missingResult = await syncMissingShopsFromOrders();
    if (missingResult.added > 0) {
      console.log(`Added ${missingResult.added} new shops from order data`);
    }

    // 5. 완료 처리
    const status = failCount === 0 ? 'completed' :
                   failCount === weeks.length ? 'failed' : 'partial';
    const message = failCount > 0 ? `${successCount} success, ${failCount} failed` : null;

    await completeSyncHistory(syncId, totalOrders, status, message);
    console.log(`\n========================================`);
    console.log(`Weekly sync completed!`);
    console.log(`Total: ${totalOrders} orders saved`);
    console.log(`Success: ${successCount}/${weeks.length} weeks`);
    if (failCount > 0) console.log(`Failed: ${failCount} weeks`);
    console.log(`========================================\n`);

  } catch (error) {
    console.error('Weekly split sync error:', error);
    await completeSyncHistory(syncId, 0, 'failed', error.message);
    throw error;
  }
}

// 최근 3주 동기화 (주문 상태 변경 반영용)
// - 반품/교환/취소 등 상태 변경이 보통 3주 내에 발생하므로
// - 주간(7일) 단위 분할로 3주(21일) 데이터 동기화
router.post('/recent', async (req, res) => {
  try {
    const running = await getRunningSyncHistory();
    if (running) {
      return res.status(409).json({
        error: '이미 동기화가 진행 중입니다.',
        running
      });
    }

    const today = new Date();
    // 기본 3주 (21일), 파라미터로 변경 가능
    const weeks = parseInt(req.body.weeks) || 3;
    const daysBack = weeks * 7;

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysBack);

    const sdate = startDate.toISOString().split('T')[0];
    const edate = today.toISOString().split('T')[0];

    const syncId = await startSyncHistory('recent', sdate, edate);

    res.json({
      success: true,
      message: `최근 ${weeks}주 동기화가 시작되었습니다.`,
      syncId,
      sdate,
      edate,
      weeks
    });

    // 백그라운드에서 주간 분할 동기화 실행
    performWeeklySplit(syncId, sdate, edate).catch(async error => {
      console.error('Recent sync failed:', error);
      await completeSyncHistory(syncId, 0, 'failed', error.message);
    });

  } catch (error) {
    console.error('Error starting recent sync:', error);
    res.status(500).json({ error: error.message });
  }
});

// 증분 동기화 (최근 7일)
router.post('/incremental', async (req, res) => {
  try {
    const running = await getRunningSyncHistory();
    if (running) {
      return res.status(409).json({
        error: '이미 동기화가 진행 중입니다.',
        running
      });
    }

    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const sdate = weekAgo.toISOString().split('T')[0];
    const edate = today.toISOString().split('T')[0];

    const syncId = await startSyncHistory('incremental', sdate, edate);

    res.json({
      success: true,
      message: '증분 동기화가 시작되었습니다.',
      syncId,
      sdate,
      edate
    });

    performSync(syncId, sdate, edate).catch(async error => {
      console.error('Incremental sync failed:', error);
      await completeSyncHistory(syncId, 0, 'failed', error.message);
    });

  } catch (error) {
    console.error('Error starting incremental sync:', error);
    res.status(500).json({ error: error.message });
  }
});

// 실제 동기화 수행 함수
async function performSync(syncId, sdate, edate) {
  console.log(`Starting sync [${syncId}]: ${sdate} ~ ${edate}`);

  try {
    // 1. 쇼핑몰 목록 동기화
    console.log('Syncing shops...');
    const shops = await getShops();
    await saveShops(shops);
    console.log(`Synced ${shops.length} shops`);

    // 2. 주문 데이터 동기화
    console.log('Syncing orders...');
    const { orders, total } = await getAllOrders(sdate, edate, {}, (progress) => {
      console.log(`Progress: ${progress.fetched}/${progress.total} (${progress.percentage}%)`);
    });

    // 3. DB에 저장
    console.log('Saving orders to database...');
    await saveOrders(orders);

    // 4. 주문 데이터에서 발견된 신규 쇼핑몰 자동 추가
    console.log('Checking for new shops from orders...');
    const missingResult = await syncMissingShopsFromOrders();
    if (missingResult.added > 0) {
      console.log(`Added ${missingResult.added} new shops from order data`);
    }

    // 5. 완료 처리
    await completeSyncHistory(syncId, orders.length, 'completed');
    console.log(`Sync completed: ${orders.length} orders saved`);

  } catch (error) {
    console.error('Sync error:', error);
    await completeSyncHistory(syncId, 0, 'failed', error.message);
    throw error;
  }
}

// 동기화 이력 조회
router.get('/history', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const historyResult = await query(`
      SELECT * FROM ${SCHEMA}.sync_history
      ORDER BY started_at DESC
      LIMIT $1
    `, [parseInt(limit)]);

    res.json(historyResult.rows);
  } catch (error) {
    console.error('Error getting sync history:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// 스케줄러 관련 API
// ========================================

// 스케줄러 상태 조회
router.get('/scheduler', (req, res) => {
  try {
    const status = getSchedulerStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    res.status(500).json({ error: error.message });
  }
});

// 스마트 증분 동기화 (수동 트리거)
router.post('/smart', async (req, res) => {
  try {
    const running = await getRunningSyncHistory();
    if (running) {
      return res.status(409).json({
        error: '이미 동기화가 진행 중입니다.',
        running
      });
    }

    res.json({
      success: true,
      message: '스마트 증분 동기화가 시작되었습니다.'
    });

    // 백그라운드에서 실행
    triggerSmartSync().catch(error => {
      console.error('Smart sync failed:', error);
    });

  } catch (error) {
    console.error('Error starting smart sync:', error);
    res.status(500).json({ error: error.message });
  }
});

// 특정 기간 점진적 분할 재시도 (실패한 기간 수동 재시도용)
router.post('/retry-period', async (req, res) => {
  try {
    const running = await getRunningSyncHistory();
    if (running) {
      return res.status(409).json({
        error: '이미 동기화가 진행 중입니다.',
        running
      });
    }

    const { sdate, edate } = req.body;

    if (!sdate || !edate) {
      return res.status(400).json({ error: 'sdate와 edate는 필수입니다.' });
    }

    const syncId = await startSyncHistory('retry_period', sdate, edate);

    res.json({
      success: true,
      message: `점진적 분할 재시도가 시작되었습니다: ${sdate} ~ ${edate}`,
      syncId,
      sdate,
      edate
    });

    // 백그라운드에서 점진적 분할 동기화 실행
    (async () => {
      try {
        console.log(`\n========================================`);
        console.log(`점진적 분할 재시도 시작: ${sdate} ~ ${edate}`);
        console.log(`========================================`);

        // 쇼핑몰 동기화
        const shops = await getShops();
        await saveShops(shops);

        // 점진적 분할로 동기화 (7일 → 4일 → 2일 → 1일)
        const result = await syncPeriodWithRetry(sdate, edate, (progress) => {
          console.log(`Progress: ${progress.fetched}/${progress.total}`);
        });

        const status = result.failedCount === 0 ? 'completed' : 'partial';
        await completeSyncHistory(syncId, result.totalSaved, status,
          result.failedCount > 0 ? `${result.failedCount}개 구간 최종 실패` : null);

        console.log(`\n========================================`);
        console.log(`점진적 분할 재시도 완료!`);
        console.log(`저장된 주문: ${result.totalSaved}건`);
        if (result.failedCount > 0) {
          console.log(`최종 실패: ${result.failedCount}개 구간`);
        }
        console.log(`========================================\n`);

      } catch (error) {
        console.error('점진적 분할 재시도 오류:', error);
        await completeSyncHistory(syncId, 0, 'failed', error.message);
      }
    })();

  } catch (error) {
    console.error('Error starting retry-period:', error);
    res.status(500).json({ error: error.message });
  }
});

// 전체 검증 동기화 (수동 트리거)
router.post('/validation', async (req, res) => {
  try {
    const running = await getRunningSyncHistory();
    if (running) {
      return res.status(409).json({
        error: '이미 동기화가 진행 중입니다.',
        running
      });
    }

    res.json({
      success: true,
      message: '전체 검증 동기화가 시작되었습니다.'
    });

    // 백그라운드에서 실행
    triggerFullValidation().catch(error => {
      console.error('Full validation failed:', error);
    });

  } catch (error) {
    console.error('Error starting validation:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
