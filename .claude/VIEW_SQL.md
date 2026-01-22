# PostgreSQL 뷰 테이블 SQL 정의서

> **주의**: 이 뷰들은 DB에서 직접 관리됩니다. 코드에서 자동으로 생성/수정하지 않습니다.
>
> 뷰 수정이 필요한 경우 DB에서 직접 `CREATE OR REPLACE VIEW`를 실행하세요.

---

## 뷰 테이블 목록

| 뷰 이름 | 설명 | 의존성 |
|---------|------|--------|
| `v_auto_product_mapping` | 주문 상품명/옵션명 → SKU 매핑 | orders, dashboard_products, product_name_mappings |
| `v_product_shipment_stats` | 상품별 일별 출고 통계 | v_auto_product_mapping, orders |
| `v_product_monthly_trend` | 상품별 월별 출고 추이 | v_auto_product_mapping, orders |

---

## 1. v_auto_product_mapping (핵심 매핑 뷰)

### 용도
- 주문 데이터의 `shop_sale_name`, `shop_opt_name`을 내부 `product_code`로 매핑
- 수동 매핑(product_name_mappings) 우선, 없으면 키워드 기반 자동 매핑

### 카테고리별 매핑 규칙

| 카테고리 | 검색 대상 | 키워드 조건 | 필수 단어 |
|----------|-----------|-------------|-----------|
| analysis | 상품명 + 옵션명 | OR (하나라도 매칭) | '분석' 또는 '검사' |
| supplement | 상품명 + 옵션명 | OR (하나라도 매칭) | - |
| coffee_bean | 상품명 + 옵션명 | OR (하나라도 매칭) | '드립백' 미포함 |
| coffee_drip | 상품명 + 옵션명 | OR (하나라도 매칭) | '드립백' 포함 |
| **teamketo** | **옵션명만** | **AND (모두 매칭)** | - |
| etc | 상품명 + 옵션명 | OR (하나라도 매칭) | - |

### SQL 정의

