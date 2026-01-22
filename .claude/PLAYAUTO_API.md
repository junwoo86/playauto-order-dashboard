# 플레이오토 Open API 문서

> 분석 일자: 2026-01-12
> 개발자센터: https://developers.playauto.io

---

## 목차

1. [개요](#개요)
2. [인증](#인증)
3. [공통 API](#공통-api)
4. [쇼핑몰계정 관리 API](#쇼핑몰계정-관리-api)
5. [주문 API](#주문-api)
6. [상품 API](#상품-api)
7. [재고 API](#재고-api)
8. [문의 API](#문의-api)
9. [정산 API](#정산-api)
10. [메모 API](#메모-api)
11. [에러코드](#에러코드)

---

## 개요

### Base URL
```
https://openapi.playauto.io/api
```

### 공통 헤더
모든 API 호출 시 아래 헤더 필수:

| Header | Type | 필수 | 설명 |
|--------|------|------|------|
| x-api-key | String | O | 승인시 발급받은 API KEY |
| Authorization | String | O | 인증토큰 (형식: `Token {token}`) |

### Content-Type
```
application/json; charset=UTF-8
```

---

## 인증

### 인증 토큰 발급

인증 토큰을 발급받아 다른 API 호출 시 사용합니다.

- **Method**: `POST`
- **URL**: `/auth`
- **토큰 유효기간**: 24시간

#### Request Body

| Parameter | Type | 필수 | 설명 |
|-----------|------|------|------|
| email | String | △ | 이메일 주소 (이메일/비밀번호 인증 시 필수) |
| password | String | △ | 비밀번호 (이메일/비밀번호 인증 시 필수) |
| authentication_key | String | △ | 솔루션 인증키 (솔루션 인증키 인증 시 필수) |

> 이메일/비밀번호 OR 솔루션 인증키 중 하나로 인증 가능

#### Response

| Parameter | Type | 설명 |
|-----------|------|------|
| token | String | 발행된 토큰 |
| sol_no | Number | 솔루션번호 |

#### 예시

```json
// Request
{
  "email": "api@sample.com",
  "password": "123456789"
}

// Response
{
  "token": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9...",
  "sol_no": 12345
}
```

---

## 공통 API

### 배송처 조회
- **Method**: `GET`
- **URL**: `/depots`

### HS코드 조회
- **Method**: `GET`
- **URL**: `/hscode`

### 로그 조회
- **Method**: `GET`
- **URL**: `/logs`

### 매입처 조회
- **Method**: `GET`
- **URL**: `/suppliers`

### 원산지 조회
- **Method**: `GET`
- **URL**: `/origins`

### 택배사 코드 조회
- **Method**: `GET`
- **URL**: `/carriers`

### 공지사항 조회
- **Method**: `GET`
- **URL**: `/notices`

---

## 쇼핑몰계정 관리 API

### 쇼핑몰 코드 조회

플레이오토에서 사용되는 쇼핑몰 코드 리스트를 조회합니다.

- **Method**: `GET`
- **URL**: `/shops`

#### Query Parameters

| Parameter | Type | 필수 | 설명 |
|-----------|------|------|------|
| used | String | - | 사용중인 쇼핑몰만 조회 (`true`/`false`) |
| etc_detail | String | - | etc 필드 정보 조회 (`true`/`false`) |
| usable_shop | String | - | 사용가능여부 조회 (`true`/`false`) |

#### Response

| Parameter | Type | 설명 |
|-----------|------|------|
| shop_name | String | 쇼핑몰 이름 |
| shop_cd | String | 쇼핑몰 코드 |
| shop_id | String | 쇼핑몰 아이디 (used=true일 때만) |
| seller_nick | String | 별칭 (used=true일 때만) |
| usable | Number | 사용가능여부 (1: 가능, 0: 불가) |

### 쇼핑몰 계정 등록
- **Method**: `POST`
- **URL**: `/shop`

### 쇼핑몰 계정 수정
- **Method**: `PUT`
- **URL**: `/shop`

### 쇼핑몰 계정 삭제
- **Method**: `DELETE`
- **URL**: `/shop`

---

## 주문 API

### 주문 리스트 조회

주문 목록을 조회합니다.

- **Method**: `POST`
- **URL**: `/orders`
- **최대 조회**: 3,000건

#### Request Body

| Parameter | Type | 필수 | 설명 |
|-----------|------|------|------|
| start | Number | - | 검색 시작 값 (기본값: 0) |
| length | Number | - | 조회할 주문 갯수 (최대: 3000) |
| orderby | String | - | 정렬 (예: `wdate desc`) |
| search_key | String | - | 검색 키 |
| search_word | String | - | 검색어 |
| search_type | String | - | 검색 타입 (`exact`: 완전일치, `partial`: 부분일치) |
| date_key | String | - | 날짜 검색 키 |
| sdate | String | - | 시작일 (YYYY-MM-DD) |
| edate | String | - | 종료일 (YYYY-MM-DD) |
| ord_status | Array | - | 주문상태 배열 |
| bundle_yn | Boolean | - | 묶음번호 기준 조회 (`true`: 묶음번호별 그룹핑) |

#### 정렬 가능 필드 (orderby)

| Value | Description |
|-------|-------------|
| bundle_no | 묶음번호 |
| ord_status | 주문상태 |
| wdate | 주문수집일 |
| mdate | 주문변경일 |
| shop_name | 쇼핑몰 계정 |
| shop_ord_no | 주문번호 |

#### 검색 키 (search_key)

| Value | Description |
|-------|-------------|
| bundle_no | 묶음번호 |
| shop_ord_no | 주문번호 |
| shop_sale_no | 쇼핑몰 상품코드 |
| sku_cd | SKU코드 |
| c_sale_cd | 판매자관리코드 |
| shop_sale_name | 온라인상품명 |
| order_name, order_id, to_name | 주문자/수령자 |
| tel | 연락처 |
| memo | 메모 |
| gift_name | 사은품 |

#### 날짜 검색 키 (date_key)

| Value | Description |
|-------|-------------|
| wdate | 주문수집일 |
| mdate | 주문변경일 |
| ord_time | 주문일 |
| pay_time | 결제완료일 |
| ord_status_mdate | 상태변경일 |
| ship_plan_date | 발송예정일 |
| ord_confirm_time | 주문확인일 |
| out_order_time | 출고지시일 |
| out_time | 출고완료일 |
| invoice_send_time | 송장전송일 |

#### 주문상태 (ord_status)

| 정상 주문 상태 | 클레임 상태 |
|---------------|------------|
| 결제완료 | 취소요청 |
| 신규주문 | 취소완료 |
| 출고대기 | 반품요청 |
| 출고보류 | 반품접수 |
| 운송장출력 | 반품회수완료 |
| 출고완료 | 반품교환요청 |
| 배송중 | 반품완료 |
| 배송완료 | 교환요청 |
| 구매결정 | 교환접수 |
| 주문재확인 | 교환완료 |
| 주문보류 | 교환회수완료 |
| 판매완료 | 맞교환요청/맞교환완료 |

---

### 주문 상세 조회

특정 주문의 상세 정보를 조회합니다.

- **Method**: `GET`
- **URL**: `/order/:uniq`

#### URL Parameters

| Parameter | Type | 필수 | 설명 |
|-----------|------|------|------|
| uniq | Number | O | 주문 고유번호 |

#### Response 주요 필드

| Parameter | Type | 설명 |
|-----------|------|------|
| sol_no | Number | 솔루션번호 |
| uniq | String | 주문 고유번호 |
| bundle_no | String | 주문 묶음번호 |
| ord_status | String | 주문상태 |
| ord_time | String | 주문일 (YYYY-MM-DD HH:mm:ss) |
| pay_time | String | 결제완료일 |
| shop_cd | String | 쇼핑몰 코드 |
| shop_name | String | 쇼핑몰 이름 |
| shop_ord_no | String | 쇼핑몰 주문번호 |
| order_name | String | 주문자명 |
| order_tel | String | 주문자 전화번호 |
| order_htel | String | 주문자 핸드폰번호 |
| order_email | String | 주문자 이메일 |
| to_name | String | 수령자명 |
| to_tel | String | 수령자 전화번호 |
| to_htel | String | 수령자 휴대폰번호 |
| to_zipcd | String | 수령자 우편번호 |
| to_addr1 | String | 수령자 주소1 |
| to_addr2 | String | 수령자 주소2 |
| shop_sale_no | String | 쇼핑몰상품코드 |
| shop_sale_name | String | 상품명 |
| shop_opt_name | String | 옵션명 |
| sale_cnt | Number | 주문수량 |
| pay_amt | Number | 실결제금액 |
| sales | Number | 판매금액 |
| ship_cost | Number | 배송비 |
| ship_method | String | 배송방법 |
| ship_msg | String | 배송메세지 |
| carr_name | String | 택배사 이름 |
| carr_no | String | 택배사 코드 |
| invoice_no | String | 운송장 번호 |
| sku_cd | String | SKU코드 |
| prod_name | String | SKU상품명 |

---

### 배송정보 업데이트

묶음번호의 주문에 송장번호와 택배사를 업데이트합니다.

- **Method**: `PUT`
- **URL**: `/order/setInvoice`

#### 업데이트 가능 상태
- 출고대기
- 출고보류
- 운송장출력
- 주문재확인
- 배송중

#### Request Body

| Parameter | Type | 필수 | 설명 |
|-----------|------|------|------|
| orders | Array | O | 변경할 주문데이터 배열 |
| orders[].bundle_no | String | O | 묶음번호 |
| orders[].carr_no | String | O | 택배사코드 |
| orders[].invoice_no | String | O | 송장번호 |
| overwrite | Boolean | - | 덮어쓰기 여부 (기본값: false) |
| change_complete | Boolean | - | 출고완료로 변경 (기본값: false → 운송장출력) |
| dupl_doubt_except_yn | String | - | 중복의심주문 제외 ('Y'/'N', 기본값: 'N') |

#### Response

| Parameter | Type | 설명 |
|-----------|------|------|
| bundle_no | String | 주문 묶음번호 |
| result | String | 성공/실패 |
| message | String | 실패시 사유 |
| error_code | String | 에러 코드 |

#### 예시

```json
// Request
{
  "orders": [
    {
      "bundle_no": "3772225519903274",
      "carr_no": "4",
      "invoice_no": "377811119999"
    }
  ],
  "overwrite": true,
  "change_complete": true
}

// Response
[
  {
    "bundle_no": "3772225519903274",
    "result": "성공",
    "message": ""
  }
]
```

---

### 기타 주문 API

| API | Method | URL | 설명 |
|-----|--------|-----|------|
| 보류 | PUT | /order/hold | 주문 보류 처리 |
| 주문 삭제 | DELETE | /order | 주문 삭제 |
| 주문 등록 | POST | /order | 수동 주문 등록 |
| 주문 분할 | POST | /order/divide | 주문 분할 처리 |
| 주문 수정 | PUT | /order | 주문 정보 수정 |
| 주문 합포장 | POST | /order/bundle | 주문 합포장 처리 |
| 출고 지시 | PUT | /order/out | 출고 지시 처리 |
| 주문상태변경 | PUT | /order/status | 주문 상태 변경 |
| 상태별 주문수량 조회 | GET | /order/count | 상태별 주문 카운트 |
| 중복의심 해제 | PUT | /order/dupl | 중복의심 해제 |

---

## 상품 API

| API | Method | URL | 설명 |
|-----|--------|-----|------|
| 머리말 꼬리말 조회 | GET | /product/templates | 머리말/꼬리말 템플릿 |
| 상품리스트 조회 | POST | /products | 온라인상품 목록 조회 |
| 온라인상품 등록 | POST | /product | 온라인상품 등록 |
| 온라인상품 상세 조회 | GET | /product/:id | 온라인상품 상세 |
| 온라인상품 수정 | PUT | /product | 온라인상품 수정 |
| 온라인상품 판매수량 수정 | PUT | /product/stock | 판매수량 수정 |
| 온라인상품 연동 수정/해제 | PUT | /product/link | 연동 설정 |
| 카테고리 조회 | GET | /categories | 카테고리 목록 |
| 템플릿 조회 | GET | /templates | 템플릿 목록 |
| 수집 상품 리스트 조회 | GET | /scrap/products | 수집상품 목록 |
| 수집 상품 삭제 | DELETE | /scrap/product | 수집상품 삭제 |

---

## 재고 API

| API | Method | URL | 설명 |
|-----|--------|-----|------|
| SKU상품 리스트 조회 | POST | /sku/products | SKU상품 목록 |
| SKU상품 상세 조회 | GET | /sku/product/:id | SKU상품 상세 |
| SKU상품 등록 | POST | /sku/product | SKU상품 등록 |
| SKU상품 수정 | PUT | /sku/product | SKU상품 수정 |
| 세트상품 조회 | GET | /set/products | 세트상품 목록 |
| 세트상품 등록 | POST | /set/product | 세트상품 등록 |
| 세트상품 수정 | PUT | /set/product | 세트상품 수정 |
| 재고수정 | PUT | /stock | 재고 수량 수정 |
| 재고현황조회 | GET | /stock/status | 재고 현황 조회 |

---

## 문의 API

| API | Method | URL | 설명 |
|-----|--------|-----|------|
| 고객문의 조회 | GET | /inquiries | 고객문의 목록 |
| 문의답변 등록 | POST | /inquiry/answer | 문의 답변 등록 |

---

## 정산 API

| API | Method | URL | 설명 |
|-----|--------|-----|------|
| 정산내역 조회 | GET | /settlements | 정산내역 목록 |
| 주문관리 정산 조회 | GET | /order/settlement | 주문별 정산 조회 |

---

## 메모 API

| API | Method | URL | 설명 |
|-----|--------|-----|------|
| 메모 등록 | POST | /memo | 메모 등록 |
| 메모 삭제 | DELETE | /memo | 메모 삭제 |
| 메모 수정 | PUT | /memo | 메모 수정 |

---

## 에러코드

### 공통 에러

| Code | Description |
|------|-------------|
| 400 | 필수 파라미터 누락 |
| e1001 | 사용자 정보가 조회되지 않습니다 |
| e1002 | 비활성 사용자 입니다 |
| e1003 | 탈퇴한 사용자 입니다 |
| e1004 | 승인되지않은 사용자 입니다 |
| e1005 | 사용자 인증에 실패하였습니다 |
| e1006 | OPEN-API 미승인 사용자 (1:1 문의로 승인 요청 필요) |
| e1010 | 조회 시작일의 날짜의 형식이 올바르지 않습니다 |
| e1011 | 조회 종료일의 날짜의 형식이 올바르지 않습니다 |
| e1012 | 쇼핑몰코드로 조회되는 쇼핑몰 정보가 없습니다 |
| e1017 | 응답 데이터가 10MB를 초과하여 조회에 실패 (분할 조회 필요) |
| e1999 | 정의되지 않은 오류 |

### 주문 에러

| Code | Description |
|------|-------------|
| e2001 | [출고관리]메뉴에서 조회되지 않는 묶음고유번호 |
| e2002 | 묶음번호는 필수 입니다 |
| e2003 | 유효한 택배사 코드가 아닙니다 |
| e2004 | 운송장번호는 필수 입니다 |
| e2005 | 조회되지 않는 묶음고유번호입니다 |
| e2006 | 동일 묶음번호에는 동일한 택배사/운송장번호 입력 필요 |
| e2007 | 배송정보가 이미 입력되어있습니다 |
| e2008 | 입력한 묶음번호로 조회되는 주문이 없습니다 |
| e2009 | 신규주문 상태가 아닌 주문건 포함 (출고지시 불가) |
| e2040 | 출고불가능한 주문건이 포함되어있습니다 |
| e2043 | 송장번호 업데이트 처리 실패 (재시도 요망) |
| e2044 | 주문은 최대 3000건까지 조회가능 |
| e2049 | [결제완료] 주문은 주문정보 수정 불가 |
| e2059 | 중복 주문이 존재합니다 |
| e2060 | 보류처리가 불가능한 상태의 주문 포함 |
| e2061 | 입력한 uniq번호로 조회되는 주문이 없습니다 |
| e2065 | 조회 시작일이 조회 종료일보다 큽니다 |
| e2999 | 정의되지 않은 오류 |

---

## 참고 사항

### API 호출 제한
- 응답 데이터 최대 10MB
- 주문 조회 최대 3,000건
- 토큰 유효기간 24시간

### 배송방법 코드

| Value |
|-------|
| 무료배송 |
| 선결제 |
| 착불 |
| 조건부배송 |
| 방문수령 |
| 퀵배송 |
| 일반우편 |
| 설치배송 |
| 기타 |

---

## 관련 링크

- 개발자센터: https://developers.playauto.io
- 플레이오토 솔루션: https://plto.com
- API 사용신청: https://developers.playauto.io (사용신청 메뉴)
