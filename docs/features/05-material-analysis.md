# 05-material-analysis.md

## 功能概述
- 用途說明：管理面料（Materials）資料庫，包含品牌、系列、單價及損耗率。
- 使用者角色：管理員

## 相關檔案
| 類型 | 檔案路徑 |
|------|---------|
| 前端頁面 | `src/app/materials/page.tsx` |
| 前端元件 | `src/components/materials/MaterialTable.tsx` |
| API | `src/app/api/sheets/materials/route.ts` |

## 技術架構

### API 端點
| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/sheets/materials` | 獲取材料列表 |
| POST | `/api/sheets/materials` | 新增/更新材料 |

## 功能細節
- 維護面料基本資訊，供報價計算器調用。
- 支援圖片連結上傳（透過 Cloudinary）。

## 相依模組
- `08-pos-quotation.md`
