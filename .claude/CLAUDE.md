# 플레이오토 주문 분석 대시보드 프로젝트

## 프로젝트 개요
플레이오토 Open API를 활용하여 바이오컴의 스토어별/상품별 판매 분석 및 추이 예측이 가능한 웹 대시보드

## 현재 상태 (2026-01-15)
- **백엔드**: ✅ 구현 완료, localhost:3001에서 실행 중
- **프론트엔드**: ✅ 구현 완료, localhost:5174에서 실행 중
- **데이터 동기화**: ✅ 정상 작동 (12개 쇼핑몰, 27,609건 주문, 5개월+ 데이터)
- **자동 스케줄러**: ✅ 구현 완료 (매일 3시 증분, 매주 일요일 4시 전체 검증)
- **Playwright MCP**: ✅ 연결됨
- **상품 마스터**: ✅ 164개 SKU 등록

---

## 기술 스택

### Backend (server/)
- Node.js + Express
- **PostgreSQL** (pg 라이브러리)
  - 호스트: 15.164.112.237:5432
  - 데이터베이스: dashboard
  - 스키마: playauto_platform
- xlsx (엑셀 생성)
- node-cron (자동 스케줄링)
- dotenv (환경변수)

### Frontend (client/)
- React 18 + Vite
- Tailwind CSS
- Recharts (차트)
- @tanstack/react-query (상태관리)
- axios (HTTP 클라이언트)
- date-fns (날짜 처리)

---

## 프로젝트 구조

```
PLAYAUTO_주문내역/
├── server/                 # Express 백엔드
│   ├── app.js              # 서버 진입점 (포트 3001)
│   ├── routes/
│   │   ├── shops.js        # 쇼핑몰 목록 API
│   │   ├── orders.js       # 주문 조회 API (페이징, 필터링)
│   │   ├── sync.js         # 데이터 동기화 API
│   │   ├── stats.js        # 통계 API (summary, by-store, by-product, trend, forecast)
│   │   └── reports.js      # 엑셀/CSV 다운로드 API
│   └── services/
│       ├── database.js     # PostgreSQL 연결 (스키마: playauto_platform)
│       ├── playauto.js     # 플레이오토 API 래퍼 (토큰 캐싱)
│       └── scheduler.js    # 자동 동기화 스케줄러 (node-cron)
│
├── client/                 # React 프론트엔드 (Vite, 포트 5174)
│   ├── src/
│   │   ├── App.jsx         # 메인 앱 (날짜범위, 쇼핑몰 필터 상태관리)
│   │   ├── main.jsx        # 엔트리포인트 (QueryClient 설정)
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   │   └── Layout.jsx          # 레이아웃 (헤더, 사이드바)
│   │   │   ├── Dashboard/
│   │   │   │   ├── Dashboard.jsx       # 대시보드 메인 (모든 차트 통합)
│   │   │   │   ├── SyncPanel.jsx       # 동기화 패널 (스마트/전체/스케줄러)
│   │   │   │   ├── SummaryCards.jsx    # 요약 카드 (주문수, 매출, 판매량, 객단가)
│   │   │   │   └── DateFilter.jsx      # 날짜 필터 + 쇼핑몰 필터 + 엑셀 다운로드
│   │   │   └── Charts/
│   │   │       ├── StoreChart.jsx      # 스토어별 매출 (막대/파이 차트)
│   │   │       ├── ProductChart.jsx    # 상품별 판매 TOP 20
│   │   │       ├── TrendChart.jsx      # 매출/주문 추이 그래프
│   │   │       └── ForecastChart.jsx   # 30일 판매 예측 차트
│   │   └── services/
│   │       └── api.js      # API 호출 함수 (axios 기반)
│   ├── index.html
│   └── vite.config.js      # Vite 설정 (프록시: /api → localhost:3001)
│
├── tests/                  # Playwright 테스트
│   ├── dashboard.spec.js
│   └── screenshots/
│
├── .claude/                # 프로젝트 문서
│   ├── CLAUDE.md           # 이 파일
│   └── PLAYAUTO_API.md     # 플레이오토 API 문서
│
├── .env                    # API 키 설정
└── README.md
```

---

## 환경 변수 (.env)

```env
# 플레이오토 API
PLAYAUTO_API_KEY=GqOHPcT90B3RmzPtF6xWQ5kDhaYcpImx8UcDtj3t
PLAYAUTO_EMAIL=jinman@biocom.kr
PLAYAUTO_PASSWORD=bico1016!
PLAYAUTO_BASE_URL=https://openapi.playauto.io/api

# 서버
PORT=3001

# PostgreSQL (database.js에 하드코딩됨, 필요시 환경변수로 전환)
# DB_HOST=15.164.112.237
# DB_PORT=5432
# DB_USER=postgres
# DB_PASSWORD=bico0211
# DB_NAME=dashboard
```

