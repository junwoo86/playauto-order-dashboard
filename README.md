# 플레이오토 주문 분석 대시보드

플레이오토 API를 활용한 스토어별/상품별 판매 분석 및 예측 대시보드

## 기능

- **스토어별 매출 분석**: 각 쇼핑몰(스마트스토어, 쿠팡, 아임웹 등)별 매출 비교
- **상품별 판매 순위**: TOP N 상품 판매량/매출 확인
- **추이 그래프**: 일별/월별 매출 및 주문 추이
- **판매 예측**: 이동평균 기반 미래 매출 예측
- **엑셀 다운로드**: 분석 데이터를 엑셀 파일로 내려받기

## 설치 방법

### 1. 의존성 설치

```bash
# 서버 패키지 설치
cd server
npm install

# 클라이언트 패키지 설치
cd ../client
npm install
```

### 2. 환경변수 설정

프로젝트 루트에 `.env` 파일이 이미 생성되어 있습니다.
필요시 API 키나 계정 정보를 수정하세요.

```env
PLAYAUTO_API_KEY=your_api_key
PLAYAUTO_EMAIL=your_email
PLAYAUTO_PASSWORD=your_password
PLAYAUTO_BASE_URL=https://openapi.playauto.io/api
PORT=3001
```

## 실행 방법

### 개발 모드

터미널 2개를 열어서 각각 실행:

```bash
# 터미널 1: 서버 실행
cd server
npm run dev

# 터미널 2: 클라이언트 실행
cd client
npm run dev
```

브라우저에서 http://localhost:5173 접속

### 프로덕션 빌드

```bash
# 클라이언트 빌드
cd client
npm run build

# 서버 실행 (프로덕션)
cd ../server
npm start
```

## 사용 방법

1. **데이터 동기화**: 처음 실행 시 "최근 7일 동기화" 또는 "전체 동기화"를 클릭하여 플레이오토에서 데이터를 가져옵니다.

2. **기간 선택**: 상단 필터에서 분석할 기간을 선택합니다.

3. **스토어 필터**: 특정 스토어만 보고 싶을 때 드롭다운에서 선택합니다.

4. **엑셀 다운로드**: 현재 필터 조건의 데이터를 엑셀로 내려받습니다.

## 프로젝트 구조

```
playauto-dashboard/
├── server/                 # Express 백엔드
│   ├── routes/             # API 라우트
│   ├── services/           # 비즈니스 로직
│   ├── database/           # SQLite DB 파일
│   └── app.js              # 서버 진입점
├── client/                 # React 프론트엔드
│   ├── src/
│   │   ├── components/     # UI 컴포넌트
│   │   └── services/       # API 호출
│   └── index.html
├── .env                    # 환경변수
└── README.md
```

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | /api/shops | 연동 쇼핑몰 목록 |
| GET | /api/orders | 주문 목록 조회 |
| POST | /api/sync | 데이터 동기화 |
| GET | /api/stats/summary | 요약 통계 |
| GET | /api/stats/by-store | 스토어별 통계 |
| GET | /api/stats/by-product | 상품별 통계 |
| GET | /api/stats/trend | 추이 데이터 |
| GET | /api/stats/forecast | 예측 데이터 |
| GET | /api/reports/excel | 엑셀 다운로드 |

## 기술 스택

- **Frontend**: React 18, Vite, Tailwind CSS, Recharts
- **Backend**: Node.js, Express, SQLite (better-sqlite3)
- **API**: PlayAuto Open API

## 배포

### PM2 사용 (권장)

```bash
# PM2 설치
npm install -g pm2

# 클라이언트 빌드
cd client && npm run build && cd ..

# PM2로 서버 실행
cd server
pm2 start app.js --name playauto-dashboard

# 자동 시작 설정
pm2 save
pm2 startup
```

## 라이선스

내부 사용 전용
