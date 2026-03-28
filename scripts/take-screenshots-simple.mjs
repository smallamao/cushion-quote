#!/usr/bin/env node

/**
 * 簡化版自動化截圖腳本
 * 只截取靜態頁面，不進行複雜的 UI 操作
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'http://localhost:3001';
const SCREENSHOTS_DIR = join(__dirname, '../public/screenshots');

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
    // 1. 首頁/儀表板/報價工作台
    console.log('📸 截取：01-sidebar-dashboard.png');
    await page.goto(BASE_URL);
    await wait(3000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '01-sidebar-dashboard.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 2. 報價工作台（同首頁）
    console.log('📸 截取：02-quote-editor.png');
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '02-quote-editor.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 3. 客戶管理
    console.log('📸 截取：08-clients.png');
    await page.goto(`${BASE_URL}/clients`);
    await wait(3000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '08-clients.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 4. 材質資料庫
    console.log('📸 截取：09-materials.png');
    await page.goto(`${BASE_URL}/materials`);
    await wait(3000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '09-materials.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 5. 案件管理
    console.log('📸 截取：10-cases.png');
    await page.goto(`${BASE_URL}/cases`);
    await wait(3000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '10-cases.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 6. 系統設定
    console.log('📸 截取：11-settings.png');
    await page.goto(`${BASE_URL}/settings`);
    await wait(3000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '11-settings.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 7. 佣金管理
    console.log('📸 截取：12-commissions.png');
    await page.goto(`${BASE_URL}/commissions`);
    await wait(3000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '12-commissions.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 8. 使用說明
    console.log('📸 截取：13-help.png');
    await page.goto(`${BASE_URL}/help`);
    await wait(3000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '13-help.png'),
      ...SCREENSHOT_OPTIONS,
    });

    console.log('✅ 基本頁面截圖已完成！');
    console.log('');
    console.log('💡 提示：計算器 Modal 等複雜互動畫面需要手動截取');
    console.log('   1. 開啟 http://localhost:3001');
    console.log('   2. 點擊「用計算器算」');
    console.log('   3. 設定好參數後手動截圖');

  } catch (error) {
    console.error('❌ 截圖過程發生錯誤：', error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('📸 繃布報價系統 - 簡化版自動化截圖');
  console.log('=====================================');
  console.log(`🌐 目標網址：${BASE_URL}`);
  console.log(`📐 視窗大小：${VIEWPORT.width} × ${VIEWPORT.height}`);
  console.log('');

  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) throw new Error('服務器未回應');
  } catch (error) {
    console.error('❌ 無法連接到開發服務器！');
    console.error('💡 請先執行：npm run dev -- -p 3001');
    process.exit(1);
  }

  try {
    await takeScreenshots();
    console.log('');
    console.log('🎉 截圖任務完成！');
    console.log(`📁 儲存位置：${SCREENSHOTS_DIR}`);
  } catch (error) {
    console.error('💥 截圖任務失敗！', error);
    process.exit(1);
  }
}

main();