---

## 실행 방법

```bash
# 서버 실행 (터미널 1)
cd server && npm run dev

# 클라이언트 실행 (터미널 2)
cd client && npm run dev

# 브라우저 접속
http://localhost:5174
```

---

## 구현된 기능

### 1. 데이터 동기화
- POST /api/sync - 전체 동기화 (기간 지정)
- POST /api/sync/incremental - 최근 7일 증분 동기화
- POST /api/sync/yearly - 월별 분할 동기화 (1년)
- POST /api/sync/weekly - 주간(7일) 분할 동기화 (최대 5개월)
- POST /api/sync/smart - 스마트 증분 동기화 (마지막 동기화 이후 + 2일 버퍼)
- POST /api/sync/validation - 전체 검증 동기화 (5개월 전체 재검증)
- GET /api/sync/status - 동기화 상태 확인
- GET /api/sync/history - 동기화 이력 조회
- GET /api/sync/scheduler - 자동 스케줄러 상태 확인

### 1-1. 쇼핑몰 관리
- GET /api/shops - 쇼핑몰 목록 조회 (DB)
- POST /api/shops/refresh - 쇼핑몰 목록 새로고침 (API → DB)

### 2. 자동 스케줄링 (node-cron)
- **일별 증분 동기화**: 매일 새벽 3시 자동 실행
- **주간 전체 검증**: 매주 일요일 새벽 4시 (5개월 데이터 재검증)
- 스마트 동기화: 마지막 동기화 이후 변경분만 수집 (2일 버퍼로 소급 입력 대응)

### 2-1. 주문 API
- GET /api/orders - 주문 목록 조회 (페이징, 필터링 지원)
- GET /api/orders/:uniq - 주문 상세 조회

### 2-2. Health Check
- GET /api/health - 서버 상태 확인

### 3. 통계 API
- GET /api/stats/summary - 전체 요약 (총 주문, 매출 등)
- GET /api/stats/by-store - 스토어별 매출/주문
- GET /api/stats/by-product - 상품별 판매 순위
- GET /api/stats/trend - 일별/월별/주별 추이
- GET /api/stats/forecast - 이동평균 기반 예측

### 4. 리포트
- GET /api/reports/excel - 엑셀 다운로드 (다중 시트)
- GET /api/reports/csv - CSV 다운로드

### 5. 프론트엔드 차트
- 스토어별 매출 (막대/파이 차트)
- 상품별 판매 TOP 20
- 매출/주문 추이 그래프
- 30일 판매 예측 차트

---

## 연동된 쇼핑몰 (12개)

| shop_cd | shop_name | seller_nick |
|---------|-----------|-------------|
| 1005 | 아임웹-B | 바이오컴펫 자사몰 |
| 1077 | 스마트스토어-B | 미리바이오 스마트스토어 |
| 2005 | 아임웹-C | 더클린커피 자사몰 |
| 3005 | 아임웹-D | 에이아이바이오 자사몰 |
| 4005 | 아임웹-E | 미리바이오 자사몰 |
| A077 | 스마트스토어 | 더클린스토어 스마트스토어 |
| A100 | 롯데아이몰 | - |
| B005 | 아임웹 | 바이오컴 자사몰 |
| B378 | 쿠팡 | 쿠팡 (2개 계정) |

---

## 해결된 이슈

### 1. 일부 스토어 매출 0원 표시 (2026-01-12 해결)
- **증상**: 아임웹, 쿠팡 등 일부 스토어 매출이 ₩0으로 표시
- **원인**:
  - `pay_amt`(결제금액) 필드가 아임웹/쿠팡에서 0으로 들어옴
  - `sales`(판매금액) 필드에는 정상 값이 있음
- **해결**: `server/routes/stats.js`에서 `SUM(pay_amt)` → `SUM(sales)`로 변경
- **결과**: 총 매출 ₩14,351,800 → ₩227,214,200 (정상 표시)

### 2. 주문 조회 API 500 에러 (해결됨)
- **증상**: 동기화 시 "Failed to get orders: 500" 에러
- **해결**: 일시적인 API 서버 문제였으며 현재 정상 작동

### 3. PlayAuto API 기간 제한 (2026-01-12 해결)
- **증상**: 7일 이상 기간 조회 시 500 에러 발생
- **제한**: API가 **7일 단위, 최대 5-6개월** 과거 데이터만 제공
- **테스트 결과**:
  - 7일 이내 요청: ✅ 성공
  - 7일 초과 요청: ❌ 500 에러
  - 6개월 이전 데이터: ❌ 500 에러
