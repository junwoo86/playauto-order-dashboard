import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format, subYears } from 'date-fns';
import {
  startSync,
  startIncrementalSync,
  startRecentSync,
  startYearlySync,
  startWeeklySync,
  startSmartSync,
  startValidationSync,
  getSchedulerStatus
} from '../../services/api';

function SyncPanel({ syncStatus, onSyncComplete }) {
  const [showFullSync, setShowFullSync] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [syncDates, setSyncDates] = useState({
    sdate: format(subYears(new Date(), 1), 'yyyy-MM-dd'),
    edate: format(new Date(), 'yyyy-MM-dd')
  });

  // 스케줄러 상태 조회
  const { data: schedulerData, refetch: refetchScheduler } = useQuery({
    queryKey: ['scheduler'],
    queryFn: getSchedulerStatus,
    refetchInterval: 30000, // 30초마다 갱신
    enabled: showScheduler
  });

  const fullSyncMutation = useMutation({
    mutationFn: () => startSync(syncDates.sdate, syncDates.edate),
    onSuccess: () => {
      setShowFullSync(false);
      onSyncComplete?.();
    }
  });

  const incrementalSyncMutation = useMutation({
    mutationFn: startIncrementalSync,
    onSuccess: () => {
      onSyncComplete?.();
    }
  });

  const yearlySyncMutation = useMutation({
    mutationFn: () => startYearlySync(syncDates.sdate, syncDates.edate),
    onSuccess: () => {
      setShowFullSync(false);
      onSyncComplete?.();
    }
  });

  const weeklySyncMutation = useMutation({
    mutationFn: () => startWeeklySync(null, null, 5),
    onSuccess: () => {
      setShowFullSync(false);
      onSyncComplete?.();
    }
  });

  const smartSyncMutation = useMutation({
    mutationFn: startSmartSync,
    onSuccess: () => {
      onSyncComplete?.();
    }
  });

  // 최근 3주 동기화 (반품/교환/취소 상태 변경 반영)
  const recentSyncMutation = useMutation({
    mutationFn: () => startRecentSync(3),
    onSuccess: () => {
      onSyncComplete?.();
    }
  });

  const validationMutation = useMutation({
    mutationFn: startValidationSync,
    onSuccess: () => {
      onSyncComplete?.();
    }
  });

  const isRunning = syncStatus?.isRunning ||
    yearlySyncMutation.isPending ||
    weeklySyncMutation.isPending ||
    smartSyncMutation.isPending ||
    recentSyncMutation.isPending ||
    validationMutation.isPending;

  const lastSync = syncStatus?.lastSync;
  const stats = syncStatus?.stats;

  // 다음 실행 시간 포맷팅
  const formatNextRun = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = date - now;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 24) {
      return format(date, 'MM/dd HH:mm');
    } else if (diffHours > 0) {
      return `${diffHours}시간 ${diffMins}분 후`;
    } else if (diffMins > 0) {
      return `${diffMins}분 후`;
    } else {
      return '곧 실행';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <span>🔄</span> 데이터 동기화
      </h3>

      {/* 현재 상태 */}
      <div className="text-sm text-gray-600 mb-3 space-y-1">
        <p>
          총 주문: <span className="font-semibold text-gray-900">
            {(stats?.totalOrders || 0).toLocaleString()}건
          </span>
        </p>
        {stats?.dateRange?.from && (
          <p>
            기간: {stats.dateRange.from?.split(' ')[0]} ~ {stats.dateRange.to?.split(' ')[0]}
          </p>
        )}
        {lastSync && (
          <p className="text-xs text-gray-400">
            마지막 동기화: {lastSync.completed_at}
          </p>
        )}
      </div>

      {/* 동기화 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={() => recentSyncMutation.mutate()}
          disabled={isRunning}
          className="flex-1 px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          title="최근 3주 주문 데이터 동기화 (반품/교환/취소 상태 반영)"
        >
          {isRunning ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              동기화 중...
            </span>
          ) : (
            '최근 3주 동기화'
          )}
        </button>

        <button
          onClick={() => {
            setShowFullSync(!showFullSync);
            setShowScheduler(false);
          }}
          className={`px-3 py-2 text-sm rounded transition-colors ${
            showFullSync
              ? 'bg-gray-700 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          전체
        </button>

        <button
          onClick={() => {
            setShowScheduler(!showScheduler);
            setShowFullSync(false);
          }}
          className={`px-3 py-2 text-sm rounded transition-colors ${
            showScheduler
              ? 'bg-purple-600 text-white'
              : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
          }`}
        >
          ⏰
        </button>
      </div>

      {/* 스케줄러 상태 */}
      {showScheduler && (
        <div className="mt-3 p-3 bg-purple-50 rounded border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-purple-800">자동 동기화 스케줄</p>
            <button
              onClick={() => refetchScheduler()}
              className="text-xs text-purple-600 hover:text-purple-800"
            >
              새로고침
            </button>
          </div>

          {schedulerData ? (
            <div className="space-y-2 text-sm">
              {/* 일별 동기화 */}
              <div className="flex items-center justify-between p-2 bg-white rounded">
                <div>
                  <p className="font-medium text-gray-700">📅 일별 증분 동기화</p>
                  <p className="text-xs text-gray-500">매일 새벽 3시</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-purple-600">
                    다음: {formatNextRun(schedulerData.dailySync?.nextRun)}
                  </p>
                  {schedulerData.dailySync?.lastRun && (
                    <p className="text-xs text-gray-400">
                      마지막: {new Date(schedulerData.dailySync.lastRun).toLocaleString('ko-KR')}
                    </p>
                  )}
                </div>
              </div>

              {/* 주간 검증 */}
              <div className="flex items-center justify-between p-2 bg-white rounded">
                <div>
                  <p className="font-medium text-gray-700">🔍 주간 전체 검증</p>
                  <p className="text-xs text-gray-500">매주 일요일 새벽 4시</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-purple-600">
                    다음: {formatNextRun(schedulerData.weeklyValidation?.nextRun)}
                  </p>
                  {schedulerData.weeklyValidation?.lastRun && (
                    <p className="text-xs text-gray-400">
                      마지막: {new Date(schedulerData.weeklyValidation.lastRun).toLocaleString('ko-KR')}
                    </p>
                  )}
                </div>
              </div>

              {/* 수동 트리거 버튼 */}
              <div className="flex gap-2 mt-2 pt-2 border-t border-purple-100">
                <button
                  onClick={() => smartSyncMutation.mutate()}
                  disabled={isRunning}
                  className="flex-1 px-2 py-1 bg-purple-500 text-white text-xs rounded hover:bg-purple-600 disabled:bg-gray-300"
                >
                  지금 증분 동기화
                </button>
                <button
                  onClick={() => validationMutation.mutate()}
                  disabled={isRunning}
                  className="flex-1 px-2 py-1 bg-purple-700 text-white text-xs rounded hover:bg-purple-800 disabled:bg-gray-300"
                >
                  지금 전체 검증
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">로딩 중...</p>
          )}

          <p className="text-xs text-purple-600 mt-2">
            ※ 최근 3주 동기화: 반품/교환/취소 상태 변경 반영을 위해 3주치 재수집<br/>
            ※ 스마트 동기화: 마지막 동기화 이후 변경분만 수집 (2일 버퍼 적용)
          </p>
        </div>
      )}

      {/* 전체 동기화 폼 */}
      {showFullSync && (
        <div className="mt-3 p-3 bg-gray-50 rounded border">
          <p className="text-xs text-gray-500 mb-2">동기화 기간 설정</p>
          <div className="flex gap-2 mb-2">
            <input
              type="date"
              value={syncDates.sdate}
              onChange={(e) => setSyncDates(prev => ({ ...prev, sdate: e.target.value }))}
              className="flex-1 px-2 py-1 border rounded text-sm"
            />
            <span className="text-gray-400">~</span>
            <input
              type="date"
              value={syncDates.edate}
              onChange={(e) => setSyncDates(prev => ({ ...prev, edate: e.target.value }))}
              className="flex-1 px-2 py-1 border rounded text-sm"
            />
          </div>
          <div className="flex flex-col gap-2 mb-2">
            <button
              onClick={() => weeklySyncMutation.mutate()}
              disabled={isRunning || weeklySyncMutation.isPending}
              className="w-full px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-300 transition-colors font-medium"
            >
              {weeklySyncMutation.isPending ? '동기화 중...' : '📅 5개월 데이터 수집 (권장)'}
            </button>
            <button
              onClick={() => fullSyncMutation.mutate()}
              disabled={isRunning || fullSyncMutation.isPending}
              className="w-full px-3 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 disabled:bg-gray-300 transition-colors"
            >
              {fullSyncMutation.isPending ? '동기화 중...' : '선택 기간 동기화 (7일 이하)'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            ※ 5개월 수집: 주간(7일) 단위로 분할하여 최대 5개월 데이터 수집<br/>
            ※ 선택 기간: 위 날짜 범위로 동기화 (7일 초과 시 오류)
          </p>
        </div>
      )}

      {/* 에러 표시 */}
      {(fullSyncMutation.error || incrementalSyncMutation.error || recentSyncMutation.error || yearlySyncMutation.error || weeklySyncMutation.error || smartSyncMutation.error || validationMutation.error) && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
          동기화 실패: {fullSyncMutation.error?.message || incrementalSyncMutation.error?.message || recentSyncMutation.error?.message || yearlySyncMutation.error?.message || weeklySyncMutation.error?.message || smartSyncMutation.error?.message || validationMutation.error?.message}
        </div>
      )}
    </div>
  );
}

export default SyncPanel;
