# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.2] - 2026-03-22

### Added - 多片組合輸入模式

#### 核心功能
- **整面÷分片輸入模式**：支援輸入整面尺寸後自動計算分片尺寸
  - 輸入模式切換：「每片 × 數量」vs「整面 ÷ 分片」
  - 分片方向：橫切（沿高度）、直切（沿寬度）
  - 分片數量：可調整分片數（+/- 按鈕）
  - 即時顯示每片計算後尺寸

- **才數進位模式對比**：兩種進位方式的成本比較
  - 逐片進位：每片進位後相加
  - 整面進位：總才數進位一次
  - 橘色差異提示：顯示才數與成本差異

#### 計算引擎
- 新增 `calculateSurfaceSplit()` - 根據整面尺寸與分片配置計算單片尺寸
- 新增 `calculateCaiCountDual()` - 同時計算兩種進位模式的才數並對比
- 動態調整 `effectiveWidthCm`, `effectiveHeightCm`, `effectiveQty` 根據輸入模式

#### 使用者介面
- 報價計算器新增「輸入模式」切換器
  - 每片 × 數量（per_piece）：原有模式
  - 整面 ÷ 分片（divide_surface）：新增模式
- 整面÷分片輸入區塊：
  - 整面寬度、高度輸入
  - 分片方向按鈕（橫切/直切）
  - 分片數量調整器（± 按鈕）
  - 每片尺寸計算結果顯示
- 才數計算方式選擇器：
  - 兩種進位模式並排顯示（逐片進位/整面進位）
  - 即時顯示兩種模式的才數差異
  - 橘色提示框：當有差異時顯示詳細計算過程與成本差

#### 資料層
- Google Sheets「報價版本明細」新增 6 欄（AA-AF）：
  - 輸入模式（panelInputMode）
  - 整面寬度cm（surfaceWidthCm）
  - 整面高度cm（surfaceHeightCm）
  - 分片方向（splitDirection）
  - 分片數（splitCount）
  - 才數進位模式（caiRoundingMode）
- 擴展 `FlexQuoteItem` 與 `VersionLineRecord` 型別定義
- 更新所有 Sheets API routes 支援新欄位（26 欄 → 32 欄）

#### 遷移與測試
- 新增遷移腳本 `/api/sheets/migrate-v032`（冪等操作）
- 新增 12 個單元測試（總計 116 tests）
- 完整向下相容保證（舊資料可安全讀取）

### Technical Details
- 新型別：`PanelInputMode`, `CaiRoundingMode`, `SplitDirection`
- 所有新欄位為 optional，確保向下相容
- Sheets Schema 從 26 欄擴展到 32 欄（A-Z → A-AF）

---

## [0.3.1] - 2026-03-22

### Added - 施工加給分級制

#### 核心功能
- **施工加給分級系統**：根據安裝高度與板片尺寸自動計算工資加給
  - 安裝高度分級：一般（≤200cm）0%、中高（200-300cm）+25%、高空（>300cm）+60%
  - 板片尺寸分級：標準（≤180cm）0%、大型（180-240cm）+20%、超大型（>240cm）+40%
  - 兩個維度獨立判定，百分比相加（非相乘）

#### 計算引擎
- 新增 `inferHeightTier()` - 自動判定安裝高度等級
- 新增 `inferPanelSizeTier()` - 自動判定板片尺寸等級
- 新增 `calculateInstallSurcharge()` - 計算總加給百分比
- 新增 `applyInstallSurcharge()` - 套用加給到工資
- 擴展 `calculateLineItem()` 支援施工加給參數

#### 使用者介面
- 報價計算器新增「施工條件」選擇器
  - 安裝高度選擇（3 級下拉選單）
  - 板片尺寸自動偵測（唯讀顯示）
  - 即時顯示加給明細與計算結果
  - 僅在非泡棉內裡時顯示

#### 資料層
- Google Sheets「報價版本明細」新增 3 欄：
  - 安裝高度等級
  - 板片尺寸等級
  - 施工加給%
- 擴展 `VersionLineRecord` 型別定義
- 更新所有 Sheets API routes 支援新欄位

#### 遷移與測試
- 新增遷移腳本 `/api/sheets/migrate-v03`（冪等操作）
- 新增 36 個單元測試（總計 104 tests）
- 完整向下相容保證（舊資料可安全讀取）

### Technical Details
- 新型別：`InstallHeightTier`, `PanelSizeTier`, `InstallSurchargeConfig`
- 新常數：`INSTALL_HEIGHT_TIERS`, `PANEL_SIZE_TIERS`
- 所有新欄位為 optional，確保向下相容
- Sheets Schema 從 23 欄擴展到 26 欄

---

## [0.2.1] - 2026-03-20

### Fixed
- 修復佣金結算重複問題（settlementKey 移除 role）
- 修正歷史定價保護邏輯

### Added
- 完整部署文檔與自動化腳本
- 網站圖示與 PWA 支援

### Changed
- 更新 .gitignore 排除敏感檔案

---

## [0.2.0] - 2026-03-19

### Added - Core Features
- 材料收藏與最近使用功能
- 成本資料管道修復
- 報價版本歷史系統
- 報價範本系統
- Undo/Redo 功能
- 客戶-報價關聯
- 儀表板統計

### Added - v2.2 Features (Batch 1+2)
- 自動草稿儲存
- 報價搜尋功能
- 拖曳排序
- 自動過期標記
- 軟刪除機制

---

## Earlier Versions

See git history for details on versions prior to 0.2.0.
