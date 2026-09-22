# 到府清潔時段自動媒合 — 設計規格

日期：2026-09-22
目標：把「客人給 3 組時段 → 傳師傅 → 師傅挑 → 出單 → 通知」這條人工來回流程自動化，
最大化減少**媒合操作**與**登打**（老闆與內勤幾乎不打字）。

## 決策（已與老闆確認）
- 媒合模式：**師傅親自挑**（保留現模式、自動化傳遞）。原因：師傅非專屬，行程不在系統內，無法做客人自動約。
- 客人給時段：**客人點連結自己選**（老闆零輸入）。
- 師傅確認：**LINE 連結一鍵挑（免登入）**。
- 時段格式：**上午 / 下午 / 晚上 / 皆可**（每個日期四選一）。
- 連結傳送 v1：系統產生短連結，操作者一貼（沿用簽署流程模式）；LINE 自動推播之後再說。

## 流程
1. 售後服務單（到府清潔）→ 按「約清潔時段」→ 建立媒合 session + 客人連結。
2. 客人開連結 → 確認/補**地址、電話**（能減少內勤登打）+ 月曆選最多 **3 個日期**，每個日期選（上午/下午/晚上/皆可）→ 送出。
3. 系統存下時段 + 產生**師傅確認連結** → 操作者貼給師傅。
4. 師傅開連結 → 看客人姓名/地址/品項 + 3 組時段 → **點一個確認**，或按「**都不行**」。
5a. 確認 → 精準寫回售後單 `scheduledDate`/`scheduledTime`、狀態→已排程；沿用 `buildAfterSalesNotifyMessage` 產**給客人的確認訊息**；另產**給師傅派工資訊**（地址/電話/品項/備註/Google Maps 導航）。
5b. 都不行 → session 標記、通知操作者 → 一鍵重發客人連結（回到 2）。

## 資料模型：新工作表「清潔時段」（A:L）
獨立表，不動售後服務欄位對應。確認後只精準 update 售後單既有欄位。
- A sessionId（CLN-YYYYMMDD-XXXX）
- B serviceId（關聯售後服務單）
- C customerToken（客人連結，短亂數）
- D techToken（師傅連結）
- E proposedSlotsJson（`[{date:"2026-09-25", period:"上午|下午|晚上|皆可"}]`，最多 3）
- F confirmedDate / G confirmedPeriod
- H status（`awaiting_customer` / `awaiting_tech` / `confirmed` / `tech_rejected`）
- I customerAddress / J customerPhone（客人於連結填/確認，確認後寫回售後單）
- K createdAt / L updatedAt

## 端點
- `POST /api/sheets/after-sales/[serviceId]/slot-session` → 建 session（customerToken），回客人連結。
- `GET /api/public/cleaning/[token]` → 依 token 類型回檢視資料（客人視圖：服務摘要＋既填地址電話；師傅視圖：3 組時段＋客人/地址/品項）。
- `POST /api/public/cleaning/[token]`：
  - 客人 token：body {slots[], address, phone} → 存 proposedSlots＋地址電話、產 techToken、status→awaiting_tech，回師傅連結。
  - 師傅 token：body {chosenIndex} 或 {reject:true} → 確認則寫回售後單、status→confirmed；拒絕則 status→tech_rejected。
- 客人/師傅視圖與提交沿用 `sign/[token]` 的公開頁模式（免登入、middleware 放行 `/api/public/*` 與 `/cleaning/*`）。

## UI 觸點（售後服務編輯頁 AfterSalesEditorClient）
- 「約清潔時段」按鈕：產生客人連結 → 顯示可複製連結（＋一句貼給客人的引導文案）。
- 媒合狀態區：顯示客人已選的 3 組、師傅連結（可複製）、確認結果。
- 確認後：一鍵複製「客人確認訊息」（沿用既有）＋「師傅派工資訊」。

## 沿用（不重造）
簽署短連結/token 模式、售後服務單與其 scheduledDate/Time、`buildAfterSalesNotifyMessage`、LINE 貼訊息習慣、Google Maps 導航連結（訂單頁已有作法）。

## 邊界
- 客人重送：覆蓋既有 proposedSlots（同 session）。
- 師傅拒絕：不清空，標記 tech_rejected，操作者可重發客人連結。
- token 失效/找不到：公開頁顯示友善訊息。
- 金額/簽名不涉入本流程（純排程）。

## v1 範圍
happy path（客人選→師傅挑→出單通知）＋師傅「都不行」重來。LINE 自動推播、時段衝突偵測、客人自助改期＝之後迭代。
