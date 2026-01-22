import { useQuery } from '@tanstack/react-query';
import { format, subDays, subMonths, startOfMonth, endOfMonth, subYears } from 'date-fns';
import { getShops, downloadExcel } from '../../services/api';

function DateFilter({ sdate, edate, onChange, selectedShop, onShopChange, excludeInternal, onExcludeInternalChange, darkMode = false }) {
  const { data: shops = [] } = useQuery({
    queryKey: ['shops'],
    queryFn: getShops
  });

  // 오늘/어제 주문은 플레이오토에서 완전히 수집되지 않으므로 2일 전(baseDate)을 기준으로 함
  const today = new Date();
  const baseDate = subDays(today, 2); // 그저께

  const presets = [
    { label: '최근 7일', getValue: () => ({
      sdate: format(subDays(today, 8), 'yyyy-MM-dd'),
      edate: format(baseDate, 'yyyy-MM-dd')
    })},
    { label: '최근 30일', getValue: () => ({
      sdate: format(subDays(today, 31), 'yyyy-MM-dd'),
      edate: format(baseDate, 'yyyy-MM-dd')
    })},
    { label: '이번 달', getValue: () => ({
      sdate: format(startOfMonth(today), 'yyyy-MM-dd'),
      edate: format(baseDate, 'yyyy-MM-dd')
    })},
    { label: '지난 달', getValue: () => ({
      sdate: format(startOfMonth(subMonths(today, 1)), 'yyyy-MM-dd'),
      edate: format(endOfMonth(subMonths(today, 1)), 'yyyy-MM-dd')
    })},
    { label: '최근 3개월', getValue: () => ({
      sdate: format(subMonths(subDays(today, 1), 3), 'yyyy-MM-dd'),
      edate: format(baseDate, 'yyyy-MM-dd')
    })},
    { label: '최근 1년', getValue: () => ({
      sdate: format(subYears(subDays(today, 1), 1), 'yyyy-MM-dd'),
      edate: format(baseDate, 'yyyy-MM-dd')
    })}
  ];

  const handlePresetClick = (preset) => {
    const { sdate, edate } = preset.getValue();
    onChange(sdate, edate);
  };

  const handleDownload = () => {
    const params = { sdate, edate };
    if (selectedShop) {
      params.shop_cd = selectedShop;
    }
    downloadExcel(params);
  };

  // 스타일 클래스
  const presetBtnClass = darkMode
    ? 'px-3 py-1.5 text-sm bg-blue-500/50 hover:bg-blue-400/50 text-white rounded-lg transition-colors'
    : 'px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors';

  const inputClass = darkMode
    ? 'px-3 py-1.5 rounded text-gray-800 text-sm'
    : 'px-2 py-1 border rounded text-sm';

  const selectClass = darkMode
    ? 'px-3 py-1.5 rounded text-gray-800 text-sm'
    : 'px-2 py-1 border rounded text-sm';

  const downloadBtnClass = darkMode
    ? 'px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm rounded-lg transition-colors flex items-center gap-2'
    : 'px-4 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 transition-colors flex items-center gap-2';

  const scopeLabelClass = darkMode
    ? 'text-sm text-blue-200 font-medium'
    : 'text-sm text-gray-600 font-medium';

  const scopeBtnActiveClass = darkMode
    ? 'bg-white text-blue-700'
    : 'bg-blue-500 text-white';

  const scopeBtnInactiveClass = darkMode
    ? 'bg-blue-500/50 text-white hover:bg-blue-400/50'
    : 'bg-gray-100 text-gray-600 hover:bg-gray-200';

  const separatorClass = darkMode
    ? 'text-blue-200'
    : 'text-gray-400';

  const wrapperClass = darkMode
    ? 'space-y-3'
    : 'bg-white rounded-lg shadow p-4 space-y-3';

  const borderClass = darkMode
    ? 'pt-3 border-t border-blue-500/30'
    : 'pt-2 border-t';

  return (
    <div className={wrapperClass}>
      {/* 조회 기간 */}
      <div className="flex flex-wrap items-center gap-4">
        {/* 빠른 선택 버튼 */}
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset)}
              className={presetBtnClass}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* 날짜 입력 */}
        <div className="flex items-center gap-2 ml-auto">
          <input
            type="date"
            value={sdate}
            onChange={(e) => onChange(e.target.value, edate)}
            className={inputClass}
          />
          <span className={separatorClass}>~</span>
          <input
            type="date"
            value={edate}
            onChange={(e) => onChange(sdate, e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* 스토어 필터 + 다운로드 + 조회 범위 */}
      <div className={`flex flex-wrap items-center gap-4 ${borderClass}`}>
        {/* 스토어 필터 */}
        <select
          value={selectedShop || ''}
          onChange={(e) => onShopChange(e.target.value || null)}
          className={selectClass}
        >
          <option value="">전체 스토어</option>
          {shops.map((shop) => (
            <option key={shop.shop_cd} value={shop.shop_cd}>
              {shop.seller_nick || shop.shop_name}
            </option>
          ))}
        </select>

        {/* 조회 범위 */}
        <div className="flex items-center gap-3">
          <span className={scopeLabelClass}>조회 범위</span>
          <div className="flex gap-2">
            <button
              onClick={() => onExcludeInternalChange(false)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                !excludeInternal ? scopeBtnActiveClass : scopeBtnInactiveClass
              }`}
            >
              전체
            </button>
            <button
              onClick={() => onExcludeInternalChange(true)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                excludeInternal ? scopeBtnActiveClass : scopeBtnInactiveClass
              }`}
            >
              내부 확인용 제외
            </button>
          </div>
          {excludeInternal && (
            <span className={darkMode ? 'text-xs text-yellow-300' : 'text-xs text-orange-500'}>
              * 상품명에 '내부 확인용'이 포함된 주문 제외
            </span>
          )}
        </div>

        {/* 다운로드 버튼 */}
        <button
          onClick={handleDownload}
          className={`ml-auto ${downloadBtnClass}`}
        >
          <span>📥</span> 엑셀 다운로드
        </button>
      </div>
    </div>
  );
}

export default DateFilter;
