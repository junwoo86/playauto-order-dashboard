import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getUnmappedItems,
  getProductList,
  getMappingStats,
  createManualMapping,
  deleteManualMapping,
  getAutoMappings,
  getDashboardProducts,
  createDashboardProduct,
  updateDashboardProduct,
  deleteDashboardProduct
} from '../../services/api';

function MappingManager() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);
  const [originalProductCode, setOriginalProductCode] = useState(null); // 수정 시 원본 상품코드 저장
  const [mappings, setMappings] = useState([{ product_code: '', quantity: 1 }]);
  const [showMapped, setShowMapped] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('order_count'); // 'order_count' | 'product_name' | 'option_name'

  // 상품 관리 관련 상태
  const [activeTab, setActiveTab] = useState('mapping'); // 'mapping' | 'products'
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({
    product_code: '',
    product_name: '',
    category: 'supplement',
    sort_order: 0,
    keywords: []
  });
  const [keywordsInput, setKeywordsInput] = useState('');

  // 미매핑 항목 조회
  const { data: unmappedData, isLoading: loadingUnmapped } = useQuery({
    queryKey: ['unmapped', page, searchQuery, sortBy],
    queryFn: () => getUnmappedItems({ page, limit: 20, search: searchQuery || undefined, sort: sortBy }),
    enabled: activeTab === 'mapping' && !showMapped
  });

  // 매핑된 항목 조회
  const { data: mappedData, isLoading: loadingMapped } = useQuery({
    queryKey: ['mapped', page, searchQuery, sortBy],
    queryFn: () => getAutoMappings({ page, limit: 20, mapped_only: 'true', search: searchQuery || undefined, sort: sortBy }),
    enabled: activeTab === 'mapping' && showMapped
  });

  // 검색 핸들러
  const handleSearch = () => {
    setSearchQuery(searchInput);
    setPage(1);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
    setPage(1);
  };

  const handleSortChange = (newSort) => {
    setSortBy(newSort);
    setPage(1);
  };

  // 상품 목록 조회 (드롭다운용)
  const { data: productList } = useQuery({
    queryKey: ['productList'],
    queryFn: getProductList
  });

  // 대시보드 상품 전체 목록 (관리용)
  const { data: dashboardProducts, isLoading: loadingProducts } = useQuery({
    queryKey: ['dashboardProducts'],
    queryFn: () => getDashboardProducts({ include_inactive: 'true' }),
    enabled: activeTab === 'products'
  });

  // 매핑 통계 조회
  const { data: mappingStats } = useQuery({
    queryKey: ['mappingStats'],
    queryFn: getMappingStats
  });

  // 수동 매핑 저장 (여러 개 순차 저장)
  const handleSave = async () => {
    if (!selectedItem) return;

    const validMappings = mappings.filter(m => m.product_code);
    if (validMappings.length === 0) return;

    setIsSaving(true);
    try {
      // 수정 모드에서 상품이 변경된 경우, 기존 매핑을 먼저 삭제
      if (originalProductCode && validMappings.length === 1) {
        const newProductCode = validMappings[0].product_code;
        if (originalProductCode !== newProductCode) {
          // 기존 매핑 삭제
          await deleteManualMapping({
            shop_sale_name: selectedItem.shop_sale_name,
            shop_opt_name: selectedItem.shop_opt_name || '',
            product_code: originalProductCode
          });
        }
      }

      for (const mapping of validMappings) {
        await createManualMapping({
          shop_sale_name: selectedItem.shop_sale_name,
          shop_opt_name: selectedItem.shop_opt_name || '',
          product_code: mapping.product_code,
          quantity: parseInt(mapping.quantity)
        });
      }

      queryClient.invalidateQueries(['unmapped']);
      queryClient.invalidateQueries(['mapped']);
      queryClient.invalidateQueries(['mappingStats']);
      setSelectedItem(null);
      setOriginalProductCode(null);
      setMappings([{ product_code: '', quantity: 1 }]);
    } catch (error) {
      console.error('Error saving mappings:', error);
      alert('매핑 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // 수동 매핑 삭제
  const handleDeleteMapping = async (item) => {
    if (!confirm(`"${item.shop_sale_name}" → "${item.product_code}" 매핑을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteManualMapping({
        shop_sale_name: item.shop_sale_name,
        shop_opt_name: item.shop_opt_name || '',
        product_code: item.product_code
      });

      queryClient.invalidateQueries(['unmapped']);
      queryClient.invalidateQueries(['mapped']);
      queryClient.invalidateQueries(['mappingStats']);
    } catch (error) {
      console.error('Error deleting mapping:', error);
      alert('매핑 삭제 중 오류가 발생했습니다.');
    }
  };

  // 상품 저장 (추가/수정)
  const handleSaveProduct = async () => {
    if (!productForm.product_code || !productForm.product_name) {
      alert('SKU 코드와 상품명을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      // 키워드 파싱 (쉼표로 구분된 문자열을 배열로 변환)
      const keywords = keywordsInput
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const dataToSave = {
        ...productForm,
        keywords: keywords.length > 0 ? keywords : [productForm.product_name]
      };

      if (editingProduct) {
        await updateDashboardProduct(editingProduct.id, dataToSave);
      } else {
        await createDashboardProduct(dataToSave);
      }

      queryClient.invalidateQueries(['dashboardProducts']);
      queryClient.invalidateQueries(['productList']);
      setShowProductModal(false);
      setEditingProduct(null);
      setProductForm({
        product_code: '',
        product_name: '',
        category: 'supplement',
        sort_order: 0,
        keywords: []
      });
      setKeywordsInput('');
    } catch (error) {
      console.error('Error saving product:', error);
      alert(error.response?.data?.error || '상품 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // 상품 삭제
  const handleDeleteProduct = async (product) => {
    if (!confirm(`"${product.product_name}"을(를) 비활성화하시겠습니까?`)) return;

    try {
      await deleteDashboardProduct(product.id, false);
      queryClient.invalidateQueries(['dashboardProducts']);
      queryClient.invalidateQueries(['productList']);
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('상품 삭제 중 오류가 발생했습니다.');
    }
  };

  // 상품 활성화
  const handleActivateProduct = async (product) => {
    try {
      await updateDashboardProduct(product.id, { is_active: true });
      queryClient.invalidateQueries(['dashboardProducts']);
      queryClient.invalidateQueries(['productList']);
    } catch (error) {
      console.error('Error activating product:', error);
      alert('상품 활성화 중 오류가 발생했습니다.');
    }
  };

  // 매핑 항목 추가
  const addMapping = () => {
    setMappings([...mappings, { product_code: '', quantity: 1 }]);
  };

  // 매핑 항목 삭제
  const removeMapping = (index) => {
    if (mappings.length === 1) return;
    setMappings(mappings.filter((_, i) => i !== index));
  };

  // 매핑 항목 수정
  const updateMapping = (index, field, value) => {
    const newMappings = [...mappings];
    newMappings[index][field] = value;
    setMappings(newMappings);
  };

  const currentData = showMapped ? mappedData : unmappedData;
  const isLoading = showMapped ? loadingMapped : loadingUnmapped;
  const items = showMapped ? (mappedData?.mappings || []) : (unmappedData?.unmapped || []);

  // 모든 상품 목록 (분석권 + 건기식 + 팀키토 + 기타)
  const allProducts = [
    ...(productList?.analysis || []),
    ...(productList?.supplements || []),
    ...(productList?.teamketo || []),
    ...(productList?.etc || [])
  ];

  // 선택 가능한 상품 (이미 선택된 상품 제외)
  const getAvailableProducts = (currentIndex) => {
    const selectedCodes = mappings
      .filter((_, i) => i !== currentIndex)
      .map(m => m.product_code)
      .filter(Boolean);
    return {
      analysis: (productList?.analysis || []).filter(p => !selectedCodes.includes(p.code)),
      supplements: (productList?.supplements || []).filter(p => !selectedCodes.includes(p.code)),
      teamketo: (productList?.teamketo || []).filter(p => !selectedCodes.includes(p.code)),
      etc: (productList?.etc || []).filter(p => !selectedCodes.includes(p.code))
    };
  };

  const validMappingsCount = mappings.filter(m => m.product_code).length;

  // 카테고리별 상품 그룹화
  const productsByCategory = {
    analysis: (dashboardProducts?.products || []).filter(p => p.category === 'analysis'),
    supplement: (dashboardProducts?.products || []).filter(p => p.category === 'supplement'),
    teamketo: (dashboardProducts?.products || []).filter(p => p.category === 'teamketo'),
    etc: (dashboardProducts?.products || []).filter(p => p.category !== 'analysis' && p.category !== 'supplement' && p.category !== 'teamketo')
  };

  const categoryLabels = {
    analysis: '분석 서비스',
    supplement: '건강기능식품',
    teamketo: '팀키토',
    etc: '기타'
  };

  return (
    <div className="space-y-6">
      {/* 매핑 통계 */}
      {mappingStats && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">매핑 현황</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">
                {mappingStats.mappingStats?.totalCombinations?.toLocaleString() || 0}
              </div>
              <div className="text-sm text-gray-500">전체 조합</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">
                {mappingStats.mappingStats?.mappedCombinations?.toLocaleString() || 0}
              </div>
              <div className="text-sm text-gray-500">매핑 완료</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600">
                {((mappingStats.mappingStats?.totalCombinations || 0) -
                  (mappingStats.mappingStats?.mappedCombinations || 0)).toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">미매핑</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">
                {mappingStats.mappingStats?.mappingRate || 0}%
              </div>
              <div className="text-sm text-gray-500">매핑률 (주문 기준)</div>
            </div>
          </div>
        </div>
      )}

      {/* 메인 탭 전환 */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <div className="flex">
            <button
              className={`px-6 py-3 font-medium ${
                activeTab === 'mapping'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => { setActiveTab('mapping'); setPage(1); }}
            >
              SKU 매핑
            </button>
            <button
              className={`px-6 py-3 font-medium ${
                activeTab === 'products'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => { setActiveTab('products'); }}
            >
              상품 관리
            </button>
          </div>
        </div>

        {/* 매핑 탭 */}
        {activeTab === 'mapping' && (
          <>
            {/* 서브 탭 전환 */}
            <div className="border-b bg-gray-50">
              <div className="flex px-4">
                <button
                  className={`px-4 py-2 text-sm font-medium ${
                    !showMapped
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-white -mb-px'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => { setShowMapped(false); setPage(1); clearSearch(); setSortBy('order_count'); }}
                >
                  미매핑 항목
                </button>
                <button
                  className={`px-4 py-2 text-sm font-medium ${
                    showMapped
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-white -mb-px'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => { setShowMapped(true); setPage(1); clearSearch(); setSortBy('order_count'); }}
                >
                  매핑 완료
                </button>
              </div>
            </div>

            {/* 검색 바 및 정렬 */}
            <div className="px-4 py-3 border-b bg-white">
              <div className="flex flex-wrap gap-3 items-center justify-between">
                {/* 검색 영역 */}
                <div className="flex gap-2 items-center flex-1">
                  <div className="relative flex-1 max-w-md">
                    <input
                      type="text"
                      placeholder="상품명 또는 옵션명으로 검색..."
                      className="w-full px-4 py-2 pr-10 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                    />
                    {searchInput && (
                      <button
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={clearSearch}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <button
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    onClick={handleSearch}
                  >
                    검색
                  </button>
                  {searchQuery && (
                    <span className="text-sm text-gray-500">
                      "{searchQuery}" 검색 결과
                    </span>
                  )}
                </div>

                {/* 정렬 버튼 */}
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-500 mr-1">정렬:</span>
                  <button
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      sortBy === 'order_count'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    onClick={() => handleSortChange('order_count')}
                  >
                    주문 건수
                  </button>
                  <button
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      sortBy === 'product_name'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    onClick={() => handleSortChange('product_name')}
                  >
                    상품명
                  </button>
                  <button
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      sortBy === 'option_name'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    onClick={() => handleSortChange('option_name')}
                  >
                    옵션명
                  </button>
                </div>
              </div>
            </div>

            {/* 테이블 */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      상품명
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      옵션명
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      주문 건수
                    </th>
                    {showMapped && (
                      <>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          매핑 상품
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          수량
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          유형
                        </th>
                      </>
                    )}
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan={showMapped ? 7 : 4} className="px-4 py-8 text-center text-gray-500">
                        로딩 중...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={showMapped ? 7 : 4} className="px-4 py-8 text-center text-gray-500">
                        {showMapped ? '매핑된 항목이 없습니다.' : '모든 항목이 매핑되었습니다.'}
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => (
                      <tr key={idx} className={selectedItem === item ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate" title={item.shop_sale_name}>
                          {item.shop_sale_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" title={item.shop_opt_name}>
                          {item.shop_opt_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {item.order_count?.toLocaleString()}
                        </td>
                        {showMapped && (
                          <>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {allProducts.find(p => p.code === item.product_code)?.name || item.product_code}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 text-center">
                              {item.quantity}
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                item.mapping_type === 'manual'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {item.mapping_type === 'manual' ? '수동' : '자동'}
                              </span>
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-sm text-center space-x-2">
                          <button
                            className="text-blue-600 hover:text-blue-800 font-medium"
                            onClick={() => {
                              setSelectedItem(item);
                              if (showMapped && item.product_code) {
                                // 수정 모드: 원본 상품코드 저장 (수동 매핑인 경우만)
                                if (item.mapping_type === 'manual') {
                                  setOriginalProductCode(item.product_code);
                                } else {
                                  setOriginalProductCode(null);
                                }
                                setMappings([{ product_code: item.product_code, quantity: item.quantity || 1 }]);
                              } else {
                                setOriginalProductCode(null);
                                setMappings([{ product_code: '', quantity: 1 }]);
                              }
                            }}
                          >
                            {showMapped ? '수정' : '매핑'}
                          </button>
                          {showMapped && item.mapping_type === 'manual' && (
                            <button
                              className="text-red-600 hover:text-red-800 font-medium"
                              onClick={() => handleDeleteMapping(item)}
                            >
                              삭제
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            {currentData?.pagination && (
              <div className="px-4 py-3 border-t flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  총 {currentData.pagination.total?.toLocaleString()}개 중{' '}
                  {((page - 1) * 20 + 1).toLocaleString()}-
                  {Math.min(page * 20, currentData.pagination.total).toLocaleString()}개 표시
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    이전
                  </button>
                  <span className="px-3 py-1 text-sm">
                    {page} / {currentData.pagination.totalPages}
                  </span>
                  <button
                    className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                    disabled={page >= currentData.pagination.totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* 상품 관리 탭 */}
        {activeTab === 'products' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                등록된 상품 ({dashboardProducts?.total || 0}개)
              </h3>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                onClick={() => {
                  setEditingProduct(null);
                  setProductForm({
                    product_code: '',
                    product_name: '',
                    category: 'supplement',
                    sort_order: 0,
                    keywords: []
                  });
                  setKeywordsInput('');
                  setShowProductModal(true);
                }}
              >
                + 신규 상품 등록
              </button>
            </div>

            {loadingProducts ? (
              <div className="text-center py-8 text-gray-500">로딩 중...</div>
            ) : (
              <div className="space-y-6">
                {/* 분석 서비스 */}
                {productsByCategory.analysis.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-3">분석 서비스 ({productsByCategory.analysis.length}개)</h4>
                    <p className="text-xs text-gray-400 mb-2">키워드를 기반으로 자동 매핑됩니다.</p>
                    <div className="bg-gray-50 rounded-lg overflow-hidden">
                      <table className="min-w-full">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">SKU 코드</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">상품명</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">매핑 키워드</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">정렬</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">상태</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">작업</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {productsByCategory.analysis.map(product => (
                            <tr key={product.id} className={!product.is_active ? 'bg-gray-100 opacity-60' : ''}>
                              <td className="px-4 py-2 text-sm font-mono">{product.product_code}</td>
                              <td className="px-4 py-2 text-sm">{product.product_name}</td>
                              <td className="px-4 py-2 text-sm text-gray-500 max-w-xs">
                                {(product.keywords || []).map((kw, i) => (
                                  <span key={i} className="inline-block bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs mr-1 mb-1">
                                    {kw}
                                  </span>
                                ))}
                              </td>
                              <td className="px-4 py-2 text-sm text-center">{product.sort_order}</td>
                              <td className="px-4 py-2 text-sm text-center">
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  product.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                                }`}>
                                  {product.is_active ? '활성' : '비활성'}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm text-center space-x-2">
                                <button
                                  className="text-blue-600 hover:text-blue-800"
                                  onClick={() => {
                                    setEditingProduct(product);
                                    setProductForm({
                                      product_code: product.product_code,
                                      product_name: product.product_name,
                                      category: product.category,
                                      sort_order: product.sort_order,
                                      keywords: product.keywords || []
                                    });
                                    setKeywordsInput((product.keywords || []).join(', '));
                                    setShowProductModal(true);
                                  }}
                                >
                                  수정
                                </button>
                                {product.is_active ? (
                                  <button
                                    className="text-red-600 hover:text-red-800"
                                    onClick={() => handleDeleteProduct(product)}
                                  >
                                    비활성화
                                  </button>
                                ) : (
                                  <button
                                    className="text-green-600 hover:text-green-800"
                                    onClick={() => handleActivateProduct(product)}
                                  >
                                    활성화
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 건강기능식품 */}
                {productsByCategory.supplement.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-3">건강기능식품 ({productsByCategory.supplement.length}개)</h4>
                    <p className="text-xs text-gray-400 mb-2">키워드를 기반으로 자동 매핑됩니다.</p>
                    <div className="bg-gray-50 rounded-lg overflow-hidden">
                      <table className="min-w-full">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">SKU 코드</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">상품명</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">매핑 키워드</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">정렬</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">상태</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">작업</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {productsByCategory.supplement.map(product => (
                            <tr key={product.id} className={!product.is_active ? 'bg-gray-100 opacity-60' : ''}>
                              <td className="px-4 py-2 text-sm font-mono">{product.product_code}</td>
                              <td className="px-4 py-2 text-sm">{product.product_name}</td>
                              <td className="px-4 py-2 text-sm text-gray-500 max-w-xs">
                                {(product.keywords || []).map((kw, i) => (
                                  <span key={i} className="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs mr-1 mb-1">
                                    {kw}
                                  </span>
                                ))}
                              </td>
                              <td className="px-4 py-2 text-sm text-center">{product.sort_order}</td>
                              <td className="px-4 py-2 text-sm text-center">
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  product.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                                }`}>
                                  {product.is_active ? '활성' : '비활성'}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm text-center space-x-2">
                                <button
                                  className="text-blue-600 hover:text-blue-800"
                                  onClick={() => {
                                    setEditingProduct(product);
                                    setProductForm({
                                      product_code: product.product_code,
                                      product_name: product.product_name,
                                      category: product.category,
                                      sort_order: product.sort_order,
                                      keywords: product.keywords || []
                                    });
                                    setKeywordsInput((product.keywords || []).join(', '));
                                    setShowProductModal(true);
                                  }}
                                >
                                  수정
                                </button>
                                {product.is_active ? (
                                  <button
                                    className="text-red-600 hover:text-red-800"
                                    onClick={() => handleDeleteProduct(product)}
                                  >
                                    비활성화
                                  </button>
                                ) : (
                                  <button
                                    className="text-green-600 hover:text-green-800"
                                    onClick={() => handleActivateProduct(product)}
                                  >
                                    활성화
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 팀키토 */}
                {productsByCategory.teamketo.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-3">팀키토 ({productsByCategory.teamketo.length}개)</h4>
                    <p className="text-xs text-gray-400 mb-2">키워드를 기반으로 자동 매핑됩니다.</p>
                    <div className="bg-gray-50 rounded-lg overflow-hidden">
                      <table className="min-w-full">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">SKU 코드</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">상품명</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">매핑 키워드</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">정렬</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">상태</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">작업</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {productsByCategory.teamketo.map(product => (
                            <tr key={product.id} className={!product.is_active ? 'bg-gray-100 opacity-60' : ''}>
                              <td className="px-4 py-2 text-sm font-mono">{product.product_code}</td>
                              <td className="px-4 py-2 text-sm">{product.product_name}</td>
                              <td className="px-4 py-2 text-sm text-gray-500 max-w-xs">
                                {(product.keywords || []).map((kw, i) => (
                                  <span key={i} className="inline-block bg-orange-50 text-orange-700 px-2 py-0.5 rounded text-xs mr-1 mb-1">
                                    {kw}
                                  </span>
                                ))}
                              </td>
                              <td className="px-4 py-2 text-sm text-center">{product.sort_order}</td>
                              <td className="px-4 py-2 text-sm text-center">
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  product.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                                }`}>
                                  {product.is_active ? '활성' : '비활성'}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm text-center space-x-2">
                                <button
                                  className="text-blue-600 hover:text-blue-800"
                                  onClick={() => {
                                    setEditingProduct(product);
                                    setProductForm({
                                      product_code: product.product_code,
                                      product_name: product.product_name,
                                      category: product.category,
                                      sort_order: product.sort_order,
                                      keywords: product.keywords || []
                                    });
                                    setKeywordsInput((product.keywords || []).join(', '));
                                    setShowProductModal(true);
                                  }}
                                >
                                  수정
                                </button>
                                {product.is_active ? (
                                  <button
                                    className="text-red-600 hover:text-red-800"
                                    onClick={() => handleDeleteProduct(product)}
                                  >
                                    비활성화
                                  </button>
                                ) : (
                                  <button
                                    className="text-green-600 hover:text-green-800"
                                    onClick={() => handleActivateProduct(product)}
                                  >
                                    활성화
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 기타 */}
                {productsByCategory.etc.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-3">기타 ({productsByCategory.etc.length}개)</h4>
                    <p className="text-xs text-gray-400 mb-2">키워드를 기반으로 자동 매핑됩니다.</p>
                    <div className="bg-gray-50 rounded-lg overflow-hidden">
                      <table className="min-w-full">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">SKU 코드</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">상품명</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">매핑 키워드</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">정렬</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">상태</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">작업</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {productsByCategory.etc.map(product => (
                            <tr key={product.id} className={!product.is_active ? 'bg-gray-100 opacity-60' : ''}>
                              <td className="px-4 py-2 text-sm font-mono">{product.product_code}</td>
                              <td className="px-4 py-2 text-sm">{product.product_name}</td>
                              <td className="px-4 py-2 text-sm">
                                <div className="flex flex-wrap gap-1">
                                  {(product.keywords || []).map((kw, idx) => (
                                    <span key={idx} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-sm text-center">{product.sort_order}</td>
                              <td className="px-4 py-2 text-sm text-center">
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  product.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                                }`}>
                                  {product.is_active ? '활성' : '비활성'}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm text-center space-x-2">
                                <button
                                  className="text-blue-600 hover:text-blue-800"
                                  onClick={() => {
                                    setEditingProduct(product);
                                    setProductForm({
                                      product_code: product.product_code,
                                      product_name: product.product_name,
                                      category: product.category,
                                      sort_order: product.sort_order,
                                      keywords: product.keywords || []
                                    });
                                    setKeywordsInput((product.keywords || []).join(', '));
                                    setShowProductModal(true);
                                  }}
                                >
                                  수정
                                </button>
                                {product.is_active ? (
                                  <button
                                    className="text-red-600 hover:text-red-800"
                                    onClick={() => handleDeleteProduct(product)}
                                  >
                                    비활성화
                                  </button>
                                ) : (
                                  <button
                                    className="text-green-600 hover:text-green-800"
                                    onClick={() => handleActivateProduct(product)}
                                  >
                                    활성화
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 매핑 입력 모달 */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">수동 매핑 설정</h3>
              <p className="text-sm text-gray-500 mt-1">
                복합 상품의 경우 여러 상품을 추가할 수 있습니다.
              </p>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">상품명</label>
                <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                  {selectedItem.shop_sale_name}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">옵션명</label>
                <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                  {selectedItem.shop_opt_name || '-'}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    매핑할 상품 ({validMappingsCount}개 선택됨)
                  </label>
                  <button
                    type="button"
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    onClick={addMapping}
                  >
                    + 상품 추가
                  </button>
                </div>

                <div className="space-y-3">
                  {mappings.map((mapping, index) => {
                    const available = getAvailableProducts(index);
                    return (
                      <div key={index} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <select
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={mapping.product_code}
                            onChange={(e) => updateMapping(index, 'product_code', e.target.value)}
                          >
                            <option value="">-- 상품 선택 --</option>
                            {available.analysis.length > 0 && (
                              <optgroup label="분석 서비스">
                                {available.analysis.map(p => (
                                  <option key={p.code} value={p.code}>
                                    {p.code} - {p.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {available.supplements.length > 0 && (
                              <optgroup label="건강기능식품">
                                {available.supplements.map(p => (
                                  <option key={p.code} value={p.code}>
                                    {p.code} - {p.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {available.teamketo?.length > 0 && (
                              <optgroup label="팀키토">
                                {available.teamketo.map(p => (
                                  <option key={p.code} value={p.code}>
                                    {p.code} - {p.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {available.etc?.length > 0 && (
                              <optgroup label="기타">
                                {available.etc.map(p => (
                                  <option key={p.code} value={p.code}>
                                    {p.code} - {p.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </div>
                        <div className="w-24">
                          <input
                            type="number"
                            min="1"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={mapping.quantity}
                            onChange={(e) => updateMapping(index, 'quantity', e.target.value)}
                            placeholder="수량"
                          />
                        </div>
                        <button
                          type="button"
                          className={`p-2 text-red-500 hover:text-red-700 ${
                            mappings.length === 1 ? 'opacity-30 cursor-not-allowed' : ''
                          }`}
                          onClick={() => removeMapping(index)}
                          disabled={mappings.length === 1}
                          title="삭제"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
                onClick={() => {
                  setSelectedItem(null);
                  setOriginalProductCode(null);
                  setMappings([{ product_code: '', quantity: 1 }]);
                }}
              >
                취소
              </button>
              <button
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                disabled={validMappingsCount === 0 || isSaving}
                onClick={handleSave}
              >
                {isSaving ? '저장 중...' : `저장 (${validMappingsCount}개 상품)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상품 추가/수정 모달 */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingProduct ? '상품 수정' : '신규 상품 등록'}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU 코드 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={productForm.product_code}
                  onChange={(e) => setProductForm({ ...productForm, product_code: e.target.value.toUpperCase() })}
                  placeholder="예: BHN000010"
                  disabled={editingProduct}
                />
                {editingProduct && (
                  <p className="text-xs text-gray-500 mt-1">SKU 코드는 수정할 수 없습니다.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  상품명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={productForm.product_name}
                  onChange={(e) => setProductForm({ ...productForm, product_name: e.target.value })}
                  placeholder="상품명 입력"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={productForm.category}
                  onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                >
                  <option value="analysis">분석 서비스</option>
                  <option value="supplement">건강기능식품</option>
                  <option value="teamketo">팀키토</option>
                  <option value="etc">기타</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">정렬 순서</label>
                <input
                  type="number"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={productForm.sort_order}
                  onChange={(e) => setProductForm({ ...productForm, sort_order: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">낮은 숫자가 먼저 표시됩니다.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  매핑 키워드 <span className="text-blue-500">(자동 매핑용)</span>
                </label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                  placeholder={productForm.category === 'analysis' ? '예: 과민증, 지연성, 음식물' : '예: 바이오밸런스, 바이오 밸런스'}
                />
                <p className="text-xs text-gray-500 mt-1">
                  쉼표(,)로 구분하여 여러 키워드 입력 가능. 비워두면 상품명이 기본 키워드로 사용됩니다.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
                onClick={() => {
                  setShowProductModal(false);
                  setEditingProduct(null);
                }}
              >
                취소
              </button>
              <button
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                disabled={isSaving || !productForm.product_code || !productForm.product_name}
                onClick={handleSaveProduct}
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MappingManager;
