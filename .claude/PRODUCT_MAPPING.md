# 상품 자동 매핑 뷰 (v_auto_product_mapping) 분석

## 개요
`v_auto_product_mapping`은 주문 데이터에서 상품명/옵션명을 분석하여 내부 상품 코드와 자동으로 매핑하는 PostgreSQL 뷰입니다.

## 뷰 구조

### 전체 흐름
```
order_combos (주문 조합 추출)
    ↓
manual_mapped (수동 매핑 적용 - 최우선)
    ↓
keyword_match_candidates (키워드 기반 매칭 후보)
    ↓
option_match_counts (옵션명 매칭 점수 계산)
    ↓
dynamic_final (최적 매칭 선정)
    ↓
unmapped_items (매핑 실패 항목)
    ↓
combined_results (모든 결과 통합)
    ↓
Final SELECT (수량 추출 로직 적용)
```

---

## CTE (Common Table Expression) 상세 분석

### 1. order_combos - 주문 조합 추출
```sql
WITH order_combos AS (
    SELECT DISTINCT shop_sale_name, shop_opt_name
    FROM playauto_platform.orders
)
```
- **목적**: 중복 제거된 고유 상품명/옵션명 조합 추출
- **출력**: `shop_sale_name`, `shop_opt_name`

### 2. manual_mapped - 수동 매핑 (최우선 순위)
```sql
manual_mapped AS (
    SELECT
        oc.shop_sale_name,
        oc.shop_opt_name,
        pm.product_code,
        pm.quantity AS manual_qty,
        'manual' AS mapping_type
    FROM order_combos oc
    JOIN playauto_platform.product_mappings pm
        ON oc.shop_sale_name = pm.shop_sale_name
        AND oc.shop_opt_name = pm.shop_opt_name
)
```
- **목적**: `product_mappings` 테이블에 직접 등록된 수동 매핑 적용
- **우선순위**: 가장 높음 (수동 매핑이 있으면 키워드 매핑 무시)
- **조인 조건**: shop_sale_name + shop_opt_name 완전 일치

### 3. keyword_match_candidates - 키워드 매칭 후보
```sql
keyword_match_candidates AS (
    SELECT
        oc.shop_sale_name,
        oc.shop_opt_name,
        p.product_code,
        pk.keyword,
        p.category
    FROM order_combos oc
    LEFT JOIN manual_mapped mm
        ON oc.shop_sale_name = mm.shop_sale_name
        AND oc.shop_opt_name = mm.shop_opt_name
    CROSS JOIN playauto_platform.products p
    JOIN playauto_platform.product_keywords pk ON p.product_code = pk.product_code
    WHERE mm.product_code IS NULL  -- 수동 매핑이 없는 경우만
      AND (
          -- 카테고리별 매칭 규칙
          CASE
              WHEN p.category = 'coffee_drip' THEN
                  oc.shop_sale_name ILIKE '%' || pk.keyword || '%'
              WHEN p.category = 'coffee_bean' THEN
                  oc.shop_sale_name ILIKE '%' || pk.keyword || '%'
              WHEN p.category = 'analysis' THEN
                  oc.shop_sale_name ILIKE '%' || pk.keyword || '%'
              ELSE
                  oc.shop_sale_name ILIKE '%' || pk.keyword || '%'
                  OR oc.shop_opt_name ILIKE '%' || pk.keyword || '%'
          END
      )
)
```
- **목적**: 키워드 테이블(`product_keywords`)을 기반으로 상품 매칭
- **조건**: 수동 매핑이 없는 경우에만 시도
- **카테고리별 규칙**:
  - `coffee_drip`: 상품명에서만 키워드 검색
  - `coffee_bean`: 상품명에서만 키워드 검색
  - `analysis`: 상품명에서만 키워드 검색
  - 기타 (건강기능식품 등): 상품명 OR 옵션명에서 키워드 검색

### 4. option_match_counts - 옵션 매칭 점수 계산
```sql
option_match_counts AS (
    SELECT
        shop_sale_name,
        shop_opt_name,
        product_code,
        category,
        COUNT(*) AS match_count  -- 매칭된 키워드 개수
    FROM keyword_match_candidates
    GROUP BY shop_sale_name, shop_opt_name, product_code, category
)
```
- **목적**: 동일 조합에 여러 상품이 매칭될 경우 점수화
- **점수 기준**: 매칭된 키워드 개수 (`match_count`)
- 키워드가 더 많이 일치하는 상품이 우선

### 5. dynamic_final - 최적 매칭 선정
```sql
dynamic_final AS (
    SELECT DISTINCT ON (shop_sale_name, shop_opt_name)
        shop_sale_name,
        shop_opt_name,
        product_code,
        'auto' AS mapping_type
    FROM option_match_counts
    ORDER BY shop_sale_name, shop_opt_name, match_count DESC
)
```
- **목적**: 각 주문 조합당 가장 점수가 높은 1개 상품 선택
- **방법**: `DISTINCT ON` + `ORDER BY match_count DESC`
- **결과**: 자동 매핑된 최종 상품 코드

### 6. unmapped_items - 매핑 실패 항목
```sql
unmapped_items AS (
    SELECT
        oc.shop_sale_name,
        oc.shop_opt_name,
        NULL::VARCHAR AS product_code,
        'unmapped' AS mapping_type
    FROM order_combos oc
    LEFT JOIN manual_mapped mm ON ...
    LEFT JOIN dynamic_final df ON ...
    WHERE mm.product_code IS NULL AND df.product_code IS NULL
)
```
- **목적**: 수동/자동 매핑 모두 실패한 항목 식별
- **용도**: 관리자가 수동 매핑해야 할 대상 파악

