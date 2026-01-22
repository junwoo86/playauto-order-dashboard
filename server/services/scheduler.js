import cron from 'node-cron';
import {
  saveOrders,
  saveShops,
  startSyncHistory,
  completeSyncHistory,
  getLastSync,
  getRunningSyncHistory
} from './database.js';
import { getAllOrders, getShops } from './playauto.js';

// 스케줄러 상태
let schedulerStatus = {
  enabled: true,
  intervalSync: {
    schedule: '0 0,3,6,9,12,15,18,21 * * *',  // 3시간마다 (0시, 3시, 6시, ...)
    lastRun: null,
    nextRun: null,
    status: 'idle'
  },
  weeklyValidation: {
    schedule: '0 4 * * 0',  // 매주 일요일 새벽 4시
    lastRun: null,
    nextRun: null,
    status: 'idle'
  }
};

// 날짜를 7일 단위로 분할
function getWeekRanges(startDate, endDate) {
  const ranges = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  let current = new Date(start);

  while (current <= end) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const actualEnd = weekEnd > end ? end : weekEnd;

    ranges.push({
      start: weekStart.toISOString().split('T')[0],
      end: actualEnd.toISOString().split('T')[0]
    });

    current.setDate(current.getDate() + 7);
  }

  return ranges;
}

// 두 날짜 사이의 일수 계산
function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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

