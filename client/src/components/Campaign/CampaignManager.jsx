import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  calculateCampaignActual,
  getDashboardProducts
} from '../../services/api';

function CampaignManager() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    influencer_name: '',
    start_date: '',
    end_date: '',
    expected_revenue: '',
    manual_actual_revenue: '', // 수기 입력 실제 공구 매출
    status: 'planned',
    notes: '',
    products: [] // [{ product_code, expected_quantity }]
  });
  const [loadingProducts, setLoadingProducts] = useState(false);

  // 공구 목록 조회
  const { data: campaignsData, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => getCampaigns({ include_past: 'true' })
  });

  // 대시보드 상품 목록 조회
  const { data: productsData } = useQuery({
    queryKey: ['dashboardProducts'],
    queryFn: () => getDashboardProducts({ include_inactive: false })
  });

  const availableProducts = productsData?.products || [];

  const campaigns = campaignsData?.campaigns || [];

  // 폼 초기화
  const resetForm = () => {
    setFormData({
      name: '',
      influencer_name: '',
      start_date: '',
      end_date: '',
      expected_revenue: '',
      manual_actual_revenue: '',
      status: 'planned',
      notes: '',
      products: []
    });
    setEditingCampaign(null);
  };

  // 모달 열기 (신규)
  const openNewModal = () => {
    resetForm();
    setShowModal(true);
  };

  // 모달 열기 (수정)
  const openEditModal = async (campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      influencer_name: campaign.influencer_name || '',
      start_date: campaign.start_date?.split('T')[0] || '',
      end_date: campaign.end_date?.split('T')[0] || '',
      expected_revenue: campaign.expected_revenue || '',
      manual_actual_revenue: campaign.manual_actual_revenue || '',
      status: campaign.status,
      notes: campaign.notes || '',
      products: []
    });
    setShowModal(true);

    // 공구 상세 정보 (상품 목록 포함) 로드
    setLoadingProducts(true);
    try {
      const detail = await getCampaign(campaign.id);
      if (detail.products) {
        setFormData(prev => ({
          ...prev,
          products: detail.products.map(p => ({
            product_code: p.product_code,
            expected_quantity: p.expected_quantity || 0,
            notes: p.notes || ''
          }))
        }));
      }
    } catch (error) {
      console.error('Error loading campaign products:', error);
    } finally {
      setLoadingProducts(false);
    }
  };

  // 저장
  const handleSave = async () => {
    if (!formData.name || !formData.start_date || !formData.end_date) {
      alert('공구명, 시작일, 종료일은 필수입니다.');
      return;
    }

    setIsSaving(true);
    try {
      const dataToSave = {
        name: formData.name,
        influencer_name: formData.influencer_name,
        start_date: formData.start_date,
        end_date: formData.end_date,
        expected_revenue: parseInt(formData.expected_revenue) || 0,
        manual_actual_revenue: formData.manual_actual_revenue ? parseInt(formData.manual_actual_revenue) : null,
        status: formData.status,
        notes: formData.notes,
        products: formData.products.filter(p => p.product_code) // 빈 항목 제외
      };

      if (editingCampaign) {
        await updateCampaign(editingCampaign.id, dataToSave);
      } else {
        await createCampaign(dataToSave);
      }

      queryClient.invalidateQueries(['campaigns']);
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error('Error saving campaign:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // 상품 선택 토글
  const toggleProduct = (productCode) => {
    const existingIndex = formData.products.findIndex(p => p.product_code === productCode);
    if (existingIndex >= 0) {
      // 이미 있으면 제거
      setFormData({
        ...formData,
        products: formData.products.filter(p => p.product_code !== productCode)
      });
    } else {
      // 없으면 추가
      setFormData({
        ...formData,
        products: [...formData.products, { product_code: productCode, expected_quantity: 0, notes: '' }]
      });
    }
  };

  // 상품 예상 수량 변경
  const updateProductQuantity = (productCode, quantity) => {
    setFormData({
      ...formData,
      products: formData.products.map(p =>
        p.product_code === productCode
          ? { ...p, expected_quantity: parseInt(quantity) || 0 }
          : p
      )
    });
  };

  // 선택된 상품인지 확인
  const isProductSelected = (productCode) => {
    return formData.products.some(p => p.product_code === productCode);
  };

  // 선택된 상품의 예상 수량 가져오기
  const getProductQuantity = (productCode) => {
    const product = formData.products.find(p => p.product_code === productCode);
    return product?.expected_quantity || 0;
  };

  // 삭제
  const handleDelete = async (campaign) => {
    if (!confirm(`"${campaign.name}" 공구를 삭제하시겠습니까?`)) return;

    try {
      await deleteCampaign(campaign.id);
      queryClient.invalidateQueries(['campaigns']);
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // 실제 매출 계산
  const handleCalculateActual = async (campaign) => {
    try {
      await calculateCampaignActual(campaign.id);
      queryClient.invalidateQueries(['campaigns']);
      alert('실제 매출이 계산되었습니다.');
    } catch (error) {
      console.error('Error calculating actual:', error);
      alert('계산 중 오류가 발생했습니다.');
    }
  };

  // 상태별 색상
  const getStatusColor = (status) => {
    switch (status) {
      case 'planned': return 'bg-blue-100 text-blue-800';
      case 'active': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'planned': return '예정';
      case 'active': return '진행중';
      case 'completed': return '완료';
      case 'cancelled': return '취소';
      default: return status;
    }
  };

  // 기간 상태 표시
  const getPeriodBadge = (periodStatus) => {
    switch (periodStatus) {
      case 'active': return <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded">진행중</span>;
      case 'upcoming': return <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded">예정</span>;
      case 'past': return <span className="text-xs bg-gray-400 text-white px-2 py-0.5 rounded">종료</span>;
      default: return null;
    }
  };

  // 통계 계산
  const stats = {
    total: campaigns.length,
    upcoming: campaigns.filter(c => c.period_status === 'upcoming').length,
    active: campaigns.filter(c => c.period_status === 'active').length,
    totalExpected: campaigns.filter(c => c.period_status === 'upcoming' || c.period_status === 'active')
      .reduce((sum, c) => sum + (parseInt(c.expected_revenue) || 0), 0)
  };

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-500">전체 공구</div>
        </div>
        <div className="bg-blue-50 rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-blue-600">{stats.upcoming}</div>
          <div className="text-sm text-gray-500">예정된 공구</div>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          <div className="text-sm text-gray-500">진행중 공구</div>
        </div>
        <div className="bg-orange-50 rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-orange-600">
            {(stats.totalExpected / 100000000).toFixed(1)}억
          </div>
          <div className="text-sm text-gray-500">예상 매출 (예정+진행)</div>
        </div>
      </div>

      {/* 공구 목록 */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">공구 일정 관리</h2>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            onClick={openNewModal}
          >
            + 공구 등록
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">공구명</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">인플루언서</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">기간</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">상품수</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">예상 매출</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">기간 전체</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">공구 매출</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">달성률</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">작업</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    로딩 중...
                  </td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    등록된 공구가 없습니다.
                  </td>
                </tr>
              ) : (
                campaigns.map(campaign => {
                  const expected = parseInt(campaign.expected_revenue) || 0;
                  const periodTotal = parseInt(campaign.actual_revenue) || 0; // 기간 전체 매출
                  const manualActual = campaign.manual_actual_revenue !== null
                    ? parseInt(campaign.manual_actual_revenue)
                    : null; // 수기 입력 공구 매출
                  // 달성률: 수기 입력이 있으면 그것 기준, 없으면 기간 전체 기준
                  const actualForAchievement = manualActual !== null ? manualActual : periodTotal;
                  const achievement = expected > 0 ? Math.round((actualForAchievement / expected) * 100) : 0;
                  // 공구 비율 (기간 전체 대비 공구 매출)
                  const campaignRatio = (manualActual !== null && periodTotal > 0)
                    ? Math.round((manualActual / periodTotal) * 100)
                    : null;

                  return (
                    <tr key={campaign.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getPeriodBadge(campaign.period_status)}
                          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(campaign.status)}`}>
                            {getStatusLabel(campaign.status)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {campaign.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {campaign.influencer_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {campaign.start_date?.split('T')[0]} ~ {campaign.end_date?.split('T')[0]}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        {campaign.product_count > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {campaign.product_count}종
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {expected > 0 ? `${(expected / 10000).toLocaleString()}만` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 text-right">
                        {periodTotal > 0 ? `${(periodTotal / 10000).toLocaleString()}만` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {manualActual !== null ? (
                          <div>
                            <span className="font-medium text-blue-600">
                              {(manualActual / 10000).toLocaleString()}만
                            </span>
                            {campaignRatio !== null && (
                              <span className="text-xs text-gray-400 ml-1">
                                ({campaignRatio}%)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">미입력</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {expected > 0 ? (
                          <span className={`text-sm font-medium ${
                            achievement >= 100 ? 'text-green-600' :
                            achievement >= 80 ? 'text-blue-600' :
                            achievement > 0 ? 'text-orange-600' : 'text-gray-400'
                          }`}>
                            {achievement}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            className="text-blue-600 hover:text-blue-800 text-sm"
                            onClick={() => openEditModal(campaign)}
                          >
                            수정
                          </button>
                          {campaign.period_status === 'past' && (
                            <button
                              className="text-green-600 hover:text-green-800 text-sm"
                              onClick={() => handleCalculateActual(campaign)}
                            >
                              정산
                            </button>
                          )}
                          <button
                            className="text-red-600 hover:text-red-800 text-sm"
                            onClick={() => handleDelete(campaign)}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 공구 등록/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingCampaign ? '공구 수정' : '공구 등록'}
              </h3>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-6">
                {/* 왼쪽: 기본 정보 */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      공구명 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="예: 송율공구 5차"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      인플루언서
                    </label>
                    <input
                      type="text"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.influencer_name}
                      onChange={(e) => setFormData({ ...formData, influencer_name: e.target.value })}
                      placeholder="예: 송율"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        시작일 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        종료일 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      예상 매출 (원)
                    </label>
                    <input
                      type="number"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.expected_revenue}
                      onChange={(e) => setFormData({ ...formData, expected_revenue: e.target.value })}
                      placeholder="예: 50000000 (5천만원)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      실제 공구 매출 (원)
                      <span className="text-xs text-gray-400 font-normal ml-1">수기 입력</span>
                    </label>
                    <input
                      type="number"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.manual_actual_revenue}
                      onChange={(e) => setFormData({ ...formData, manual_actual_revenue: e.target.value })}
                      placeholder="공구로 발생한 실제 매출 (판매예측에 사용)"
                    />
                    {editingCampaign?.actual_revenue > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        기간 전체 매출: {(editingCampaign.actual_revenue / 10000).toLocaleString()}만원
                        {formData.manual_actual_revenue && editingCampaign.actual_revenue > 0 && (
                          <span className="ml-2 text-blue-600">
                            (공구 비율: {Math.round((parseInt(formData.manual_actual_revenue) / editingCampaign.actual_revenue) * 100)}%)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      상태
                    </label>
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="planned">예정</option>
                      <option value="active">진행중</option>
                      <option value="completed">완료</option>
                      <option value="cancelled">취소</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      메모
                    </label>
                    <textarea
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      placeholder="추가 메모..."
                    />
                  </div>
                </div>

                {/* 오른쪽: 상품 선택 */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      취급 상품 선택
                      <span className="ml-2 text-xs text-gray-400 font-normal">
                        (선택: {formData.products.length}종)
                      </span>
                    </label>
                    {loadingProducts ? (
                      <div className="text-sm text-gray-500 p-4 text-center">상품 정보 로딩 중...</div>
                    ) : availableProducts.length === 0 ? (
                      <div className="text-sm text-gray-500 p-4 text-center border rounded-lg bg-gray-50">
                        등록된 상품이 없습니다.<br />
                        <span className="text-xs">먼저 대시보드 상품을 등록해주세요.</span>
                      </div>
                    ) : (
                      <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                        {/* 카테고리별로 그룹핑 */}
                        {Object.entries(
                          availableProducts.reduce((acc, product) => {
                            const category = product.category || '기타';
                            if (!acc[category]) acc[category] = [];
                            acc[category].push(product);
                            return acc;
                          }, {})
                        ).map(([category, products]) => (
                          <div key={category} className="border-b last:border-b-0">
                            <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 sticky top-0">
                              {category}
                            </div>
                            {products.map(product => (
                              <div
                                key={product.product_code}
                                className={`flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 ${
                                  isProductSelected(product.product_code) ? 'bg-blue-50' : ''
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isProductSelected(product.product_code)}
                                  onChange={() => toggleProduct(product.product_code)}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">
                                    {product.product_name}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {product.product_code}
                                  </div>
                                </div>
                                {isProductSelected(product.product_code) && (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      className="w-20 border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      value={getProductQuantity(product.product_code)}
                                      onChange={(e) => updateProductQuantity(product.product_code, e.target.value)}
                                      placeholder="예상수량"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <span className="text-xs text-gray-500">개</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 선택된 상품 요약 */}
                  {formData.products.length > 0 && (
                    <div className="bg-blue-50 rounded-lg p-3">
                      <div className="text-xs font-medium text-blue-800 mb-2">선택된 상품 ({formData.products.length}종)</div>
                      <div className="space-y-1">
                        {formData.products.map(p => {
                          const product = availableProducts.find(ap => ap.product_code === p.product_code);
                          return (
                            <div key={p.product_code} className="flex justify-between text-xs text-blue-700">
                              <span className="truncate flex-1">{product?.product_name || p.product_code}</span>
                              <span className="ml-2">{p.expected_quantity > 0 ? `${p.expected_quantity.toLocaleString()}개` : '-'}</span>
                            </div>
                          );
                        })}
                        <div className="border-t border-blue-200 pt-1 mt-1 flex justify-between text-xs font-medium text-blue-800">
                          <span>총 예상 수량</span>
                          <span>{formData.products.reduce((sum, p) => sum + (p.expected_quantity || 0), 0).toLocaleString()}개</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
                onClick={() => { setShowModal(false); resetForm(); }}
              >
                취소
              </button>
              <button
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                disabled={isSaving}
                onClick={handleSave}
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

export default CampaignManager;