```sql
CREATE OR REPLACE VIEW playauto_platform.v_auto_product_mapping AS
WITH order_combos AS (
    -- 1. 주문 데이터 그룹화
    SELECT shop_sale_name, shop_opt_name, count(*) AS order_count
    FROM playauto_platform.orders
    GROUP BY shop_sale_name, shop_opt_name
),
manual_mapped AS (
    -- 2. 수동 매핑 (최우선)
    SELECT m.shop_sale_name, m.shop_opt_name, m.product_code, m.quantity, oc.order_count
    FROM playauto_platform.product_name_mappings m
    JOIN order_combos oc ON m.shop_sale_name = oc.shop_sale_name
         AND COALESCE(m.shop_opt_name, '') = COALESCE(oc.shop_opt_name, '')
),
keyword_match_candidates AS (
    -- 3. 키워드 매칭 후보군 생성
    SELECT
        oc.shop_sale_name,
        oc.shop_opt_name,
        oc.order_count,
        dp.product_code,
        dp.category,
        -- [팀키토 특수 규칙] 옵션명에서 모든 키워드가 포함되어야 함 (AND 조건)
        CASE
            WHEN dp.category = 'teamketo' THEN
                NOT EXISTS (
                    SELECT 1 FROM unnest(dp.keywords) k
                    WHERE COALESCE(oc.shop_opt_name, '') NOT ILIKE ('%' || k || '%')
                )
                AND array_length(dp.keywords, 1) > 0
                AND COALESCE(oc.shop_opt_name, '') <> ''
            ELSE
                (EXISTS (SELECT 1 FROM unnest(dp.keywords) k WHERE oc.shop_opt_name ~~* ('%' || k || '%')))
        END AS is_opt_match,
        -- [팀키토 특수 규칙] 상품명 매칭 비활성화
        CASE
            WHEN dp.category = 'teamketo' THEN FALSE
            ELSE (EXISTS (SELECT 1 FROM unnest(dp.keywords) k WHERE oc.shop_sale_name ~~* ('%' || k || '%')))
        END AS is_sale_match
    FROM order_combos oc
    CROSS JOIN playauto_platform.dashboard_products dp
    WHERE dp.is_active = true
    -- A. 카테고리별 필수 포함 단어 검증
    AND (
        (dp.category = 'coffee_drip' AND (oc.shop_sale_name ~~* '%드립백%' OR oc.shop_opt_name ~~* '%드립백%'))
        OR
        (dp.category = 'coffee_bean' AND NOT (oc.shop_sale_name ~~* '%드립백%' OR oc.shop_opt_name ~~* '%드립백%'))
        OR
        (dp.category = 'analysis' AND (
            oc.shop_sale_name ~~* '%분석%' OR oc.shop_sale_name ~~* '%검사%' OR
            oc.shop_opt_name ~~* '%분석%' OR oc.shop_opt_name ~~* '%검사%'
        ))
        OR
        -- [팀키토] 별도 필수 단어 검증 없음 (키워드 전체 매칭으로 대체)
        (dp.category = 'teamketo')
        OR
        (dp.category NOT IN ('coffee_drip', 'coffee_bean', 'analysis', 'teamketo'))
    )
    -- B. [예외] 영양/중금속(BKG000002)은 '펫' 포함 시 제외
    AND NOT (
        dp.product_code = 'BKG000002'
        AND (oc.shop_sale_name ~~* '%펫%' OR oc.shop_opt_name ~~* '%펫%')
    )
    -- D. [방어 1] 일반 원두인데 주문에 '디카페인'이 있으면 제외
    AND NOT (
        dp.category IN ('coffee_bean', 'coffee_drip')
        AND dp.product_code !~~* '%DECAF%' -- 일반 상품
        AND (oc.shop_sale_name ~~* '%디카페인%' OR oc.shop_sale_name ~~* '%decaf%' OR
             oc.shop_opt_name ~~* '%디카페인%' OR oc.shop_opt_name ~~* '%decaf%')
    )
    -- E. [방어 2] 디카페인 원두인데 주문에 '디카페인'이 없으면 제외
    AND NOT (
        dp.category IN ('coffee_bean', 'coffee_drip')
        AND dp.product_code ~~* '%DECAF%' -- 디카페인 상품
        AND NOT (oc.shop_sale_name ~~* '%디카페인%' OR oc.shop_sale_name ~~* '%decaf%' OR
                 oc.shop_opt_name ~~* '%디카페인%' OR oc.shop_opt_name ~~* '%decaf%')
    )
    -- 수동 매핑 제외
    AND NOT EXISTS (
        SELECT 1 FROM manual_mapped mm
        WHERE mm.shop_sale_name = oc.shop_sale_name
        AND COALESCE(mm.shop_opt_name, '') = COALESCE(oc.shop_opt_name, '')
    )
),
option_match_counts AS (
    -- 4. 옵션 매칭 개수 카운트
    SELECT shop_sale_name, shop_opt_name, COUNT(*) as match_cnt
    FROM keyword_match_candidates
    WHERE is_opt_match = TRUE
    GROUP BY shop_sale_name, shop_opt_name
),
dynamic_final AS (
    -- 5. 최종 매핑 결정
    SELECT km.*
    FROM keyword_match_candidates km
    LEFT JOIN option_match_counts omc
        ON km.shop_sale_name = omc.shop_sale_name
        AND km.shop_opt_name = omc.shop_opt_name
    WHERE
        km.is_opt_match = TRUE
        OR
        (
            km.is_sale_match = TRUE
            AND (
                omc.match_cnt IS NULL
                OR
                (
                    km.shop_opt_name ~ '무료|증정|이벤트|사은품'
                    AND omc.match_cnt = 1
                    AND NOT EXISTS (
                        SELECT 1 FROM keyword_match_candidates sub_dup
                        WHERE sub_dup.shop_sale_name = km.shop_sale_name
                          AND COALESCE(sub_dup.shop_opt_name, '') = COALESCE(km.shop_opt_name, '')
                          AND sub_dup.is_opt_match = TRUE
                          AND sub_dup.product_code = km.product_code
                    )
                )
            )
        )
),
unmapped_items AS (
    -- 6. 미매핑 데이터 식별
    SELECT oc.shop_sale_name, oc.shop_opt_name, NULL::text AS product_code, oc.order_count
    FROM order_combos oc
    WHERE NOT EXISTS (
        SELECT 1 FROM manual_mapped m
        WHERE m.shop_sale_name = oc.shop_sale_name
        AND COALESCE(m.shop_opt_name,'') = COALESCE(oc.shop_opt_name,'')
    )
    AND NOT EXISTS (
        SELECT 1 FROM dynamic_final d
        WHERE d.shop_sale_name = oc.shop_sale_name
        AND COALESCE(d.shop_opt_name,'') = COALESCE(oc.shop_opt_name,'')
    )
),
combined_results AS (
    -- 7. 결과 통합
    SELECT shop_sale_name, shop_opt_name, product_code, order_count,
           'manual' as mapping_type, quantity as manual_qty
    FROM manual_mapped
    UNION ALL
    SELECT shop_sale_name, shop_opt_name, product_code, order_count,
           'auto' as mapping_type, NULL as manual_qty
    FROM dynamic_final
    UNION ALL
    SELECT shop_sale_name, shop_opt_name, product_code, order_count,
           'unmapped' as mapping_type, NULL as manual_qty
    FROM unmapped_items
)
-- 8. 최종 출력 및 수량 추출
SELECT
    shop_sale_name,
    shop_opt_name,
    product_code,
    CASE
        WHEN mapping_type = 'manual' THEN manual_qty
        WHEN product_code ~~ 'COFFEE_%' THEN
            CASE
                WHEN COALESCE(shop_opt_name, '') ~* '(\d+)\s*kg'
                    THEN COALESCE(substring(shop_opt_name, '(\d+)\s*kg')::integer * 1000, 500)
                WHEN shop_sale_name ~* '(\d+)\s*kg'
                    THEN COALESCE(substring(shop_sale_name, '(\d+)\s*kg')::integer * 1000, 500)
                WHEN COALESCE(shop_opt_name, '') ~* '(\d+)\s*g'
                    THEN COALESCE(substring(shop_opt_name, '(\d+)\s*g')::integer, 500)
                WHEN shop_sale_name ~* '(\d+)\s*g'
                    THEN COALESCE(substring(shop_sale_name, '(\d+)\s*g')::integer, 500)
                ELSE 500
            END
        WHEN product_code ~~ 'DRIP_%' THEN
            CASE
                WHEN COALESCE(shop_opt_name, '') ~* '(\d+)\s*종'
                    THEN COALESCE(substring(shop_opt_name, '(\d+)\s*종')::integer, 1)
                ELSE 1
            END
        ELSE
            CASE
                WHEN COALESCE(shop_opt_name, '') ~ '(\d+)\s*\+\s*(\d+)'
                    THEN COALESCE(substring(shop_opt_name, '(\d+)\s*\+\s*\d+')::integer, 0)
                       + COALESCE(substring(shop_opt_name, '\d+\s*\+\s*(\d+)')::integer, 0)
                WHEN shop_sale_name ~ '(\d+)\s*\+\s*(\d+)'
                    THEN COALESCE(substring(shop_sale_name, '(\d+)\s*\+\s*\d+')::integer, 0)
                       + COALESCE(substring(shop_sale_name, '\d+\s*\+\s*(\d+)')::integer, 0)
                WHEN COALESCE(shop_opt_name, '') ~ '(\d+)\s*(개|세트|인권|박스|팩|병|통|EA|ea|명)'
                    THEN COALESCE(substring(shop_opt_name, '(\d+)\s*(개|세트|인권|박스|팩|병|통|EA|ea|명)')::integer, 1)
                WHEN shop_sale_name ~ '(\d+)\s*(개|세트|인권|박스|팩|병|통|EA|ea|명)'
                    THEN COALESCE(substring(shop_sale_name, '(\d+)\s*(개|세트|인권|박스|팩|병|통|EA|ea|명)')::integer, 1)
                ELSE 1
            END
    END AS quantity,
    mapping_type,
    (mapping_type = 'manual') AS verified,
    order_count
FROM combined_results cr;
```

