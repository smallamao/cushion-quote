# 09-system-settings.md

## 功能概述
- 用途說明：管理全域系統參數，如通路倍率、預設條款、稅率。
- 使用者角色：管理員

## 相關檔案
| 類型 | 檔案路徑 |
|------|---------|
| 前端頁面 | `src/app/settings/page.tsx` |
| 前端元件 | `src/app/settings/SettingsClient.tsx` |
| API | `src/app/api/sheets/settings/route.ts` |

## 技術架構

### 設定項說明
- **通路倍率**：不同通路（如：門市、設計師、線上）的毛利加價倍率。
- **預設條款**：PDF 報價單底部的法律聲明。
- **佣金設定**：預設的佣金計算模式。

## 相依模組
- `08-pos-quotation.md`