- **해결**:
  - 주간(7일) 분할 동기화 구현 (`POST /api/sync/weekly`)
  - 매일 새벽 3시 자동 증분 동기화 (node-cron)
  - 매주 일요일 새벽 4시 전체 검증 동기화

---

## 알려진 제한사항

### 1. Playwright 테스트 selector 경고
- **증상**: 동일 텍스트의 버튼이 여러 개 있어서 strict mode 위반
- **해결**: exact: true 옵션 사용 또는 더 구체적인 selector 사용

### 2. pay_amt vs sales 필드 차이
- **아임웹/쿠팡**: `pay_amt` = 0, `sales` = 실제 판매금액
- **스마트스토어**: `pay_amt` = 결제금액, `sales` = 판매금액 (둘 다 값 있음)
- **통계 조회 시**: `sales` 필드를 기준으로 매출 계산

### 3. PlayAuto API 제한
- 한 번 요청에 최대 7일 기간만 조회 가능
- 약 5-6개월 이전 데이터는 접근 불가
- 자동 스케줄링으로 데이터 누적 저장하여 대응

---

## 다음 작업

1. **프로덕션 배포**
   - PM2로 서버 프로세스 관리 (자동 재시작, 클러스터 모드)
   - 환경 변수 분리 (개발/운영)
   - Nginx 리버스 프록시 설정

2. **알림 시스템**
   - 동기화 실패 시 Slack/Email 알림
   - 매출 목표 달성 알림

3. **UI 개선**
   - 스토어 필터링 기능 강화
   - 상품 상세 분석 페이지
   - 반응형 모바일 지원

---

## 참고 문서

- **플레이오토 API 문서**: `.claude/PLAYAUTO_API.md` (2026-01-12 분석)
- 플레이오토 API 가이드: `플레이오토_주문_조회_API_활용_가이드.pdf`
- 구현 계획: `.claude/plans/enchanted-floating-kay.md`

---

## 빠른 명령어

```bash
# 서버 상태 확인
curl http://localhost:3001/api/health

# 동기화 상태 확인
curl http://localhost:3001/api/sync/status

# 스케줄러 상태 확인
curl http://localhost:3001/api/sync/scheduler

# 동기화 이력 조회
curl http://localhost:3001/api/sync/history

# 쇼핑몰 목록 조회
curl http://localhost:3001/api/shops

# 쇼핑몰 목록 새로고침
curl -X POST http://localhost:3001/api/shops/refresh

# 스마트 증분 동기화 실행 (권장)
curl -X POST http://localhost:3001/api/sync/smart

# 최근 7일 동기화 실행
curl -X POST http://localhost:3001/api/sync/incremental

# 5개월 데이터 수집 (주간 분할)
curl -X POST http://localhost:3001/api/sync/weekly

# 전체 검증 동기화 (5개월 재검증)
curl -X POST http://localhost:3001/api/sync/validation

# 통계 요약 조회
curl "http://localhost:3001/api/stats/summary?sdate=2025-08-01&edate=2026-01-10"

# 스토어별 매출 조회
curl "http://localhost:3001/api/stats/by-store?sdate=2025-08-01&edate=2026-01-10"

# Playwright 테스트 실행
npx playwright test
```

---

## 데이터 처리 방식

### 중복 데이터 처리 (UPSERT)
- **PRIMARY KEY**: `uniq` (플레이오토 고유 주문 ID)
- **전략**: `INSERT ... ON CONFLICT DO UPDATE` (PostgreSQL UPSERT)
- **장점**: 주문 상태 변경 시 자동으로 최신 상태 유지

### 데이터베이스 스키마
- **스키마명**: playauto_platform
- **총 테이블 수**: 28개

#### 주요 테이블 상세

**1. shops (12건)** - 쇼핑몰 마스터
| 컬럼명 | 타입 | NULL | PK | 설명 |
|--------|------|------|-----|------|
| shop_cd | text | NO | YES | 쇼핑몰 코드 |
| shop_name | text | YES | - | 쇼핑몰명 |
| seller_nick | text | YES | - | 판매자 닉네임 |
| shop_id | text | YES | - | 판매자 ID |
| updated_at | timestamp | YES | - | 수정일시 |