### 출력 컬럼

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| shop_sale_name | text | 주문 상품명 (원본) |
| shop_opt_name | text | 주문 옵션명 (원본) |
| product_code | text | 매핑된 SKU 코드 |
| quantity | integer | 추출된 수량 |
| mapping_type | text | 매핑 유형 (manual/auto/unmapped) |
| verified | boolean | 검증 여부 (수동 매핑이면 true) |
| order_count | bigint | 해당 조합의 주문 건수 |

---

## 2. v_product_shipment_stats (일별 출고 통계)

### 용도
- SKU별 일별 출고량/주문수/매출 집계
- 검사권/건기식 카드, SKU별 판매 추이에서 사용

### SQL 정의

```sql
CREATE OR REPLACE VIEW playauto_platform.v_product_shipment_stats AS
SELECT
    vm.product_code,
    DATE(o.ord_time) AS order_date,
    SUM(vm.quantity * o.sale_cnt) AS total_quantity,
    COUNT(DISTINCT o.uniq) AS order_count,
    SUM(
        CASE
            WHEN o.shop_cd IN ('A077', '1077') THEN o.pay_amt
            ELSE o.sales
        END
    ) AS revenue
FROM playauto_platform.orders o
JOIN playauto_platform.v_auto_product_mapping vm
    ON o.shop_sale_name = vm.shop_sale_name
    AND COALESCE(o.shop_opt_name, '') = COALESCE(vm.shop_opt_name, '')
WHERE vm.product_code IS NOT NULL
    AND o.ord_status NOT IN ('취소완료', '반품완료', '교환완료', '환불')
GROUP BY vm.product_code, DATE(o.ord_time);
```

