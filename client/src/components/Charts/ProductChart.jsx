import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

function ProductChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        데이터가 없습니다
      </div>
    );
  }

  // 상위 10개만 차트에 표시
  const chartData = data.slice(0, 10).map(product => ({
    name: product.productName,
    fullName: product.productName,
    매출: product.totalRevenue,
    판매량: product.totalQuantity,
    주문수: product.orderCount,
    평균가: product.avgPrice
  }));

  const formatCurrency = (value) => {
    if (value >= 100000000) {
      return `${(value / 100000000).toFixed(1)}억`;
    }
    if (value >= 10000) {
      return `${(value / 10000).toFixed(0)}만`;
    }
    return value.toLocaleString();
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 shadow-lg rounded border text-sm max-w-xs">
          <p className="font-semibold text-gray-800 break-words">{data.fullName}</p>
          <p className="text-blue-600">매출: ₩{data.매출?.toLocaleString()}</p>
          <p className="text-green-600">판매량: {data.판매량?.toLocaleString()}개</p>
          <p className="text-purple-600">주문수: {data.주문수?.toLocaleString()}건</p>
          <p className="text-gray-500">평균가: ₩{data.평균가?.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      {/* 차트 */}
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" tickFormatter={formatCurrency} />
          <YAxis
            type="category"
            dataKey="name"
            width={180}
            tick={{ fontSize: 10 }}
            interval={0}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="매출" fill="#10B981" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* 테이블 */}
      <div className="mt-4 max-h-64 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="text-left p-2 w-8">#</th>
              <th className="text-left p-2">상품명</th>
              <th className="text-right p-2">매출</th>
              <th className="text-right p-2">판매량</th>
            </tr>
          </thead>
          <tbody>
            {data.map((product) => (
              <tr key={`${product.productName}-${product.shop_cd}`} className="border-t hover:bg-gray-50">
                <td className="p-2 text-gray-400">{product.rank}</td>
                <td className="p-2">
                  <div className="truncate max-w-xs" title={product.productName}>
                    {product.productName}
                  </div>
                  <div className="text-xs text-gray-400">{product.shop_name}</div>
                </td>
                <td className="text-right p-2 number-format whitespace-nowrap">
                  ₩{product.totalRevenue?.toLocaleString()}
                </td>
                <td className="text-right p-2 number-format">
                  {product.totalQuantity?.toLocaleString()}개
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProductChart;