**2. orders (27,609건)** - 주문 데이터
| 컬럼명 | 타입 | NULL | PK | 설명 |
|--------|------|------|-----|------|
| uniq | text | NO | YES | 플레이오토 주문 고유ID |
| shop_cd | text | YES | - | 쇼핑몰 코드 |
| shop_name | text | YES | - | 쇼핑몰명 |
| seller_nick | text | YES | - | 판매자 닉네임 |
| shop_sale_name | text | YES | - | 상품명 |
| shop_opt_name | text | YES | - | 옵션명 |
| set_name | text | YES | - | 세트명 |
| c_sale_cd | text | YES | - | 판매자 상품코드 |
| ord_status | text | YES | - | 주문상태 |
| sale_cnt | integer | YES | - | 판매수량 (기본값: 0) |
| pack_unit | integer | YES | - | 포장단위 (기본값: 0) |
| pay_amt | integer | YES | - | 결제금액 (기본값: 0) |
| sales | integer | YES | - | 판매금액 (기본값: 0) |
| ord_time | timestamp | YES | - | 주문일시 |
| pay_time | timestamp | YES | - | 결제일시 |
| order_name | text | YES | - | 주문자명 |
| shop_ord_no | text | YES | - | 쇼핑몰 주문번호 |
| created_at | timestamp | YES | - | 생성일시 |

**3. products (164건)** - 상품 마스터
| 컬럼명 | 타입 | NULL | PK | 설명 |
|--------|------|------|-----|------|
| product_code | varchar(50) | NO | YES | SKU 코드 |
| product_name | varchar(200) | NO | - | 상품명 |
| category | varchar(100) | YES | - | 카테고리 |
| manufacturer | varchar(200) | YES | - | 제조사 |
| supplier | varchar(200) | YES | - | 공급업체 |
| current_stock | integer | YES | - | 현재 재고 |
| safety_stock | integer | YES | - | 안전 재고 |
| moq | integer | YES | - | 최소주문수량 |
| lead_time_days | integer | YES | - | 리드타임(일) |
| purchase_price | numeric | YES | - | 매입가 |
| sale_price | numeric | YES | - | 판매가 |
| warehouse_id | uuid | YES | - | 창고 ID |
| is_active | boolean | YES | - | 활성화 여부 |

**4. sync_history** - 동기화 이력 (id SERIAL PK)

#### 기타 테이블 (24개)
`audit_logs`, `campaign_products`, `checkpoint_adjustments`, `daily_ledgers`, `dashboard_products`, `discrepancies`, `group_permissions`, `groups`, `influencer_campaigns`, `notification_settings`, `order_product_mappings`, `permissions`, `product_bom`, `product_bom_backup`, `product_name_mappings`, `purchase_order_items`, `purchase_orders`, `refresh_tokens`, `scheduler_logs`, `sku_mapping_rules`, `stock_checkpoints`, `transactions`, `users`, `warehouses`

#### 인덱스
- **orders**: orders_pkey, idx_orders_shop_cd, idx_orders_ord_time, idx_orders_shop_sale_name, idx_orders_ord_status
- **products**: products_pkey, idx_products_category, idx_products_is_active, idx_products_warehouse_id, idx_products_barcode
- **shops**: shops_pkey

### 스마트 동기화 버퍼
- 마지막 동기화 종료일 - 2일부터 수집 시작
- 소급 입력된 주문도 누락 없이 수집

---

## API-화면 연동 현황

### 프론트엔드 → 백엔드 연결 (총 18개 API)

| 프론트엔드 함수 | 백엔드 엔드포인트 | 사용 컴포넌트 |
|---------------|-----------------|-------------|
| getShops | GET /api/shops | DateFilter.jsx |
| refreshShops | POST /api/shops/refresh | - |
| getOrders | GET /api/orders | - |
| getOrder | GET /api/orders/:uniq | - |
| getSyncStatus | GET /api/sync/status | App.jsx |
| startSync | POST /api/sync | SyncPanel.jsx |
| startIncrementalSync | POST /api/sync/incremental | SyncPanel.jsx |
| startYearlySync | POST /api/sync/yearly | SyncPanel.jsx |
| startWeeklySync | POST /api/sync/weekly | SyncPanel.jsx |
| getSyncHistory | GET /api/sync/history | - |
| getSchedulerStatus | GET /api/sync/scheduler | SyncPanel.jsx |
| startSmartSync | POST /api/sync/smart | SyncPanel.jsx |
| startValidationSync | POST /api/sync/validation | SyncPanel.jsx |
| getSummary | GET /api/stats/summary | Dashboard.jsx |
| getStoreStats | GET /api/stats/by-store | Dashboard.jsx |
| getProductStats | GET /api/stats/by-product | Dashboard.jsx |
| getTrend | GET /api/stats/trend | Dashboard.jsx |
| getForecast | GET /api/stats/forecast | Dashboard.jsx |
| downloadExcel | GET /api/reports/excel | DateFilter.jsx |
| downloadCSV | GET /api/reports/csv | - |

### Vite 프록시 설정
- 클라이언트에서 `/api/*` 요청 → `http://localhost:3001` 으로 프록시