// 점진적 분할 재시도 (7일이 이미 실패한 경우 4일 → 2일 → 1일)
async function syncPeriodWithRetrySmaller(start, end, onProgress = null) {
  const splitStrategies = [
    { days: 4, name: '4일' },
    { days: 2, name: '2일' },
    { days: 1, name: '1일' }
  ];

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

// 스마트 증분 동기화
export async function smartIncrementalSync() {
  console.log(`\n[${new Date().toISOString()}] Smart incremental sync started`);

  // 이미 실행 중인 동기화가 있는지 확인
  const running = await getRunningSyncHistory();
  if (running) {
    console.log('Sync already running, skipping...');
    return { skipped: true, reason: 'already_running' };
  }

  const lastSync = await getLastSync();
  let sdate;
  const today = new Date();
  const edate = today.toISOString().split('T')[0];

  if (lastSync?.edate) {
    // 마지막 동기화 종료일 - 2일 (버퍼: 소급 입력 대응)
    const buffer = new Date(lastSync.edate);
    buffer.setDate(buffer.getDate() - 2);
    sdate = buffer.toISOString().split('T')[0];
    console.log(`Last sync: ${lastSync.edate}, starting from: ${sdate} (2-day buffer)`);
  } else {
    // 기록 없으면 7일 전부터
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    sdate = weekAgo.toISOString().split('T')[0];
    console.log(`No previous sync found, starting from: ${sdate}`);
  }

  const days = daysBetween(sdate, edate);
  console.log(`Sync period: ${sdate} ~ ${edate} (${days} days)`);

  const syncId = await startSyncHistory('smart_incremental', sdate, edate);

  try {
    // 쇼핑몰 목록 동기화
    console.log('Syncing shops...');
    const shops = await getShops();
    await saveShops(shops);
    console.log(`Synced ${shops.length} shops`);

    let totalOrders = 0;

    if (days <= 7) {
      // 7일 이내면 바로 수집
      console.log('Period <= 7 days, fetching directly...');
      const { orders } = await getAllOrders(sdate, edate, {}, (progress) => {
        console.log(`Progress: ${progress.fetched}/${progress.total} (${progress.percentage}%)`);
      });

      if (orders.length > 0) {
        await saveOrders(orders);
        totalOrders = orders.length;
      }
    } else {
      // 7일 초과면 주간 분할
      console.log(`Period > 7 days, splitting into weekly chunks...`);
      const weeks = getWeekRanges(sdate, edate);
      console.log(`Split into ${weeks.length} weekly chunks`);

      for (let i = 0; i < weeks.length; i++) {
        const { start, end } = weeks[i];
        console.log(`[${i + 1}/${weeks.length}] Syncing: ${start} ~ ${end}`);

        try {
          const { orders } = await getAllOrders(start, end, {}, (progress) => {
            console.log(`  Progress: ${progress.fetched}/${progress.total}`);
          });

          if (orders.length > 0) {
            await saveOrders(orders);
            totalOrders += orders.length;
            console.log(`  Saved ${orders.length} orders (total: ${totalOrders})`);
          }

          // API 부하 방지
          if (i < weeks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (weekError) {
          console.error(`  ✗ 7일 단위 실패: ${weekError.message}`);
          console.log(`  → 점진적 분할 재시도 시작 (4일 → 2일 → 1일)`);

          // 점진적 분할로 재시도
          try {
            const retryResult = await syncPeriodWithRetrySmaller(start, end, (progress) => {
              console.log(`    Progress: ${progress.fetched}/${progress.total}`);
            });

            if (retryResult.totalSaved > 0) {
              totalOrders += retryResult.totalSaved;
              console.log(`  ✓ 점진적 분할로 ${retryResult.totalSaved}건 저장 성공`);
            } else if (retryResult.failedCount === 0) {
              console.log(`  - 해당 기간 데이터 없음`);
            } else {
              console.log(`  ⚠ 일부 기간 실패 (${retryResult.failedCount}개 구간)`);
            }
          } catch (retryError) {
            console.error(`  ✗ 점진적 분할도 실패: ${retryError.message}`);
          }
        }
      }
    }

    await completeSyncHistory(syncId, totalOrders, 'completed');
    console.log(`Smart incremental sync completed: ${totalOrders} orders\n`);

    return { success: true, totalOrders, sdate, edate };

  } catch (error) {
    console.error('Smart incremental sync error:', error);
    await completeSyncHistory(syncId, 0, 'failed', error.message);
    throw error;
  }
}

// 주간 전체 검증 (5개월 데이터 재검증)
export async function weeklyFullValidation() {
  console.log(`\n[${new Date().toISOString()}] Weekly full validation started`);

  const running = await getRunningSyncHistory();
  if (running) {
    console.log('Sync already running, skipping validation...');
    return { skipped: true, reason: 'already_running' };
  }

  const today = new Date();
  const fiveMonthsAgo = new Date(today);
  fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5);

  const sdate = fiveMonthsAgo.toISOString().split('T')[0];
  const edate = today.toISOString().split('T')[0];

  console.log(`Validation period: ${sdate} ~ ${edate}`);

  const syncId = await startSyncHistory('weekly_validation', sdate, edate);

  try {
    // 쇼핑몰 목록 동기화
    const shops = await getShops();
    await saveShops(shops);

    // 주간 분할 동기화
    const weeks = getWeekRanges(sdate, edate);
    console.log(`Split into ${weeks.length} weekly chunks`);

    let totalOrders = 0;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < weeks.length; i++) {
      const { start, end } = weeks[i];
      console.log(`[${i + 1}/${weeks.length}] Validating: ${start} ~ ${end}`);

      try {
        const { orders } = await getAllOrders(start, end, {});

        if (orders.length > 0) {
          await saveOrders(orders);
          totalOrders += orders.length;
        }
        successCount++;

        // API 부하 방지
        if (i < weeks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (weekError) {
        console.error(`  ✗ 7일 단위 실패: ${weekError.message}`);
        console.log(`  → 점진적 분할 재시도 시작 (4일 → 2일 → 1일)`);

        // 점진적 분할로 재시도
        try {
          const retryResult = await syncPeriodWithRetrySmaller(start, end, null);

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

    const status = failCount === 0 ? 'completed' :
                   failCount === weeks.length ? 'failed' : 'partial';

    await completeSyncHistory(syncId, totalOrders, status,
      failCount > 0 ? `${successCount} success, ${failCount} failed` : null);

    console.log(`Weekly validation completed: ${totalOrders} orders (${successCount}/${weeks.length} weeks)\n`);

    return { success: true, totalOrders, successCount, failCount };

  } catch (error) {
    console.error('Weekly validation error:', error);
    await completeSyncHistory(syncId, 0, 'failed', error.message);
    throw error;
  }
}

// 다음 실행 시간 계산
function getNextRunTime(cronExpression) {
  const parts = cronExpression.split(' ');
  const minute = parseInt(parts[0]);
  const hour = parseInt(parts[1]);
  const dayOfWeek = parts[4];

  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);

  if (dayOfWeek === '*') {
    // 매일 실행
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
  } else {
    // 특정 요일 실행 (0 = 일요일)
    const targetDay = parseInt(dayOfWeek);
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0 || (daysUntil === 0 && next <= now)) {
      daysUntil += 7;
    }
    next.setDate(next.getDate() + daysUntil);
  }

  return next.toISOString();
}

// 다음 실행 시간 계산 (3시간 간격용)
function getNextIntervalRunTime(cronExpression) {
  const parts = cronExpression.split(' ');
  const minute = parseInt(parts[0]);
  const hours = parts[1].split(',').map(h => parseInt(h));  // [0, 3, 6, 9, 12, 15, 18, 21]

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // 오늘 실행할 시간 중 현재 이후의 시간 찾기
  let nextHour = hours.find(h => h > currentHour || (h === currentHour && minute > currentMinute));

  const next = new Date(now);
  if (nextHour !== undefined) {
    // 오늘 실행
    next.setHours(nextHour, minute, 0, 0);
  } else {
    // 내일 0시 실행
    next.setDate(next.getDate() + 1);
    next.setHours(hours[0], minute, 0, 0);
  }

  return next.toISOString();
}

// 스케줄러 초기화
export function initScheduler() {
  console.log('\n========================================');
  console.log('Initializing scheduler...');
  console.log('========================================');

  // 3시간마다 - 스마트 증분 동기화 (0시, 3시, 6시, 9시, 12시, 15시, 18시, 21시)
  cron.schedule(schedulerStatus.intervalSync.schedule, async () => {
    schedulerStatus.intervalSync.status = 'running';
    schedulerStatus.intervalSync.lastRun = new Date().toISOString();

    try {
      await smartIncrementalSync();
      schedulerStatus.intervalSync.status = 'idle';
    } catch (error) {
      console.error('Scheduled interval sync failed:', error);
      schedulerStatus.intervalSync.status = 'error';
    }

    schedulerStatus.intervalSync.nextRun = getNextIntervalRunTime(schedulerStatus.intervalSync.schedule);
  }, {
    timezone: 'Asia/Seoul'
  });

  // 매주 일요일 새벽 4시 - 전체 검증
  cron.schedule(schedulerStatus.weeklyValidation.schedule, async () => {
    schedulerStatus.weeklyValidation.status = 'running';
    schedulerStatus.weeklyValidation.lastRun = new Date().toISOString();

    try {
      await weeklyFullValidation();
      schedulerStatus.weeklyValidation.status = 'idle';
    } catch (error) {
      console.error('Scheduled weekly validation failed:', error);
      schedulerStatus.weeklyValidation.status = 'error';
    }

    schedulerStatus.weeklyValidation.nextRun = getNextRunTime(schedulerStatus.weeklyValidation.schedule);
  }, {
    timezone: 'Asia/Seoul'
  });

  // 초기 다음 실행 시간 설정
  schedulerStatus.intervalSync.nextRun = getNextIntervalRunTime(schedulerStatus.intervalSync.schedule);
  schedulerStatus.weeklyValidation.nextRun = getNextRunTime(schedulerStatus.weeklyValidation.schedule);

  console.log(`Interval sync scheduled: ${schedulerStatus.intervalSync.schedule} (next: ${schedulerStatus.intervalSync.nextRun})`);
  console.log(`Weekly validation scheduled: ${schedulerStatus.weeklyValidation.schedule} (next: ${schedulerStatus.weeklyValidation.nextRun})`);
  console.log('========================================\n');

  return schedulerStatus;
}

// 스케줄러 상태 조회
export function getSchedulerStatus() {
  return {
    ...schedulerStatus,
    serverTime: new Date().toISOString()
  };
}

// 수동으로 스마트 동기화 실행
export async function triggerSmartSync() {
  return await smartIncrementalSync();
}

// 수동으로 전체 검증 실행
export async function triggerFullValidation() {
  return await weeklyFullValidation();
}

export default {
  initScheduler,
  getSchedulerStatus,
  smartIncrementalSync,
  weeklyFullValidation,
  triggerSmartSync,
  triggerFullValidation
};