### 7. combined_results - 결과 통합
```sql
combined_results AS (
    SELECT * FROM manual_mapped
    UNION ALL
    SELECT shop_sale_name, shop_opt_name, product_code, NULL AS manual_qty, mapping_type FROM dynamic_final
    UNION ALL
    SELECT shop_sale_name, shop_opt_name, product_code, NULL AS manual_qty, mapping_type FROM unmapped_items
)
```
- **목적**: 세 가지 결과를 하나로 통합
- **우선순위 보장**: 이미 각 CTE에서 중복 제거됨

---

## Final SELECT - 수량 추출 로직

### 수량 추출 규칙
```sql
CASE
    WHEN mapping_type = 'manual' THEN manual_qty
    WHEN cr.product_code ~~ 'COFFEE_%' THEN
        -- 커피(원두) 수량 추출: kg, g 단위
        CASE
            WHEN cr.shop_opt_name ~* '(\d+(?:\.\d+)?)\s*kg' THEN
                (regexp_match(cr.shop_opt_name, '(\d+(?:\.\d+)?)\s*kg', 'i'))[1]::numeric * 1000
            WHEN cr.shop_opt_name ~* '(\d+)\s*g' THEN
                (regexp_match(cr.shop_opt_name, '(\d+)\s*g', 'i'))[1]::numeric
            ELSE 1
        END
    WHEN cr.product_code ~~ 'DRIP_%' THEN
        -- 드립백 수량 추출: N종, N개 등
        CASE
            WHEN cr.shop_opt_name ~* '(\d+)\s*종' THEN
                (regexp_match(cr.shop_opt_name, '(\d+)\s*종', 'i'))[1]::integer
            WHEN cr.shop_opt_name ~* '(\d+)\s*[개ea]' THEN
                (regexp_match(cr.shop_opt_name, '(\d+)\s*[개ea]', 'i'))[1]::integer
            ELSE 1
        END
    ELSE
        -- 기타 상품: 개, 세트, 박스 등
        CASE
            WHEN cr.shop_opt_name ~* '(\d+)\s*[개세트박스]' THEN
                (regexp_match(cr.shop_opt_name, '(\d+)\s*[개세트박스]', 'i'))[1]::integer
            ELSE 1
        END
END AS quantity
```

### 수량 추출 상세

| 상품 유형 | 패턴 | 예시 | 추출 결과 |
|----------|------|------|----------|
| 수동 매핑 | - | - | `manual_qty` 값 사용 |
| COFFEE_* (원두) | `N kg` | "1kg", "0.5kg" | 1000, 500 (g 단위로 변환) |
| COFFEE_* (원두) | `N g` | "200g", "500g" | 200, 500 |
| DRIP_* (드립백) | `N 종` | "5종 세트" | 5 |
| DRIP_* (드립백) | `N 개/ea` | "10개입" | 10 |
| 기타 | `N 개/세트/박스` | "3개입", "1세트" | 3, 1 |
| 기본값 | - | 패턴 없음 | 1 |

---

## 출력 컬럼

| 컬럼명 | 타입 | 설명 |
|-------|------|------|
| `shop_sale_name` | VARCHAR | 주문 상품명 (원본) |
| `shop_opt_name` | VARCHAR | 주문 옵션명 (원본) |
| `product_code` | VARCHAR | 매핑된 상품 코드 |
| `quantity` | NUMERIC | 추출된 수량 |
| `mapping_type` | VARCHAR | 매핑 유형 (manual/auto/unmapped) |

---

## 관련 테이블

### products - 상품 마스터
```sql
CREATE TABLE playauto_platform.products (
    product_code VARCHAR(50) PRIMARY KEY,
    product_name VARCHAR(200),
    category VARCHAR(50),  -- 'supplement', 'coffee_drip', 'coffee_bean', 'analysis'
    ...
);
```

### product_keywords - 상품별 키워드
```sql
CREATE TABLE playauto_platform.product_keywords (
    id SERIAL PRIMARY KEY,
    product_code VARCHAR(50) REFERENCES products(product_code),
    keyword VARCHAR(100)
);
```

### product_mappings - 수동 매핑
```sql
CREATE TABLE playauto_platform.product_mappings (
    id SERIAL PRIMARY KEY,
    shop_sale_name VARCHAR(500),
    shop_opt_name VARCHAR(500),
    product_code VARCHAR(50) REFERENCES products(product_code),
    quantity INTEGER DEFAULT 1
);
```

---

## 사용 예시

### 1. 매핑 현황 확인
```sql
SELECT mapping_type, COUNT(*)
FROM playauto_platform.v_auto_product_mapping
GROUP BY mapping_type;
```

### 2. 미매핑 항목 조회
```sql
SELECT shop_sale_name, shop_opt_name
FROM playauto_platform.v_auto_product_mapping
WHERE mapping_type = 'unmapped';
```

### 3. 특정 상품의 매핑 확인
```sql
SELECT *
FROM playauto_platform.v_auto_product_mapping
WHERE product_code = 'COFFEE_BLEND_01';
```

---

## 매핑 우선순위

1. **수동 매핑** (product_mappings 테이블) - 최우선
2. **키워드 자동 매핑** (product_keywords 기반) - 차선
3. **미매핑** - 관리자 검토 필요

---

## 주의사항

1. **키워드 중복 주의**: 동일 키워드가 여러 상품에 등록되면 `match_count`로 구분
2. **정규식 성능**: 대량 데이터에서 정규식 추출은 부하 발생 가능
3. **카테고리별 규칙**: 커피류는 상품명만, 건강기능식품은 옵션명도 검색

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2026-01-19 | 문서 최초 작성 |
| 2026-01-19 | 분석 서비스 카테고리 키워드 매핑 지원 추가 |
