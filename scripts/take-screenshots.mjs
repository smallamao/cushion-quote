#!/usr/bin/env node

/**
 * 自動化截圖腳本
 * 用途：生成系統使用說明所需的所有截圖
 * 執行：node scripts/take-screenshots.mjs
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'http://localhost:3001';
const SCREENSHOTS_DIR = join(__dirname, '../public/screenshots');

// 截圖配置
const VIEWPORT = { width: 1440, height: 900 };
const SCREENSHOT_OPTIONS = {
  type: 'png',
  fullPage: false,
};

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function takeScreenshots() {
  console.log('🚀 啟動瀏覽器...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  try {
    // 1. 首頁/儀表板
    console.log('📸 截取：01-sidebar-dashboard.png');
    await page.goto(BASE_URL);
    await wait(2000); // 等待資料載入
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '01-sidebar-dashboard.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 2. 報價工作台
    console.log('📸 截取：02-quote-editor.png');
    await page.goto(`${BASE_URL}/quotes`);
    await wait(2000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '02-quote-editor.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 3. 計算器 - 基本模式（每片×數量 + 施工加給）
    console.log('📸 截取：03-calculator-modal-basic.png');
    await page.goto(BASE_URL); // 首頁就是報價工作台
    await wait(3000);

    // 點擊「用計算器算」按鈕（包含 emoji）
    const calcButton = page.locator('button').filter({ hasText: '用計算器算' });
    await calcButton.click();
    await wait(2000);

    // 選擇作法：單面板
    const methodButtons = page.locator('button:has-text("單面板")');
    await methodButtons.first().click();
    await wait(500);

    // 確保是「每片×數量」模式（預設）
    // 輸入尺寸
    await page.fill('input[type="number"]', '180'); // 寬度
    const heightInput = page.locator('input[type="number"]').nth(1);
    await heightInput.fill('120'); // 高度
    await wait(500);

    // 選擇厚度
    const thicknessButtons = page.locator('button:has-text("1.5"")');
    if (await thicknessButtons.count() > 0) {
      await thicknessButtons.first().click();
      await wait(500);
    }

    // 選擇通路（如果需要）
    const channelTab = page.locator('button:has-text("設計師")');
    if (await channelTab.count() > 0) {
      await channelTab.click();
      await wait(500);
    }

    // 等待計算完成
    await wait(1000);

    // 截取整個 Modal
    const modal = page.locator('[role="dialog"]').first();
    await modal.screenshot({
      path: join(SCREENSHOTS_DIR, '03-calculator-modal-basic.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 4. 計算器 - 進階模式（整面÷分片）
    console.log('📸 截取：03-calculator-modal-advanced.png');

    // 點擊「整面 ÷ 分片」按鈕
    const advancedModeButton = page.locator('button:has-text("整面 ÷ 分片")');
    if (await advancedModeButton.count() > 0) {
      await advancedModeButton.click();
      await wait(500);

      // 輸入整面尺寸
      const surfaceWidthInput = page.locator('input[type="number"]').first();
      const surfaceHeightInput = page.locator('input[type="number"]').nth(1);

      await surfaceWidthInput.fill('360');
      await surfaceHeightInput.fill('240');
      await wait(500);

      // 選擇橫切
      const horizontalButton = page.locator('button:has-text("橫切")');
      if (await horizontalButton.count() > 0) {
        await horizontalButton.click();
        await wait(500);
      }

      // 調整分片數到 3 片（可能需要點擊 + 按鈕）
      const plusButton = page.locator('button:has-text("+")');
      if (await plusButton.count() > 0) {
        // 點擊 + 按鈕調整到 3 片
        await plusButton.last().click();
        await wait(300);
      }

      // 等待計算完成與自動偵測
      await wait(1500);

      // 向下滾動以顯示完整內容
      await modal.evaluate(el => el.scrollTop = el.scrollHeight / 2);
      await wait(500);

      // 截取整個 Modal
      await modal.screenshot({
        path: join(SCREENSHOTS_DIR, '03-calculator-modal-advanced.png'),
        ...SCREENSHOT_OPTIONS,
      });
    }

    // 關閉 Modal
    const closeButton = page.locator('button:has-text("取消")');
    if (await closeButton.count() > 0) {
      await closeButton.first().click();
      await wait(500);
    }

    // 5. PDF 預覽
    console.log('📸 截取：07-pdf-preview.png');
    await page.goto(`${BASE_URL}/quotes`);
    await wait(2000);

    // 點擊預覽 PDF 按鈕（如果存在）
    const pdfButton = page.locator('button:has-text("預覽 PDF")');
    if (await pdfButton.count() > 0) {
      await pdfButton.click();
      await wait(2000);

      const pdfModal = page.locator('[role="dialog"]').first();
      await pdfModal.screenshot({
        path: join(SCREENSHOTS_DIR, '07-pdf-preview.png'),
        ...SCREENSHOT_OPTIONS,
      });

      // 關閉 PDF Modal
      const closePdfButton = page.locator('button').filter({ hasText: '關閉' });
      if (await closePdfButton.count() > 0) {
        await closePdfButton.first().click();
        await wait(500);
      }
    }

    // 6. 客戶管理
    console.log('📸 截取：08-clients.png');
    await page.goto(`${BASE_URL}/clients`);
    await wait(2000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '08-clients.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 7. 材質資料庫
    console.log('📸 截取：09-materials.png');
    await page.goto(`${BASE_URL}/materials`);
    await wait(2000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '09-materials.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 8. 案件管理
    console.log('📸 截取：10-cases.png');
    await page.goto(`${BASE_URL}/cases`);
    await wait(2000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '10-cases.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 9. 系統設定
    console.log('📸 截取：11-settings.png');
    await page.goto(`${BASE_URL}/settings`);
    await wait(2000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '11-settings.png'),
      ...SCREENSHOT_OPTIONS,
    });

    console.log('✅ 所有截圖已生成完成！');
    console.log(`📁 截圖儲存位置：${SCREENSHOTS_DIR}`);

  } catch (error) {
    console.error('❌ 截圖過程發生錯誤：', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// 主程式
async function main() {
  console.log('📸 繃布報價系統 - 自動化截圖工具');
  console.log('=====================================');
  console.log(`🌐 目標網址：${BASE_URL}`);
  console.log(`📐 視窗大小：${VIEWPORT.width} × ${VIEWPORT.height}`);
  console.log('');

  // 檢查開發服務器是否運行
  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) {
      throw new Error('開發服務器未回應');
    }
  } catch (error) {
    console.error('❌ 無法連接到開發服務器！');
    console.error('💡 請先執行：npm run dev -- -p 3001');
    console.error('💡 或執行：./RESTART_QUOTE_SYSTEM.sh');
    process.exit(1);
  }

  try {
    await takeScreenshots();
    console.log('');
    console.log('🎉 截圖任務完成！');
  } catch (error) {
    console.error('');
    console.error('💥 截圖任務失敗！');
    console.error(error);
    process.exit(1);
  }
}

main();
