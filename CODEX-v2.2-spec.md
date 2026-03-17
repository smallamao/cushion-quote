# CODEX 開發說明書 — CushionQuote v2.2 功能增強

> **前置文件**：先讀 `CODEX-HANDOFF.md` 了解專案背景，再讀本文件。
> **本文件範疇**：在現有 v2.1 基礎上增加 9 項功能，不改動現有計算邏輯。

---

## 目錄

1. [專案現況摘要](#1-專案現況摘要)
2. [開發原則](#2-開發原則)
3. [Feature 1：自動暫存](#feature-1自動暫存-auto-draft)
4. [Feature 2：報價搜尋篩選](#feature-2報價搜尋篩選)
5. [Feature 3：品項拖拉排序](#feature-3品項拖拉排序)
6. [Feature 4：整單報價範本](#feature-4整單報價範本)
7. [Feature 5：到期自動過期](#feature-5到期自動過期)
8. [Feature 6：Undo / Redo](#feature-6undo--redo)
9. [Feature 7：客戶↔報價關聯](#feature-7客戶報價關聯)
10. [Feature 8：報價版本歷史](#feature-8報價版本歷史)
11. [Feature 9：Dashboard 統計面板](#feature-9dashboard-統計面板)
12. [跨功能：Soft Delete](#跨功能soft-delete)
13. [開發順序與依賴關係](#開發順序與依賴關係)
14. [驗收總則](#驗收總則)

---

## 1. 專案現況摘要

| 項目 | 值 |
|---|---|
| 框架 | Next.js 15 App Router, TypeScript, Tailwind v4, shadcn/ui |
| 儲存 | Google Sheets API (6 sheets)，前端 localStorage 快取 |
| PDF | @react-pdf/renderer（client-side, Noto Sans TC） |
| 部署 | Vercel |
| 認證 | 無（內部 3-4 人使用） |

**現有 Google Sheets 結構**：

| Sheet 名稱 | 範圍 | 欄位數 | 用途 |
|---|---|---|---|
| 報價紀錄 | A:S (19 欄) | quoteId ~ updatedAt | 報價 header |
| 報價明細 | A:R (18 欄) | quoteId ~ notes | 報價 line items |
| 材質資料庫 | A:R (18 欄) | id ~ updatedAt | 材質 CRUD |
| 工資表 | A:H (8 欄) | method_id ~ options | 工法定義 (read-only) |
| 客戶資料庫 | A:T (20 欄) | id ~ notes | 客戶 CRUD |
| 系統設定 | A:B (key-value) | key, value | 系統設定 |

---

## 2. 開發原則

1. **不動現有計算邏輯** — `pricing-engine.ts` 不改
2. **不改現有 API 合約** — 只 extend，不 break existing consumers
3. **型別安全** — 禁止 `as any`、`@ts-ignore`、`@ts-expect-error`
4. **向下相容** — 新欄位用 optional，舊資料不會壞
5. **每個 Feature 獨立可測** — 不依賴其他未完成 Feature（除非明確標註）
6. **UI 風格** — 沿用現有 CSS variable 體系（`var(--text-primary)` 等）和 shadcn/ui

---

## Feature 1：自動暫存 (Auto-Draft)

### 目標
編輯報價時定期自動存到 localStorage，重整頁面不會遺失。

### 修改檔案
- `src/components/quote-editor/QuoteEditor.tsx`

### 實作規格

**儲存 key**：`quote-auto-draft`

**儲存內容** (JSON)：
```typescript
interface AutoDraft {
  savedAt: string;           // ISO timestamp
  quoteId: string;
  isEditMode: boolean;
  selectedClientId: string;
  companyName: string;
  contactName: string;
  phone: string;
  taxId: string;
  projectName: string;
  email: string;
  address: string;
  channel: Channel;
  items: FlexQuoteItem[];    // 含 imageUrl（base64 可能很大，見下方注意事項）
  description: string;
  descriptionImageUrl: string;
  includeTax: boolean;
  termsTemplate: string;
}
```

**觸發時機**：
- items / description / client info 任一 state 變更後，debounce 2 秒寫入
- 使用 `useEffect` + `setTimeout` 實作 debounce，不需額外套件

**恢復流程**：
- 元件 mount 時檢查 `localStorage.getItem("quote-auto-draft")`
- 如果有且 `savedAt` 在 24 小時內 → 跳 `confirm("發現未儲存的草稿（{savedAt}），要還原嗎？")`
- 使用者確認 → 還原所有 state
- 使用者取消 → `localStorage.removeItem("quote-auto-draft")`
- 超過 24 小時 → 靜默清除

**清除時機**：
- `handleSave()` 成功後
- `handleSaveAs()` 成功後
- `handleNewQuote()` 被呼叫時

**注意事項**：
- `FlexQuoteItem.imageUrl` 是 base64 data URL，可能很大。如果 localStorage 寫入失敗（quota exceeded），catch 並靜默忽略，不影響使用者操作
- 不要存 `pdfBlob`、`pdfPreviewOpen` 等 UI-only state

### 驗收條件
- [ ] 編輯報價 → 等 3 秒 → 重整頁面 → 出現還原提示 → 確認 → 內容完整恢復
- [ ] 儲存報價成功 → 重整頁面 → 不出現還原提示
- [ ] 新建報價 → 之前的草稿被清除
- [ ] 圖片 base64 過大導致 localStorage 爆掉 → 不 crash，靜默失敗
- [ ] TypeScript 編譯通過

---

## Feature 2：報價搜尋篩選

### 目標
報價紀錄頁面可依客戶名、狀態、日期範圍篩選。

### 修改檔案
- `src/app/quotes/QuotesClient.tsx`

### 實作規格

**新增 state**：
```typescript
const [searchText, setSearchText] = useState("");           // 文字搜尋
const [filterStatus, setFilterStatus] = useState<QuoteStatus | "all">("all");  // 狀態篩選
const [filterDateFrom, setFilterDateFrom] = useState("");   // 起始日期 YYYY-MM-DD
const [filterDateTo, setFilterDateTo] = useState("");       // 結束日期 YYYY-MM-DD
```

**篩選邏輯**（client-side，在 `sorted` 之前套用）：
```typescript
const filtered = useMemo(() => {
  return quotes.filter((q) => {
    // 文字搜尋：客戶名 OR 案場名 OR 報價編號（模糊比對，不分大小寫）
    if (searchText) {
      const s = searchText.toLowerCase();
      const match = [q.clientName, q.projectName, q.quoteId]
        .some(f => f.toLowerCase().includes(s));
      if (!match) return false;
    }
    // 狀態篩選
    if (filterStatus !== "all" && q.status !== filterStatus) return false;
    // 日期範圍
    if (filterDateFrom && q.quoteDate < filterDateFrom) return false;
    if (filterDateTo && q.quoteDate > filterDateTo) return false;
    return true;
  });
}, [quotes, searchText, filterStatus, filterDateFrom, filterDateTo]);

const sorted = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
```

**UI 佈局**（加在標題列下方，表格上方）：
```
┌─────────────────────────────────────────────────────┐
│ 🔍 [搜尋客戶/案場/單號___] [狀態▾全部] [起日___] ~ [迄日___]  │
└─────────────────────────────────────────────────────┘
```

- 搜尋輸入框：`<Input placeholder="搜尋客戶、案場、單號..." />`
- 狀態下拉：`<Select>` 包含 "全部" + STATUS_MAP 所有選項
- 日期：兩個 `<Input type="date" />`
- 所有篩選即時生效，不需按「搜尋」按鈕

**摘要列更新**：
- 原本：`${quotes.length} 筆報價 · ${acceptedCount} 筆已接受 · 總額 ${formatCurrency(totalAmount)}`
- 改為：如果有篩選條件 → `顯示 ${filtered.length} / ${quotes.length} 筆 · ...`

### 驗收條件
- [ ] 輸入客戶名 → 即時過濾顯示
- [ ] 選擇「已接受」→ 只顯示 accepted 報價
- [ ] 設定日期範圍 → 只顯示該範圍內的報價
- [ ] 多條件組合（文字 + 狀態 + 日期）→ AND 邏輯正確
- [ ] 清空所有篩選 → 顯示全部報價
- [ ] 篩選結果摘要正確顯示 "顯示 X / Y 筆"
- [ ] TypeScript 編譯通過

---

## Feature 3：品項拖拉排序

### 目標
報價編輯器中的品項可拖拉調整順序。

### 修改檔案
- `src/components/quote-editor/QuoteEditor.tsx`
- `package.json`（新增依賴）

### 新增依賴
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### 實作規格

**整合方式**：
- 用 `DndContext` + `SortableContext` 包裹 `<tbody>`
- 每個 `<tr>` 包在 `useSortable()` hook 中
- 排序 strategy：`verticalListSortingStrategy`
- 排序 key：`item.id`

**拖拉把手**：
- 在「項次」欄（第一欄）加上 `GripVertical` icon（from lucide-react）
- 把手設為 drag handle（`{...attributes, ...listeners}` 綁在把手上，不是整個 row）
- 游標樣式：`cursor-grab` / `cursor-grabbing`

**排序邏輯**：
```typescript
function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  setItems((prev) => {
    const oldIndex = prev.findIndex((i) => i.id === active.id);
    const newIndex = prev.findIndex((i) => i.id === over.id);
    return arrayMove(prev, oldIndex, newIndex);  // from @dnd-kit/sortable
  });
}
```

**注意事項**：
- 展開的備註行（expandedItems）要跟著品項一起移動 — 因為展開狀態綁 `item.id`，排序只動 items array，所以展開狀態自動正確
- 拖拉過程中不觸發 auto-draft（Feature 1）的 debounce → dragEnd 之後才觸發
- 品項編號（項次）用 `idx + 1` 顯示，排序後自動更新

### 驗收條件
- [ ] 可拖拉品項行調整順序
- [ ] 拖拉把手在「項次」欄，hover 時顯示 grab cursor
- [ ] 展開備註的品項拖拉後，備註跟著走
- [ ] 排序後的順序在 PDF 預覽中正確反映
- [ ] 排序後的順序在儲存時正確寫入 Sheets
- [ ] TypeScript 編譯通過

---

## Feature 4：整單報價範本

### 目標
提供 3+ 組常用報價範本，一鍵套用整組品項。使用者提到有三組常用範本，具體內容待確認。先建好框架，範本內容用 placeholder。

### 修改檔案
- `src/lib/constants.ts`（新增 `QUOTE_TEMPLATES`）
- `src/components/quote-editor/QuoteEditor.tsx`（新增範本選擇 UI）

### 實作規格

**常數定義**（`src/lib/constants.ts`）：
```typescript
export interface QuoteTemplate {
  id: string;
  label: string;
  description: string;
  items: Array<Omit<FlexQuoteItem, "id">>;
  defaultTerms?: string;   // 覆蓋預設備註條款（可選）
}

export const QUOTE_TEMPLATES: QuoteTemplate[] = [
  {
    id: "sofa-reupholster",
    label: "沙發換皮標準組",
    description: "換皮 + 運費 + 安裝",
    items: [
      { name: "沙發換皮", spec: "", qty: 1, unit: "只", unitPrice: 0, amount: 0, isCostItem: false, notes: "" },
      { name: "雙北市區運費", spec: "包含產品配送、垃圾清運", qty: 1, unit: "式", unitPrice: 4000, amount: 4000, isCostItem: true, notes: "" },
      { name: "現場安裝工資", spec: "產品安裝與定位", qty: 1, unit: "式", unitPrice: 3000, amount: 3000, isCostItem: true, notes: "" },
    ],
  },
  {
    id: "cushion-set",
    label: "訂製坐墊組",
    description: "坐墊 + 運費",
    items: [
      { name: "訂製坐墊", spec: "", qty: 1, unit: "只", unitPrice: 0, amount: 0, isCostItem: false, notes: "" },
      { name: "雙北市區運費", spec: "包含產品配送、垃圾清運", qty: 1, unit: "式", unitPrice: 4000, amount: 4000, isCostItem: true, notes: "" },
    ],
  },
  {
    id: "commercial-project",
    label: "商空工程組",
    description: "訂製品項 + 運費 + 安裝 + 製版費",
    items: [
      { name: "訂製沙發", spec: "", qty: 1, unit: "只", unitPrice: 0, amount: 0, isCostItem: false, notes: "" },
      { name: "製版費", spec: "", qty: 1, unit: "式", unitPrice: 6500, amount: 6500, isCostItem: false, notes: "" },
      { name: "雙北市區運費", spec: "包含產品配送、垃圾清運", qty: 1, unit: "式", unitPrice: 4000, amount: 4000, isCostItem: true, notes: "" },
      { name: "現場安裝工資", spec: "產品安裝與定位", qty: 1, unit: "式", unitPrice: 3000, amount: 3000, isCostItem: true, notes: "" },
    ],
  },
];
```

**UI**（在 QuoteEditor 的「常用範本」下拉選單旁邊新增）：
- 新增按鈕：`📄 套用整單範本`
- 點擊 → 顯示範本選擇 dropdown
- 每個範本顯示：`label` + `description`
- 選擇後 → `confirm("套用範本「${template.label}」將替換目前所有品項，確定嗎？")`
- 確認 → `setItems(template.items.map(i => ({ ...i, id: crypto.randomUUID() })))`
- 如果 `template.defaultTerms` 有值 → 同時替換 `termsTemplate`

**放置位置**：在現有的 `📋 常用範本` 按鈕旁邊。兩者的差異要清楚：
- `📋 常用範本` = 插入單一品項（append，不清空）
- `📄 套用整單範本` = 替換全部品項（replace，有 confirm）

### 驗收條件
- [ ] 可從 3 個範本中選擇
- [ ] 套用前有確認 dialog
- [ ] 套用後 items 被完全替換為範本內容
- [ ] 套用後金額自動計算正確
- [ ] 不影響客戶資訊（只替換品項和可選的條款）
- [ ] TypeScript 編譯通過

---

## Feature 5：到期自動過期

### 目標
過了有效期限的 draft / sent 報價自動標為 expired。

### 修改檔案
- `src/app/api/sheets/quotes/route.ts`（修改 GET handler）

### 實作規格

**在 GET handler 中，取得 quotes 後加入自動過期邏輯**：

```typescript
// 在 return 之前
const today = new Date().toISOString().slice(0, 10);
const validityDays = 30; // 預設值，理想上從 settings 讀取

const expiredIds: string[] = [];
const updatedQuotes = quotes.map((q) => {
  if (q.status !== "draft" && q.status !== "sent") return q;

  // 計算有效期限
  const quoteDate = new Date(q.quoteDate);
  quoteDate.setDate(quoteDate.getDate() + validityDays);
  const validUntil = quoteDate.toISOString().slice(0, 10);

  if (today > validUntil) {
    expiredIds.push(q.quoteId);
    return { ...q, status: "expired" as QuoteStatus };
  }
  return q;
});

// 背景批次更新（fire-and-forget，不 block response）
if (expiredIds.length > 0 && client) {
  // 用 Promise 但不 await，讓 response 先回
  void batchExpireQuotes(client, expiredIds);
}

return NextResponse.json({ quotes: updatedQuotes, source: "sheets" as const });
```

**新增 helper function**：
```typescript
async function batchExpireQuotes(
  client: Awaited<ReturnType<typeof getSheetsClient>>,
  quoteIds: string[]
): Promise<void> {
  if (!client) return;
  try {
    const response = await client.sheets.spreadsheets.values.get({
      spreadsheetId: client.spreadsheetId,
      range: "報價紀錄!A2:A",
    });
    const ids = (response.data.values ?? []).flat();
    const now = new Date().toISOString().slice(0, 10);
    const data = quoteIds
      .map((qid) => {
        const idx = ids.indexOf(qid);
        if (idx === -1) return null;
        const row = idx + 2;
        return [
          { range: `報價紀錄!O${row}`, values: [["expired"]] },
          { range: `報價紀錄!S${row}`, values: [[now]] },
        ];
      })
      .filter(Boolean)
      .flat();

    if (data.length > 0) {
      await client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: client.spreadsheetId,
        requestBody: { valueInputOption: "RAW", data },
      });
    }
  } catch {
    // 靜默失敗，下次 GET 會再試
  }
}
```

### 驗收條件
- [ ] 超過 30 天的 draft/sent 報價在 GET 時自動返回 status = "expired"
- [ ] 已 accepted / rejected 的報價不受影響
- [ ] Sheets 中的狀態會被背景更新（非同步，不影響 response 速度）
- [ ] 即使 Sheets 更新失敗，前端也能看到正確的 expired 狀態
- [ ] TypeScript 編譯通過

---

## Feature 6：Undo / Redo

### 目標
品項編輯支援 Cmd+Z（undo）和 Cmd+Shift+Z（redo）。

### 新增檔案
- `src/hooks/useHistory.ts`

### 修改檔案
- `src/components/quote-editor/QuoteEditor.tsx`

### 實作規格

**useHistory hook**（`src/hooks/useHistory.ts`）：
```typescript
import { useCallback, useRef, useState } from "react";

interface UseHistoryReturn<T> {
  state: T;
  setState: (next: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initialState: T, maxSize = 50): UseHistoryReturn<T> {
  const [state, setInternalState] = useState<T>(initialState);
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);

  const setState = useCallback((next: T | ((prev: T) => T)) => {
    setInternalState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      pastRef.current = [...pastRef.current.slice(-(maxSize - 1)), prev];
      futureRef.current = [];   // 新操作清空 redo stack
      return resolved;
    });
  }, [maxSize]);

  const undo = useCallback(() => {
    setInternalState((current) => {
      if (pastRef.current.length === 0) return current;
      const previous = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [...futureRef.current, current];
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setInternalState((current) => {
      if (futureRef.current.length === 0) return current;
      const next = futureRef.current[futureRef.current.length - 1];
      futureRef.current = futureRef.current.slice(0, -1);
      pastRef.current = [...pastRef.current, current];
      return next;
    });
  }, []);

  return {
    state,
    setState,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
```

**整合到 QuoteEditor**：

1. 替換 items state：
```typescript
// Before:
const [items, setItems] = useState<FlexQuoteItem[]>([createEmptyItem()]);

// After:
const { state: items, setState: setItems, undo, redo, canUndo, canRedo } = useHistory<FlexQuoteItem[]>([createEmptyItem()]);
```

2. 鍵盤快捷鍵：
```typescript
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    }
  }
  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, [undo, redo]);
```

3. Undo/Redo 按鈕（放在品項表格工具列，`新增品項` 旁邊）：
```tsx
<Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo}>
  <Undo2 className="h-3.5 w-3.5" />
</Button>
<Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo}>
  <Redo2 className="h-3.5 w-3.5" />
</Button>
```

**scope 限制**：只追蹤 `items` array 的變更（新增、刪除、修改、排序），不追蹤 client info、description、terms 等其他 state。

### 驗收條件
- [ ] 修改品項 → Cmd+Z → 恢復上一步
- [ ] Cmd+Shift+Z → 重做
- [ ] 最多記 50 步歷史
- [ ] 新操作後 redo stack 清空
- [ ] undo/redo 按鈕 disabled 狀態正確
- [ ] `handleNewQuote()` 時歷史被重置（需要在 handleNewQuote 中 re-init history）
- [ ] TypeScript 編譯通過
- [ ] `Undo2` 和 `Redo2` icon 從 `lucide-react` import

---

## Feature 7：客戶↔報價關聯

### 目標
報價紀錄儲存 clientId，支援按客戶反查所有報價。

### 修改檔案
- `src/lib/types.ts`（QuoteRecord 新增 clientId 欄位）
- `src/app/api/sheets/quotes/route.ts`（欄位擴充至 column T）
- `src/components/quote-editor/QuoteEditor.tsx`（儲存時帶入 clientId）
- `src/app/quotes/QuotesClient.tsx`（新增客戶篩選）

### 實作規格

**Type 變更**（`src/lib/types.ts`）：
```typescript
export interface QuoteRecord {
  // ... 所有現有欄位不變 ...
  clientId: string;          // NEW: 客戶資料庫的 id，空字串表示手動輸入的客戶
}
```

**Sheet 欄位擴充**：
- 報價紀錄 sheet 新增 column T: `clientId`
- 範圍從 `A:S` 擴充為 `A:T`

**API 修改**（`route.ts`）：

`headerToRow()` — 尾端加入 `h.clientId`：
```typescript
function headerToRow(h: QuoteRecord): string[] {
  return [
    // ... 現有 19 個值不變 ...
    h.clientId ?? "",          // Column T (index 19)
  ];
}
```

`rowToHeader()` — 末尾加入：
```typescript
function rowToHeader(row: string[]): QuoteRecord {
  return {
    // ... 現有 19 個解析不變 ...
    clientId: row[19] ?? "",
  };
}
```

**所有 `range` 更新**：
- `"報價紀錄!A2:S"` → `"報價紀錄!A2:T"`
- `"報價紀錄!A:S"` → `"報價紀錄!A:T"`
- PUT 中的 `A${sheetRow}:S${sheetRow}` → `A${sheetRow}:T${sheetRow}`

**QuoteEditor 修改**：

`buildPayload()` 中 header 加入：
```typescript
clientId: selectedClientId === "__new__" ? "" : selectedClientId,
```

**報價列表新增客戶篩選**（QuotesClient.tsx，配合 Feature 2 的搜尋列）：
- 如果 Feature 2 已做，在篩選列加一個 `[客戶▾全部]` 下拉
- 需要 fetch 客戶列表來顯示選項
- 篩選邏輯：`filterClientId !== "all" && q.clientId !== filterClientId`

### 向下相容
- 現有報價的 column T 為空 → `row[19] ?? ""` 自動 fallback 空字串
- 空字串 clientId = 手動輸入客戶，不影響現有功能

### 驗收條件
- [ ] 新建報價選擇客戶後儲存 → Sheets column T 有 clientId
- [ ] 手動輸入客戶（不選 dropdown）→ clientId 為空字串
- [ ] 編輯舊報價（無 column T）→ 不 crash，clientId = ""
- [ ] 報價列表可按客戶篩選
- [ ] TypeScript 編譯通過

---

## Feature 8：報價版本歷史

### 目標
每次更新報價時，自動記錄快照，可查看歷史版本。

### 新增檔案
- `src/app/api/sheets/revisions/route.ts`

### 修改檔案
- `src/app/api/sheets/quotes/route.ts`（PUT handler 中記錄 revision）
- `src/app/api/sheets/init/route.ts`（新增 sheet 初始化）
- `src/app/quotes/QuotesClient.tsx`（新增「歷史」按鈕 + modal）

### 實作規格

**新增 Google Sheet**：`報價變更紀錄`

| Column | 欄位名 | 說明 |
|--------|--------|------|
| A | quoteId | 報價單號 |
| B | revision | 版本號 (1, 2, 3...) |
| C | timestamp | 變更時間 ISO |
| D | changeType | "create" / "update" / "status_change" |
| E | snapshot | JSON string — 完整 header + lines 快照 |

**init/route.ts 擴充**：
- 在 sheets 初始化列表中加入 `報價變更紀錄`
- Header row: `["quoteId", "revision", "timestamp", "changeType", "snapshot"]`

**quotes/route.ts — PUT handler 修改**：
在寫入更新之前，先記錄當前版本的快照：
```typescript
// 在 update 之前，讀取當前資料作為快照
const currentHeader = rowToHeader(currentRow);  // 現有的 header 資料
const currentLines = ...; // 讀取現有 lines

// 計算 revision number
const revResponse = await client.sheets.spreadsheets.values.get({
  spreadsheetId: client.spreadsheetId,
  range: "報價變更紀錄!A2:B",
});
const revRows = revResponse.data.values ?? [];
const existingRevisions = revRows.filter(r => r[0] === payload.header.quoteId);
const nextRevision = existingRevisions.length + 1;

// 寫入 revision
await client.sheets.spreadsheets.values.append({
  spreadsheetId: client.spreadsheetId,
  range: "報價變更紀錄!A:E",
  valueInputOption: "RAW",
  requestBody: {
    values: [[
      payload.header.quoteId,
      String(nextRevision),
      new Date().toISOString(),
      "update",
      JSON.stringify({ header: currentHeader, lines: currentLines }),
    ]],
  },
});

// 然後正常執行 update...
```

**revisions API**（`src/app/api/sheets/revisions/route.ts`）：
```typescript
// GET /api/sheets/revisions?quoteId=CQ-20260317-001
// Returns: { revisions: Array<{ quoteId, revision, timestamp, changeType, snapshot }> }
```

**UI — 報價列表新增「歷史」按鈕**：
- 在每筆報價的操作欄加一個 `<Clock>` icon 按鈕
- 點擊 → 開 Dialog modal
- Modal 顯示該報價的所有 revision 列表：`版本 #N · {timestamp} · {changeType}`
- 點擊某個 revision → 展開 snapshot 內容（品項名稱、金額等摘要）
- 不需要「還原到此版本」功能（Phase 1 只看，不還原）

### 驗收條件
- [ ] 初次 init 後，報價變更紀錄 sheet 自動建立
- [ ] 更新報價 → 報價變更紀錄新增一筆（含完整快照）
- [ ] 報價列表點「歷史」→ 顯示所有版本
- [ ] 快照 JSON 包含完整 header + lines
- [ ] TypeScript 編譯通過

---

## Feature 9：Dashboard 統計面板

### 目標
老闆 / 管理者可在首頁看到營運統計。

### 新增 / 修改檔案
- `src/app/page.tsx`（首頁改為 Dashboard + QuoteEditor 雙 tab）
- `src/components/dashboard/DashboardPanel.tsx`（新增）

### 實作規格

**首頁改版**（`src/app/page.tsx`）：
```tsx
// 用 Tabs 切換 Dashboard 和 報價編輯器
<Tabs defaultValue="editor">
  <TabsList>
    <TabsTrigger value="editor">報價編輯</TabsTrigger>
    <TabsTrigger value="dashboard">營運統計</TabsTrigger>
  </TabsList>
  <TabsContent value="editor"><QuoteEditor /></TabsContent>
  <TabsContent value="dashboard"><DashboardPanel /></TabsContent>
</Tabs>
```

**DashboardPanel 規格**（`src/components/dashboard/DashboardPanel.tsx`）：

資料來源：GET `/api/sheets/quotes` 取得所有報價（複用現有 API）。

**統計卡片（上方一排，4 張）**：

| 卡片 | 計算方式 |
|------|----------|
| 總報價數 | `quotes.length` |
| 已成交 | `quotes.filter(q => q.status === "accepted").length` |
| 成交率 | `accepted / (sent + accepted + rejected)` — 排除 draft 和 expired |
| 成交總額 | `accepted.reduce((sum, q) => sum + q.total, 0)` |

**報價狀態分佈（漏斗）**：

```
draft: N 筆 ($XXX)
sent:  N 筆 ($XXX)  
accepted: N 筆 ($XXX)
rejected: N 筆 ($XXX)
expired:  N 筆 ($XXX)
```

用 horizontal bar 或簡單表格顯示。每個狀態用對應的 badge 顏色。

**Top 5 客戶（依成交金額）**：

```typescript
// 從 accepted quotes 計算
const clientRevenue = new Map<string, number>();
acceptedQuotes.forEach(q => {
  const name = q.clientName || "未填客戶";
  clientRevenue.set(name, (clientRevenue.get(name) ?? 0) + q.total);
});
const top5 = [...clientRevenue.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);
```

顯示為簡單的排名列表：`1. 客戶A — $120,000 (3 筆)`

**通路營收比較**：

```typescript
const channelRevenue: Record<Channel, { count: number; total: number }>;
// 從 accepted quotes group by channel
```

顯示為表格或 bar chart：
| 通路 | 成交筆數 | 成交金額 | 佔比 |
|------|---------|---------|------|

**UI 風格**：
- 使用現有 `card-surface` class 做卡片
- 數字用大字 + accent 色
- 不需要第三方圖表庫 — 用 CSS `div` 做簡單 bar chart 就好
- 響應式：大螢幕 4 欄 cards，小螢幕 2 欄

### 驗收條件
- [ ] 首頁有「報價編輯」和「營運統計」兩個 tab
- [ ] Dashboard 正確顯示：總報價數、已成交、成交率、成交總額
- [ ] 報價狀態分佈顯示各狀態的筆數和金額
- [ ] Top 5 客戶排名正確
- [ ] 通路營收比較顯示四個通路的數據
- [ ] 沒有報價時顯示 empty state（不 crash）
- [ ] 不使用任何第三方圖表庫
- [ ] TypeScript 編譯通過

---

## 跨功能：Soft Delete

### 目標
報價刪除改為軟刪除，避免誤刪無法恢復。

### 修改檔案
- `src/app/api/sheets/quotes/route.ts`（修改 DELETE handler）
- `src/app/quotes/QuotesClient.tsx`（過濾 deleted 報價）

### 實作規格

**方案**：複用現有 `status` 欄位，新增 `"deleted"` 狀態。

**Type 變更**（`src/lib/types.ts`）：
```typescript
// 原本：
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

// 改為：
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "deleted";
```

**DELETE handler 改為 PATCH**：
```typescript
// 不再刪除 row，改為更新 status = "deleted"
export async function DELETE(request: Request) {
  const { quoteId } = (await request.json()) as { quoteId: string };
  // ... 找到 row index ...
  // 用 batchUpdate 更新 status = "deleted" + updatedAt
  // 不刪除 報價明細 rows
}
```

**GET handler 過濾**：
- 前端或 API 側過濾掉 `status === "deleted"` 的報價
- 建議在前端過濾（API 返回全部，前端預設不顯示 deleted）
- 在搜尋篩選（Feature 2）中可加「顯示已刪除」toggle

**QuotesClient 修改**：
- `STATUS_MAP` 新增 `deleted: { label: "已刪除", className: "badge-deleted" }`
- 預設 `sorted` 過濾掉 `deleted`
- 報價摘要不計入 deleted

### 驗收條件
- [ ] 點「刪除」→ 報價從列表消失，但 Sheets 中仍在（status = "deleted"）
- [ ] deleted 報價不計入統計
- [ ] 刪除確認訊息改為：「確定要刪除報價單 XXX？（可從已刪除中恢復）」
- [ ] TypeScript 編譯通過

---

## 開發順序與依賴關係

```
Feature 1: 自動暫存        ← 無依賴，最先做
Feature 2: 報價搜尋篩選     ← 無依賴
Feature 5: 到期自動過期     ← 無依賴
Soft Delete                ← 無依賴
Feature 3: 品項拖拉排序     ← 無依賴（需 npm install）
Feature 6: Undo/Redo       ← 無依賴
Feature 4: 整單報價範本     ← 無依賴
Feature 7: 客戶報價關聯     ← 依賴 Feature 2（篩選 UI）
Feature 8: 報價版本歷史     ← 無依賴，但建議在 Feature 7 之後
Feature 9: Dashboard       ← 建議最後做（需要其他 Feature 的資料品質）
```

**建議開發批次**：

| 批次 | Features | 預估 |
|------|----------|------|
| Batch 1 | #1 自動暫存 + #2 搜尋篩選 + #5 到期自動化 + Soft Delete | 1-2 天 |
| Batch 2 | #3 拖拉排序 + #6 Undo/Redo + #4 整單範本 | 1-2 天 |
| Batch 3 | #7 客戶關聯 + #8 版本歷史 | 1-2 天 |
| Batch 4 | #9 Dashboard | 1 天 |

---

## 驗收總則

每個 Feature 完成後：
1. `npx tsc --noEmit` — 零 type error
2. `npm run build` — exit code 0
3. 各 Feature 的驗收條件全部通過
4. 不影響現有功能（報價建立、編輯、PDF 預覽、儲存）
5. 不改動 `pricing-engine.ts`

---

*Generated by Sisyphus · 2026-03-17*
