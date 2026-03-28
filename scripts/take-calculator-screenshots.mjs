#!/usr/bin/env node

/**
 * 計算器專用截圖腳本
 * 使用更精確的選擇策略
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'http://localhost:3001';
const SCREENSHOTS_DIR = join(__dirname, '../public/screenshots');

const VIEWPORT = { width: 1440, height: 900 };

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function takeCalculatorScreenshots() {
  console.log('🚀 啟動瀏覽器...');
  const browser = await chromium.launch({
    headless: false, // 使用有頭模式以便調試
    slowMo: 500, // 減慢操作速度
  });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  try {
    console.log('📖 訪問首頁...');
    await page.goto(BASE_URL);
    await wait(4000); // 等待頁面完全載入

    // 打開計算器
    console.log('🧮 打開計算器...');

    // 方法 1：使用 CSS 選擇器
    try {
      await page.click('button:has-text("計算器")');
      console.log('✅ 方法 1 成功');
    } catch (e) {
      console.log('⚠️  方法 1 失敗，嘗試方法 2...');

      // 方法 2：使用包含 emoji 的完整文字
      try {
        await page.click('text=🧮 用計算器算');
        console.log('✅ 方法 2 成功');
      } catch (e2) {
        console.log('⚠️  方法 2 失敗，嘗試方法 3...');

        // 方法 3：點擊任何包含「計算」的按鈕
        const buttons = await page.locator('button').all();
        for (const button of buttons) {
          const text = await button.textContent();
          if (text && text.includes('計算')) {
            await button.click();
            console.log('✅ 方法 3 成功，點擊了:', text);
            break;
          }
        }
      }
    }

    await wait(2000);

    // 檢查 Modal 是否打開
    const modal = page.locator('[role="dialog"]').first();
    const isModalVisible = await modal.isVisible().catch(() => false);

    if (!isModalVisible) {
      console.error('❌ Modal 未打開，無法繼續截圖');
      console.log('💡 請手動打開計算器並按任意鍵繼續...');
      // 等待 30 秒讓用戶手動操作
      await wait(30000);
    }

    // 1. 截取基本模式（當前狀態）
    console.log('📸 截取：03-calculator-modal-basic.png');
    await modal.screenshot({
      path: join(SCREENSHOTS_DIR, '03-calculator-modal-basic.png'),
      type: 'png',
    });

    // 2. 嘗試切換到進階模式
    console.log('🔄 切換到進階模式...');
    try {
      const advancedButton = page.locator('button').filter({ hasText: '整面' });
      if (await advancedButton.count() > 0) {
        await advancedButton.first().click();
        await wait(1000);

        // 填入示例數據
        console.log('✏️  填入示例數據...');
        const inputs = await page.locator('input[type="number"]').all();
        if (inputs.length >= 2) {
          await inputs[0].fill('360'); // 整面寬度
          await inputs[1].fill('240'); // 整面高度
          await wait(1500); // 等待自動計算

          // 截取進階模式
          console.log('📸 截取：03-calculator-modal-advanced.png');
          await modal.screenshot({
            path: join(SCREENSHOTS_DIR, '03-calculator-modal-advanced.png'),
            type: 'png',
          });
        }
      }
    } catch (e) {
      console.warn('⚠️  無法自動切換到進階模式，請手動截圖');
      console.log('💡 手動操作後，腳本將在 30 秒後繼續...');
      await wait(30000);

      console.log('📸 截取當前狀態...');
      await modal.screenshot({
        path: join(SCREENSHOTS_DIR, '03-calculator-modal-advanced.png'),
        type: 'png',
      });
    }

    console.log('✅ 計算器截圖完成！');

  } catch (error) {
    console.error('❌ 截圖過程發生錯誤：', error);
    console.log('💡 瀏覽器將保持打開 60 秒，請手動截圖');
    await wait(60000);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('📸 計算器專用截圖工具');
  console.log('=======================');
  console.log(`🌐 目標網址：${BASE_URL}`);
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
    await takeCalculatorScreenshots();
    console.log('');
    console.log('🎉 截圖任務完成！');
  } catch (error) {
    console.error('💥 截圖任務失敗！', error);
    process.exit(1);
  }
}

main();
