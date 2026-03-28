#!/usr/bin/env node

/**
 * 強化版自動化截圖腳本
 * 使用更強大的等待和選擇策略
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'http://localhost:3001';
const SCREENSHOTS_DIR = join(__dirname, '../public/screenshots');

const VIEWPORT = { width: 1440, height: 900 };
const SCREENSHOT_OPTIONS = { type: 'png', fullPage: false };

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 智能點擊：嘗試多種方式點擊元素
async function smartClick(page, selectors, description) {
  console.log(`🎯 嘗試點擊: ${description}`);

  for (const selector of selectors) {
    try {
      console.log(`   試用選擇器: ${selector}`);

      // 等待元素出現並可點擊
      await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });

      // 滾動到元素位置
      await page.locator(selector).first().scrollIntoViewIfNeeded();
      await wait(500);

      // 點擊
      await page.locator(selector).first().click();
      console.log(`   ✅ 成功點擊！`);
      return true;

    } catch (e) {
      console.log(`   ⚠️  此選擇器失敗: ${e.message.split('\n')[0]}`);
      continue;
    }
  }

  console.log(`   ❌ 所有選擇器都失敗`);
  return false;
}

// 智能填寫：嘗試填寫表單欄位
async function smartFill(page, index, value, description) {
  console.log(`✏️  填寫 ${description}: ${value}`);

  try {
    const inputs = await page.locator('input[type="number"]').all();
    if (inputs.length > index) {
      await inputs[index].fill(value.toString());
      await wait(300);
      return true;
    }
  } catch (e) {
    console.log(`   ⚠️  填寫失敗: ${e.message}`);
  }

  return false;
}

async function takeScreenshots() {
  console.log('🚀 啟動瀏覽器...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // 設置更長的預設超時
  page.setDefaultTimeout(60000);

  try {
    // 1. 首頁/儀表板
    console.log('\n📸 截取：01-sidebar-dashboard.png');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await wait(3000);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '01-sidebar-dashboard.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 2. 報價工作台
    console.log('\n📸 截取：02-quote-editor.png');
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '02-quote-editor.png'),
      ...SCREENSHOT_OPTIONS,
    });

    // 3. 計算器 - 基本模式
    console.log('\n📸 準備截取計算器基本模式...');

    // 嘗試多種方式打開計算器
    const calcButtonSelectors = [
      'button:has-text("用計算器算")',
      'button:has-text("計算器")',
      'text=🧮',
      'button >> text=用計算器算',
    ];

    const calcOpened = await smartClick(page, calcButtonSelectors, '計算器按鈕');

    if (!calcOpened) {
      console.log('⚠️  無法打開計算器，嘗試使用 JS 直接操作...');

      // 使用 JavaScript 直接查找並點擊按鈕
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const calcButton = buttons.find(btn =>
          btn.textContent && btn.textContent.includes('計算器')
        );
        if (calcButton) {
          calcButton.click();
          return true;
        }
        return false;
      });

      await wait(2000);
    } else {
      await wait(2000);
    }

    // 檢查 Modal 是否打開
    const modal = page.locator('[role="dialog"]').first();
    const modalVisible = await modal.isVisible().catch(() => false);

    if (!modalVisible) {
      console.log('❌ Modal 未打開，跳過計算器截圖');
    } else {
      console.log('✅ Modal 已打開！');

      // 等待 Modal 內容完全載入
      await wait(1500);

      // 截取基本模式（當前狀態）
      console.log('📸 截取：03-calculator-modal-basic.png');
      await modal.screenshot({
        path: join(SCREENSHOTS_DIR, '03-calculator-modal-basic.png'),
        ...SCREENSHOT_OPTIONS,
      });

      // 嘗試切換到進階模式
      console.log('\n🔄 嘗試切換到進階模式...');
      const advancedModeSelectors = [
        'button:has-text("整面 ÷ 分片")',
        'button:has-text("整面")',
        'text=整面 ÷ 分片',
      ];

      const switchedToAdvanced = await smartClick(page, advancedModeSelectors, '整面÷分片按鈕');

      if (switchedToAdvanced) {
        await wait(1000);

        // 填寫示例數據
        await smartFill(page, 0, 360, '整面寬度');
        await smartFill(page, 1, 240, '整面高度');

        // 等待自動計算
        await wait(2000);

        // 嘗試點擊橫切按鈕
        const horizontalSelectors = [
          'button:has-text("橫切")',
          'text=橫切（沿高度）',
        ];
        await smartClick(page, horizontalSelectors, '橫切按鈕');
        await wait(500);

        // 截取進階模式
        console.log('📸 截取：03-calculator-modal-advanced.png');

        // 向下滾動一點以顯示更多內容
        await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          if (dialog) {
            const scrollableContent = dialog.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollableContent) {
              scrollableContent.scrollTop = 200;
            }
          }
        });
        await wait(500);

        await modal.screenshot({
          path: join(SCREENSHOTS_DIR, '03-calculator-modal-advanced.png'),
          ...SCREENSHOT_OPTIONS,
        });
      } else {
        console.log('⚠️  無法切換到進階模式，使用當前狀態作為進階模式截圖');
        await modal.screenshot({
          path: join(SCREENSHOTS_DIR, '03-calculator-modal-advanced.png'),
          ...SCREENSHOT_OPTIONS,
        });
      }

      // 關閉 Modal
      const closeSelectors = [
        'button:has-text("取消")',
        '[aria-label="Close"]',
        'button[type="button"]',
      ];
      await smartClick(page, closeSelectors, '關閉按鈕');
      await wait(1000);
    }

    // 4-8. 其他頁面
    const pages = [
      { url: '/clients', file: '08-clients.png', name: '客戶管理' },
      { url: '/materials', file: '09-materials.png', name: '材質資料庫' },
      { url: '/cases', file: '10-cases.png', name: '案件管理' },
      { url: '/settings', file: '11-settings.png', name: '系統設定' },
      { url: '/commissions', file: '12-commissions.png', name: '佣金管理' },
      { url: '/help', file: '13-help.png', name: '使用說明' },
    ];

    for (const { url, file, name } of pages) {
      console.log(`\n📸 截取：${file} - ${name}`);
      await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle' });
      await wait(2000);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, file),
        ...SCREENSHOT_OPTIONS,
      });
    }

    console.log('\n✅ 所有截圖已生成完成！');
    console.log(`📁 截圖儲存位置：${SCREENSHOTS_DIR}`);

  } catch (error) {
    console.error('\n❌ 截圖過程發生錯誤：', error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('📸 繃布報價系統 - 強化版自動化截圖');
  console.log('=====================================');
  console.log(`🌐 目標網址：${BASE_URL}`);
  console.log(`📐 視窗大小：${VIEWPORT.width} × ${VIEWPORT.height}`);
  console.log('');

  // 檢查開發服務器
  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) throw new Error('服務器未回應');
    console.log('✅ 開發服務器運行正常\n');
  } catch (error) {
    console.error('❌ 無法連接到開發服務器！');
    console.error('💡 請先執行：npm run dev -- -p 3001');
    process.exit(1);
  }

  try {
    await takeScreenshots();
    console.log('\n🎉 截圖任務完成！');
  } catch (error) {
    console.error('\n💥 截圖任務失敗！');
    console.error(error);
    process.exit(1);
  }
}

main();
