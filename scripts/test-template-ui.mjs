#!/usr/bin/env node

/**
 * 報價範本功能 UI 測試腳本
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'http://localhost:3001';
const SCREENSHOTS_DIR = join(__dirname, '../public/screenshots/template-test');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTemplateFeatures() {
  console.log('🚀 啟動瀏覽器...');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    // ===== 測試 1: 設定頁面 - 範本管理 UI =====
    console.log('\n📋 測試 1: 設定頁面範本管理');
    await page.goto(`${BASE_URL}/settings`);
    await wait(3000);

    // 滾動到範本管理區塊
    const templateSection = page.locator('text=報價範本管理').first();
    if (await templateSection.count() > 0) {
      await templateSection.scrollIntoViewIfNeeded();
      await wait(2000);
    }

    console.log('📸 截取：設定頁面範本管理區塊');
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, '01-settings-template-manager.png'),
      fullPage: true,
    });

    // 測試新增範本按鈕
    console.log('🔍 檢查「新增範本」按鈕是否存在...');
    const addButtonExists = await page.locator('button:has-text("新增範本")').count() > 0;
    console.log(addButtonExists ? '✅ 找到新增範本按鈕' : '❌ 未找到新增範本按鈕');

    // 測試範本列表
    console.log('🔍 檢查範本列表...');
    const templateCount = await page.locator('[class*="card-surface"] >> text=/測試範本|TPL-/').count();
    console.log(`✅ 找到 ${templateCount} 個範本`);

    // ===== 測試 2: 報價工作台 - 套用範本 =====
    console.log('\n📋 測試 2: 報價工作台 - 套用範本功能');
    await page.goto(BASE_URL);
    await wait(3000);

    console.log('🔍 尋找「套用整單範本」按鈕...');
    const applyButtonSelectors = [
      'button:has-text("套用整單範本")',
      'button >> text=/套用.*範本/',
      'text=📄',
    ];

    let applyButtonFound = false;
    for (const selector of applyButtonSelectors) {
      try {
        const count = await page.locator(selector).count();
        if (count > 0) {
          console.log(`✅ 找到套用範本按鈕: ${selector}`);
          applyButtonFound = true;

          // 點擊按鈕
          await page.locator(selector).first().click();
          await wait(1500);

          // 檢查下拉選單
          const dropdownVisible = await page.locator('[class*="absolute"][class*="z-50"]').isVisible().catch(() => false);
          if (dropdownVisible) {
            console.log('✅ 範本下拉選單已開啟');

            console.log('📸 截取：套用範本下拉選單');
            await page.screenshot({
              path: join(SCREENSHOTS_DIR, '02-quote-editor-apply-template.png'),
            });

            // 檢查範本選項
            const templateOptions = await page.locator('[class*="absolute"][class*="z-50"] button').count();
            console.log(`✅ 找到 ${templateOptions} 個範本選項`);
          } else {
            console.log('❌ 範本下拉選單未開啟');
          }

          // 關閉下拉選單
          await page.keyboard.press('Escape');
          await wait(500);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!applyButtonFound) {
      console.log('❌ 未找到套用範本按鈕');
    }

    // ===== 測試 3: 報價工作台 - 存為範本 =====
    console.log('\n📋 測試 3: 報價工作台 - 存為範本功能');

    // 先新增一個測試品項
    console.log('➕ 新增測試品項...');
    const addItemButton = page.locator('button:has-text("新增品項")').first();
    if (await addItemButton.count() > 0) {
      await addItemButton.click();
      await wait(1000);

      // 填寫品項名稱
      const nameInput = page.locator('input[placeholder*="品項名稱"]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill('UI測試品項');
        await wait(500);
      }
    }

    console.log('🔍 尋找「存為範本」按鈕...');
    const saveButtonSelectors = [
      'button:has-text("存為範本")',
      'button >> text=/存.*範本/',
      'text=💾',
    ];

    let saveButtonFound = false;
    for (const selector of saveButtonSelectors) {
      try {
        const count = await page.locator(selector).count();
        if (count > 0) {
          console.log(`✅ 找到存為範本按鈕: ${selector}`);
          saveButtonFound = true;

          // 點擊按鈕
          await page.locator(selector).first().click();
          await wait(1500);

          // 檢查對話框
          const dialogVisible = await page.locator('[class*="fixed"][class*="z-50"] >> text=儲存為範本').isVisible().catch(() => false);
          if (dialogVisible) {
            console.log('✅ 存為範本對話框已開啟');

            console.log('📸 截取：存為範本對話框');
            await page.screenshot({
              path: join(SCREENSHOTS_DIR, '03-quote-editor-save-template-dialog.png'),
            });

            // 測試填寫表單
            const nameInput = page.locator('input[placeholder*="範本名稱"]');
            if (await nameInput.count() > 0) {
              await nameInput.fill('UI 自動測試範本');
              await wait(500);
              console.log('✅ 成功填寫範本名稱');
            }

            const descInput = page.locator('textarea[placeholder*="範本"]');
            if (await descInput.count() > 0) {
              await descInput.fill('這是 UI 自動化測試建立的範本');
              await wait(500);
              console.log('✅ 成功填寫範本說明');
            }

            console.log('📸 截取：填寫完成的對話框');
            await page.screenshot({
              path: join(SCREENSHOTS_DIR, '04-quote-editor-save-template-filled.png'),
            });

            // 點擊取消（不實際儲存，避免污染測試資料）
            const cancelButton = page.locator('button:has-text("取消")').first();
            if (await cancelButton.count() > 0) {
              await cancelButton.click();
              await wait(500);
              console.log('✅ 已關閉對話框（測試模式）');
            }
          } else {
            console.log('❌ 存為範本對話框未開啟');
          }
          break;
        }
      } catch (e) {
        console.log(`   ⚠️  ${selector} 失敗:`, e.message.split('\n')[0]);
        continue;
      }
    }

    if (!saveButtonFound) {
      console.log('❌ 未找到存為範本按鈕');
    }

    // ===== 測試 4: 回到設定頁面檢查 =====
    console.log('\n📋 測試 4: 回到設定頁面驗證');
    await page.goto(`${BASE_URL}/settings`);
    await wait(3000);

    // 滾動到範本管理
    const templateSection2 = page.locator('text=報價範本管理').first();
    if (await templateSection2.count() > 0) {
      await templateSection2.scrollIntoViewIfNeeded();
      await wait(2000);
    }

    // 檢查範本列表更新
    const finalTemplateCount = await page.locator('[class*="rounded-"][class*="border"] >> text=/測試範本|TPL-/').count();
    console.log(`✅ 最終範本數量: ${finalTemplateCount}`);

    console.log('\n✅ 所有 UI 測試完成！');
    console.log(`📁 截圖儲存位置：${SCREENSHOTS_DIR}`);

    // 保持瀏覽器開啟 10 秒供檢視
    console.log('\n⏰ 瀏覽器將在 10 秒後關閉...');
    await wait(10000);

  } catch (error) {
    console.error('\n❌ 測試過程發生錯誤：', error);
    console.log('\n💡 瀏覽器將保持開啟 30 秒供檢查...');
    await wait(30000);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('📸 報價範本功能 UI 測試');
  console.log('=====================================');
  console.log(`🌐 目標網址：${BASE_URL}`);
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

  // 建立截圖目錄
  const { mkdirSync } = await import('fs');
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  try {
    await testTemplateFeatures();
    console.log('\n🎉 UI 測試任務完成！');
  } catch (error) {
    console.error('\n💥 UI 測試任務失敗！');
    console.error(error);
    process.exit(1);
  }
}

main();
