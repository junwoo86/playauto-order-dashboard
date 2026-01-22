import { test, expect } from '@playwright/test';

test.describe('플레이오토 대시보드 테스트', () => {

  test('1. 메인 페이지 로드', async ({ page }) => {
    await page.goto('/');

    // 헤더 확인
    await expect(page.locator('h1')).toContainText('플레이오토 주문 분석');

    // 동기화 패널 확인
    await expect(page.getByText('데이터 동기화')).toBeVisible();

    // 스크린샷 저장
    await page.screenshot({ path: 'tests/screenshots/01-main-page.png' });
  });

  test('2. 데이터 동기화 시작', async ({ page }) => {
    await page.goto('/');

    // "전체" 버튼 클릭
    await page.getByRole('button', { name: '전체' }).click();

    // 전체 동기화 폼이 나타나는지 확인
    await expect(page.getByText('전체 동기화 기간 설정')).toBeVisible();

    // 날짜 입력 (최근 1개월)
    const today = new Date();
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const sdate = monthAgo.toISOString().split('T')[0];
    const edate = today.toISOString().split('T')[0];

    // 날짜 필드 찾아서 입력
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.first().fill(sdate);
    await dateInputs.nth(1).fill(edate);

    await page.screenshot({ path: 'tests/screenshots/02-sync-form.png' });

    // 전체 동기화 버튼 클릭
    await page.getByRole('button', { name: '전체 동기화 시작' }).click();

    // 동기화 시작 확인 (버튼이 로딩 상태로 변경되거나 메시지 표시)
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/screenshots/03-sync-started.png' });
  });

  test('3. 동기화 완료 대기 및 대시보드 확인', async ({ page }) => {
    await page.goto('/');

    // 동기화 완료 대기 (최대 2분)
    await page.waitForTimeout(5000);

    // 페이지 새로고침
    await page.reload();
    await page.waitForTimeout(3000);

    // 총 주문 카드 확인
    const orderCard = page.getByText('총 주문');
    if (await orderCard.isVisible()) {
      await page.screenshot({ path: 'tests/screenshots/04-dashboard-loaded.png' });
    }
  });

  test('4. 날짜 필터 테스트', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // "최근 7일" 버튼 클릭
    const recentButton = page.getByRole('button', { name: '최근 7일' });
    if (await recentButton.isVisible()) {
      await recentButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'tests/screenshots/05-filter-7days.png' });
    }

    // "최근 30일" 버튼 클릭
    const monthButton = page.getByRole('button', { name: '최근 30일' });
    if (await monthButton.isVisible()) {
      await monthButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'tests/screenshots/06-filter-30days.png' });
    }
  });

  test('5. 스토어별 차트 확인', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 스토어별 매출 섹션 확인
    const storeSection = page.getByText('스토어별 매출');
    if (await storeSection.isVisible()) {
      // 파이 차트 버튼 클릭
      const pieButton = page.getByRole('button', { name: '파이' });
      if (await pieButton.isVisible()) {
        await pieButton.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'tests/screenshots/07-store-pie-chart.png' });
      }

      // 막대 차트 버튼 클릭
      const barButton = page.getByRole('button', { name: '막대' });
      if (await barButton.isVisible()) {
        await barButton.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'tests/screenshots/08-store-bar-chart.png' });
      }
    }
  });

  test('6. 추이 차트 확인', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 매출 추이 섹션으로 스크롤
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(1000);

    // 매출 버튼 클릭
    const revenueButton = page.locator('button:has-text("매출")').first();
    if (await revenueButton.isVisible()) {
      await revenueButton.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: 'tests/screenshots/09-trend-revenue.png' });

    // 주문수 버튼 클릭
    const orderButton = page.locator('button:has-text("주문수")').first();
    if (await orderButton.isVisible()) {
      await orderButton.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: 'tests/screenshots/10-trend-orders.png' });
  });

  test('7. 예측 차트 확인', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 예측 섹션으로 스크롤
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/screenshots/11-forecast.png' });
  });

  test('8. 엑셀 다운로드 버튼 확인', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // 엑셀 다운로드 버튼 확인
    const downloadButton = page.getByRole('button', { name: /엑셀 다운로드/ });
    await expect(downloadButton).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/12-excel-button.png' });
  });

});