### 출력 컬럼

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| product_code | text | SKU 코드 |
| order_date | date | 주문일 |
| total_quantity | bigint | 총 출고량 (수량 × 판매수량) |
| order_count | bigint | 주문 건수 |
| revenue | bigint | 매출 (스마트스토어는 pay_amt, 나머지는 sales) |

---

## 3. v_product_monthly_trend (월별 출고 추이)

### 용도
- SKU별 월별 출고량/주문수/매출 집계
- 월간 트렌드 분석에서 사용

### SQL 정의

```sql
CREATE OR REPLACE VIEW playauto_platform.v_product_monthly_trend AS
SELECT
    vm.product_code,
    TO_CHAR(o.ord_time, 'YYYY-MM') AS month,
    SUM(vm.quantity * o.sale_cnt) AS total_quantity,
    COUNT(DISTINCT o.uniq) AS order_count,
    SUM(
        CASE
            WHEN o.shop_cd IN ('A077', '1077') THEN o.pay_amt
            ELSE o.sales
        END
    ) AS revenue
FROM playauto_platform.orders o
JOIN playauto_platform.v_auto_product_mapping vm
    ON o.shop_sale_name = vm.shop_sale_name
    AND COALESCE(o.shop_opt_name, '') = COALESCE(vm.shop_opt_name, '')
WHERE vm.product_code IS NOT NULL
    AND o.ord_status NOT IN ('취소완료', '반품완료', '교환완료', '환불')
GROUP BY vm.product_code, TO_CHAR(o.ord_time, 'YYYY-MM');
```

### 출력 컬럼

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| product_code | text | SKU 코드 |
| month | text | 월 (YYYY-MM 형식) |
| total_quantity | bigint | 총 출고량 |
| order_count | bigint | 주문 건수 |
| revenue | bigint | 매출 |

---

## 뷰 의존성 다이어그램

```
orders (테이블)
    │
    ├──► v_auto_product_mapping (매핑 뷰)
    │           │
    │           ├──► dashboard_products (테이블) - 키워드 기반 자동 매핑
    │           │
    │           └──► product_name_mappings (테이블) - 수동 매핑
    │
    └──► v_product_shipment_stats (일별 통계 뷰)
                │
                └──► v_auto_product_mapping

    └──► v_product_monthly_trend (월별 통계 뷰)
                │
                └──► v_auto_product_mapping
```

---

## 참고: 미사용 뷰

| 뷰 이름 | 상태 | 설명 |
|---------|------|------|
| `v_auto_product_mapping_new` | 미사용 | 이전 버전 (삭제 권장) |

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2026-01-19 | 문서 최초 작성 |
| 2026-01-19 | 코드에서 뷰 생성 로직 제거, DB 직접 관리로 전환 |
| 2026-01-20 | **teamketo 카테고리 특수 규칙 추가** - 옵션명에서만 검색, 모든 키워드 AND 조건 |
