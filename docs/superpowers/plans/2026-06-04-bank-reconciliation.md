# 銀行入帳核對 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 上傳永豐銀行 CSV，瀏覽器端自動比對 AR 分期，人工確認後寫回 AR 收款記錄。

**Architecture:** 解析與比對完全在瀏覽器端（原始帳單資料不離開客戶端）；確認後呼叫現有 `POST /api/sheets/ar/[arId]/schedules/[scheduleId]/receive` 更新 AR；無對應 AR 的項目（B2B 直接下單、進貨款）只留記錄標記，不觸發 API。

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest, shadcn/ui, lucide-react, 現有 AR receive endpoint。

---

## 設計決策備忘

- **進貨款（支出）**：第一版只標記，不寫回任何模組。
- **B2B 無 AR**：比對不到 AR 的收入項目，使用者可標記案件號 + 款項類型，但系統不呼叫 receive endpoint，僅紀錄（未來再串）。
- **重複上傳防護**：`txId` 由「交易日+時間+支出+存入+餘額」組成，同一筆不重複處理。
- **容差規則**：金額差 ≤ 50 元視為「中信心」可配對（手續費差異）；完全相符為「高信心」。

---

## 檔案結構

| 檔案 | 動作 | 說明 |
|------|------|------|
| `src/lib/types.ts` | 修改 | 新增 BankTransaction、ReconciliationEntry、BankPaymentType 等型別 |
| `src/lib/bank-csv-parser.ts` | 新增 | 永豐 CSV 解析 + 全形正規化 + 訂單號擷取 |
| `src/lib/bank-reconciliation-matcher.ts` | 新增 | 自動比對邏輯 |
| `src/__tests__/bank-csv-parser.test.ts` | 新增 | 解析器測試 |
| `src/__tests__/bank-reconciliation-matcher.test.ts` | 新增 | 比對邏輯測試 |
| `src/app/bank-reconciliation/page.tsx` | 新增 | 頁面進入點 |
| `src/app/bank-reconciliation/BankReconciliationClient.tsx` | 新增 | 主 Client 元件 |
| `src/components/layout/nav-links.ts` | 修改 | 加入「核對入帳」導覽項目 |

---

## Task 1：新增型別

**Files:**
- Modify: `src/lib/types.ts`（在檔案末尾加入，約第 870 行之後）

- [ ] **Step 1：在 types.ts 末尾加入以下型別**

```typescript
// ─── 銀行入帳核對 ───────────────────────────────────────────

export type BankPaymentType =
  | "訂金"
  | "尾款"
  | "全額"
  | "進貨款"
  | "佣金"
  | "雜項";

export type ReconcileStatus = "pending" | "confirmed" | "ignored";
export type ReconcileConfidence = "high" | "medium" | "none";

export interface BankTransaction {
  /** 合成唯一識別：txDate+txTime+debit+credit+balance，防重複上傳 */
  txId: string;
  txDate: string;        // YYYY-MM-DD
  txTime: string;        // HH:mm
  valueDate: string;     // 計息日 YYYY-MM-DD
  description: string;   // 摘要（手機轉帳 / 跨行轉帳 等）
  debit: number | null;  // 支出（null = 無）
  credit: number | null; // 存入（null = 無）
  memo: string;          // 備註/資金用途（原始字串）
}

export interface ReconciliationEntry {
  tx: BankTransaction;
  status: ReconcileStatus;
  confidence: ReconcileConfidence;
  /** 比對到的 AR ID（null = 無對應 AR） */
  arId: string | null;
  /** 比對到的分期 ID（null = 未找到適合分期） */
  scheduleId: string | null;
  caseId: string | null;
  caseNameSnapshot: string | null;
  clientNameSnapshot: string | null;
  paymentType: BankPaymentType | null;
}

export interface ARWithSchedules extends ARRecord {
  schedules: ARScheduleRecord[];
}
```

- [ ] **Step 2：確認型別編譯無誤**

```bash
npx tsc --noEmit
```
Expected: 無輸出（零錯誤）

- [ ] **Step 3：Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(bank-reconciliation): add BankTransaction and ReconciliationEntry types"
```

---

## Task 2：CSV 解析器（TDD）

**Files:**
- Create: `src/lib/bank-csv-parser.ts`
- Create: `src/__tests__/bank-csv-parser.test.ts`

### 永豐 CSV 格式說明

```
帳號,168-018-0008591-8【營業部DAWHO活期儲蓄存款】新台幣,,,,,,,,,,   ← Row 1（帳號 header）
交易日, 計息日, 摘要, 支出, 存入, 餘額,匯率,備註/資金用途,             ← Row 2（欄位 header）
2026/05/20 16:52,2026/05/20,手機轉帳, ,24885,627297,,100018009897,  ← Row 3+ 資料
```

- 編碼：UTF-8 BOM（utf-8-sig）
- 分隔符：逗號
- 備註欄常含全形字元：`Ｌ５８７` → 正規化後 → `L587`

- [ ] **Step 1：寫失敗測試**

```typescript
// src/__tests__/bank-csv-parser.test.ts
import { describe, expect, it } from "vitest";
import {
  normalizeFullWidth,
  extractCaseIdFromMemo,
  parseSinopacCSV,
} from "@/lib/bank-csv-parser";

describe("normalizeFullWidth", () => {
  it("轉換全形英文", () => {
    expect(normalizeFullWidth("Ｌ５８７")).toBe("L587");
  });
  it("轉換全形數字", () => {
    expect(normalizeFullWidth("０１２")).toBe("012");
  });
  it("半形不變", () => {
    expect(normalizeFullWidth("L587")).toBe("L587");
  });
});

describe("extractCaseIdFromMemo", () => {
  it("擷取全形訂單號", () => {
    expect(extractCaseIdFromMemo("7000003111430221601 Ｌ０１９臥榻墊")).toBe("L019");
  });
  it("擷取半形帶空格訂單號", () => {
    expect(extractCaseIdFromMemo("8080000174966010128 S 8 7 8")).toBe("S878");
  });
  it("多餘前導零 P001455 → P1455", () => {
    expect(extractCaseIdFromMemo("0520004221000067521 Ｐ００１４５５")).toBe("P1455");
  });
  it("找不到訂單號回傳 null", () => {
    expect(extractCaseIdFromMemo("8220000613540250150")).toBeNull();
  });
  it("純帳號字串回傳 null", () => {
    expect(extractCaseIdFromMemo("永豐銀行-16625")).toBeNull();
  });
});

describe("parseSinopacCSV", () => {
  const HEADER = `帳號,168-018-0008591-8【TEST】新台幣,,,,,,,,,,
交易日, 計息日, 摘要, 支出, 存入, 餘額,匯率,備註/資金用途,`;

  it("解析標準存入行", () => {
    const csv = `${HEADER}
2026/05/20 16:52,2026/05/20,手機轉帳, ,24885,627297,,100018009897,`;
    const { transactions, errors } = parseSinopacCSV(csv);
    expect(errors).toHaveLength(0);
    expect(transactions).toHaveLength(1);
    const tx = transactions[0];
    expect(tx.txDate).toBe("2026-05-20");
    expect(tx.txTime).toBe("16:52");
    expect(tx.credit).toBe(24885);
    expect(tx.debit).toBeNull();
    expect(tx.memo).toBe("100018009897");
  });

  it("解析支出行", () => {
    const csv = `${HEADER}
2026/05/16 23:37,2026/05/17,手機轉帳,11500, ,573810,,7000003111430221601 Ｌ５８７南港床頭翻修,`;
    const { transactions } = parseSinopacCSV(csv);
    expect(transactions[0].debit).toBe(11500);
    expect(transactions[0].credit).toBeNull();
    expect(transactions[0].memo).toBe("7000003111430221601 Ｌ５８７南港床頭翻修");
  });

  it("忽略空白行", () => {
    const csv = `${HEADER}
2026/05/21 00:28,2026/05/21,利息存入, ,562,636659,,168018000...,

`;
    const { transactions } = parseSinopacCSV(csv);
    expect(transactions).toHaveLength(1);
  });

  it("Numbers 匯出的 11 欄格式（含使用者補充欄）也能解析", () => {
    const csv = `${HEADER}
2026/05/20 17:43,2026/05/20,跨行轉帳, ,8800,636097,,0090053145100792600,S879,張皓程,全額,`;
    const { transactions } = parseSinopacCSV(csv);
    expect(transactions[0].credit).toBe(8800);
    expect(transactions[0].memo).toBe("0090053145100792600");
  });

  it("CSV 行數不足回傳 error", () => {
    const { errors } = parseSinopacCSV("帳號,test");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("txId 對相同交易唯一且確定性", () => {
    const csv = `${HEADER}
2026/05/20 16:52,2026/05/20,手機轉帳, ,24885,627297,,test,`;
    const { transactions } = parseSinopacCSV(csv);
    const { transactions: transactions2 } = parseSinopacCSV(csv);
    expect(transactions[0].txId).toBe(transactions2[0].txId);
  });
});
```

- [ ] **Step 2：確認測試失敗**

```bash
npm test -- bank-csv-parser
```
Expected: FAIL（模組不存在）

- [ ] **Step 3：實作 bank-csv-parser.ts**

```typescript
// src/lib/bank-csv-parser.ts

import type { BankTransaction } from "@/lib/types";

export function normalizeFullWidth(str: string): string {
  return str.replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
}

export function extractCaseIdFromMemo(memo: string): string | null {
  // 正規化全形 + 移除所有空白後，擷取 [LSP] + 3~6 位數字
  const normalized = normalizeFullWidth(memo).replace(/\s+/g, "");
  const match = normalized.match(/([LSP]\d{3,6})/);
  if (!match) return null;
  const raw = match[1];
  // 移除字母後的前導零（P001455 → P1455），但保留正常的 L019 不變
  return raw.replace(/^([A-Z]+)0+(\d{3,})$/, (_, prefix, num) => prefix + num);
}

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

function parseDateTime(raw: string): { date: string; time: string } {
  const trimmed = raw.trim();
  const spaceIdx = trimmed.lastIndexOf(" ");
  if (spaceIdx < 0) return { date: trimmed.replace(/\//g, "-"), time: "00:00" };
  return {
    date: trimmed.slice(0, spaceIdx).replace(/\//g, "-"),
    time: trimmed.slice(spaceIdx + 1),
  };
}

function makeTxId(
  txDate: string,
  txTime: string,
  debit: number | null,
  credit: number | null,
  balance: number,
): string {
  return `${txDate}T${txTime}|${debit ?? ""}|${credit ?? ""}|${balance}`;
}

export interface ParseBankCSVResult {
  transactions: BankTransaction[];
  accountNumber: string;
  errors: string[];
}

export function parseSinopacCSV(csvText: string): ParseBankCSVResult {
  const errors: string[] = [];
  const transactions: BankTransaction[] = [];
  const lines = csvText.split(/\r?\n/);

  if (lines.length < 3) {
    return { transactions: [], accountNumber: "", errors: ["CSV 格式不正確：行數不足"] };
  }

  // Row 1: 帳號 header
  const accountNumber = (lines[0]?.split(",")[1] ?? "").trim();

  // Row 2: 欄位 header（跳過）
  // Row 3+: 資料
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const cols = line.split(",");
    if (cols.length < 6) continue;

    const { date: txDate, time: txTime } = parseDateTime(cols[0] ?? "");
    if (!txDate || txDate.length < 8) {
      errors.push(`第 ${i + 1} 行：無法解析交易日（${cols[0]}）`);
      continue;
    }

    const valueDate = (cols[1]?.trim() ?? "").replace(/\//g, "-");
    const description = cols[2]?.trim() ?? "";
    const debit = parseAmount(cols[3] ?? "");
    const credit = parseAmount(cols[4] ?? "");
    const balance = parseAmount(cols[5] ?? "") ?? 0;
    // Col 6 = 匯率（略過），Col 7 = 備註
    const memo = cols[7]?.trim() ?? "";

    transactions.push({
      txId: makeTxId(txDate, txTime, debit, credit, balance),
      txDate,
      txTime,
      valueDate,
      description,
      debit,
      credit,
      memo,
    });
  }

  return { transactions, accountNumber, errors };
}
```

- [ ] **Step 4：確認測試通過**

```bash
npm test -- bank-csv-parser
```
Expected: 全部 PASS

- [ ] **Step 5：Commit**

```bash
git add src/lib/bank-csv-parser.ts src/__tests__/bank-csv-parser.test.ts
git commit -m "feat(bank-reconciliation): sinopac CSV parser with full-width normalization"
```

---

## Task 3：自動比對邏輯（TDD）

**Files:**
- Create: `src/lib/bank-reconciliation-matcher.ts`
- Create: `src/__tests__/bank-reconciliation-matcher.test.ts`

- [ ] **Step 1：寫失敗測試**

```typescript
// src/__tests__/bank-reconciliation-matcher.test.ts
import { describe, expect, it } from "vitest";
import { matchAllTransactions } from "@/lib/bank-reconciliation-matcher";
import type { BankTransaction, ARWithSchedules } from "@/lib/types";

function makeTx(overrides: Partial<BankTransaction>): BankTransaction {
  return {
    txId: "test-id",
    txDate: "2026-05-20",
    txTime: "16:52",
    valueDate: "2026-05-20",
    description: "跨行轉帳",
    debit: null,
    credit: null,
    memo: "",
    ...overrides,
  };
}

const S879_AR: ARWithSchedules = {
  arId: "AR-202605-001",
  caseId: "S879",
  caseNameSnapshot: "張皓程",
  clientNameSnapshot: "張皓程",
  clientId: "C001",
  quoteId: "Q001",
  versionId: "VER-001",
  contactNameSnapshot: "",
  clientPhoneSnapshot: "",
  projectNameSnapshot: "",
  issueDate: "2026-05-01",
  totalAmount: 8800,
  receivedAmount: 0,
  outstandingAmount: 8800,
  scheduleCount: 1,
  arStatus: "active",
  hasOverdue: false,
  lastReceivedAt: "",
  notes: "",
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
  createdBy: "admin",
  schedules: [
    {
      scheduleId: "AR-202605-001-S01",
      arId: "AR-202605-001",
      seq: 1,
      label: "全額",
      ratio: 100,
      amount: 8800,
      dueDate: "2026-06-01",
      receivedAmount: 0,
      receivedDate: "",
      paymentMethod: "",
      scheduleStatus: "pending",
      adjustmentAmount: 0,
      notes: "",
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z",
    },
  ],
};

describe("matchAllTransactions", () => {
  it("備注含全形訂單號且金額完全符合 → 高信心", () => {
    const tx = makeTx({
      credit: 8800,
      memo: "0090053145100792600 Ｓ８７９張皓程",
    });
    const entries = matchAllTransactions([tx], [S879_AR]);
    const e = entries[0];
    expect(e.confidence).toBe("high");
    expect(e.arId).toBe("AR-202605-001");
    expect(e.scheduleId).toBe("AR-202605-001-S01");
    expect(e.caseId).toBe("S879");
    expect(e.paymentType).toBe("全額");
  });

  it("金額差 ≤ 50 元 → 中信心", () => {
    const tx = makeTx({
      credit: 8770, // 差 30 元（手續費）
      memo: "7000003111430221601 Ｓ８７９",
    });
    const entries = matchAllTransactions([tx], [S879_AR]);
    expect(entries[0].confidence).toBe("medium");
    expect(entries[0].arId).toBe("AR-202605-001");
  });

  it("找到 AR 但無匹配分期金額 → arId 有值，scheduleId 為 null，中信心", () => {
    const tx = makeTx({
      credit: 50000, // 與分期金額差很大
      memo: "Ｓ８７９測試",
    });
    const entries = matchAllTransactions([tx], [S879_AR]);
    expect(entries[0].arId).toBe("AR-202605-001");
    expect(entries[0].scheduleId).toBeNull();
    expect(entries[0].confidence).toBe("medium");
  });

  it("支出項目（debit）→ 無比對，confidence=none", () => {
    const tx = makeTx({ debit: 11500, credit: null, memo: "Ｌ５８７南港床頭翻修" });
    const entries = matchAllTransactions([tx], [S879_AR]);
    expect(entries[0].arId).toBeNull();
    expect(entries[0].confidence).toBe("none");
  });

  it("備注無訂單號且金額無法比對 → confidence=none", () => {
    const tx = makeTx({ credit: 9999, memo: "8220000613540250150" });
    const entries = matchAllTransactions([tx], [S879_AR]);
    expect(entries[0].confidence).toBe("none");
    expect(entries[0].arId).toBeNull();
  });

  it("已收款分期（scheduleStatus=paid）不列為候選", () => {
    const paidAR: ARWithSchedules = {
      ...S879_AR,
      schedules: [{ ...S879_AR.schedules[0], scheduleStatus: "paid", receivedAmount: 8800 }],
    };
    const tx = makeTx({ credit: 8800, memo: "Ｓ８７９" });
    const entries = matchAllTransactions([tx], [paidAR]);
    expect(entries[0].scheduleId).toBeNull();
  });

  it("status=pending 的 entry 初始狀態為 pending", () => {
    const tx = makeTx({ credit: 8800, memo: "Ｓ８７９" });
    const entries = matchAllTransactions([tx], [S879_AR]);
    expect(entries[0].status).toBe("pending");
  });
});
```

- [ ] **Step 2：確認測試失敗**

```bash
npm test -- bank-reconciliation-matcher
```
Expected: FAIL（模組不存在）

- [ ] **Step 3：實作 bank-reconciliation-matcher.ts**

```typescript
// src/lib/bank-reconciliation-matcher.ts

import type {
  ARWithSchedules,
  ARScheduleRecord,
  BankTransaction,
  BankPaymentType,
  ReconcileConfidence,
  ReconciliationEntry,
} from "@/lib/types";
import { extractCaseIdFromMemo } from "@/lib/bank-csv-parser";

const AMOUNT_TOLERANCE = 50;

function inferPaymentType(scheduleLabel: string): BankPaymentType {
  if (scheduleLabel.includes("訂")) return "訂金";
  if (scheduleLabel.includes("尾")) return "尾款";
  return "全額";
}

function findBestSchedule(
  schedules: ARScheduleRecord[],
  amount: number,
): { schedule: ARScheduleRecord; confidence: ReconcileConfidence } | null {
  const candidates = schedules.filter(
    (s) => s.scheduleStatus !== "paid" && s.scheduleStatus !== "waived",
  );
  if (!candidates.length) return null;

  const exact = candidates.find((s) => s.amount === amount);
  if (exact) return { schedule: exact, confidence: "high" };

  const close = candidates.find((s) => Math.abs(s.amount - amount) <= AMOUNT_TOLERANCE);
  if (close) return { schedule: close, confidence: "medium" };

  return null;
}

function matchSingle(
  tx: BankTransaction,
  arList: ARWithSchedules[],
): Pick<
  ReconciliationEntry,
  | "arId"
  | "scheduleId"
  | "caseId"
  | "caseNameSnapshot"
  | "clientNameSnapshot"
  | "paymentType"
  | "confidence"
> {
  const none = {
    arId: null,
    scheduleId: null,
    caseId: null,
    caseNameSnapshot: null,
    clientNameSnapshot: null,
    paymentType: null,
    confidence: "none" as const,
  };

  // 只處理存入（credit）
  if (!tx.credit) return none;

  const extractedId = extractCaseIdFromMemo(tx.memo);
  if (!extractedId) return none;

  const ar = arList.find(
    (a) => a.caseId === extractedId || a.caseId.endsWith(extractedId),
  );
  if (!ar) return none;

  const result = findBestSchedule(ar.schedules, tx.credit);
  if (result) {
    return {
      arId: ar.arId,
      scheduleId: result.schedule.scheduleId,
      caseId: ar.caseId,
      caseNameSnapshot: ar.caseNameSnapshot,
      clientNameSnapshot: ar.clientNameSnapshot,
      paymentType: inferPaymentType(result.schedule.label),
      confidence: result.confidence,
    };
  }

  // AR 找到但分期金額對不上
  return {
    arId: ar.arId,
    scheduleId: null,
    caseId: ar.caseId,
    caseNameSnapshot: ar.caseNameSnapshot,
    clientNameSnapshot: ar.clientNameSnapshot,
    paymentType: null,
    confidence: "medium",
  };
}

export function matchAllTransactions(
  transactions: BankTransaction[],
  arList: ARWithSchedules[],
): ReconciliationEntry[] {
  return transactions.map((tx) => ({
    tx,
    status: "pending" as const,
    ...matchSingle(tx, arList),
  }));
}
```

- [ ] **Step 4：確認測試通過**

```bash
npm test -- bank-reconciliation-matcher
```
Expected: 全部 PASS

- [ ] **Step 5：跑所有測試確認無 regression**

```bash
npm test
```
Expected: 全部 PASS

- [ ] **Step 6：Commit**

```bash
git add src/lib/bank-reconciliation-matcher.ts src/__tests__/bank-reconciliation-matcher.test.ts
git commit -m "feat(bank-reconciliation): auto-matcher with full-width code extraction"
```

---

## Task 4：頁面骨架 + 導覽連結

**Files:**
- Create: `src/app/bank-reconciliation/page.tsx`
- Create: `src/app/bank-reconciliation/BankReconciliationClient.tsx`（骨架）
- Modify: `src/components/layout/nav-links.ts`

- [ ] **Step 1：建立 page.tsx**

```typescript
// src/app/bank-reconciliation/page.tsx
import { BankReconciliationClient } from "./BankReconciliationClient";

export default function BankReconciliationPage() {
  return <BankReconciliationClient />;
}
```

- [ ] **Step 2：建立 BankReconciliationClient.tsx 骨架**

```tsx
// src/app/bank-reconciliation/BankReconciliationClient.tsx
"use client";

import { ScanLine } from "lucide-react";

export function BankReconciliationClient() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScanLine className="h-5 w-5 shrink-0 text-[var(--accent)]" />
        <h1 className="text-xl font-bold">核對入帳</h1>
      </div>
      <p className="text-sm text-[var(--text-secondary)]">開發中</p>
    </div>
  );
}
```

- [ ] **Step 3：加入導覽連結**

在 `src/components/layout/nav-links.ts` 的 import 加入 `ScanLine`，並在財務群組的 `應收帳款` 之後加入：

```typescript
// import 行加入 ScanLine：
import {
  // ...現有 icons...
  ScanLine,
} from "lucide-react";

// navLinks 陣列，應收帳款 之後加入：
{ href: "/bank-reconciliation", label: "核對入帳", icon: ScanLine, roles: ["admin"], group: "finance" },
```

- [ ] **Step 4：確認型別無誤並能導覽到頁面**

```bash
npx tsc --noEmit
```
Expected: 無錯誤

- [ ] **Step 5：Commit**

```bash
git add src/app/bank-reconciliation/ src/components/layout/nav-links.ts
git commit -m "feat(bank-reconciliation): page skeleton and nav link"
```

---

## Task 5：CSV 上傳 + 解析顯示

**Files:**
- Modify: `src/app/bank-reconciliation/BankReconciliationClient.tsx`

此 Task 完成後：使用者可上傳 CSV，看到解析出的原始交易列表（無比對結果）。

- [ ] **Step 1：用完整實作替換骨架**

完整替換 `BankReconciliationClient.tsx` 為以下內容：

```tsx
"use client";

import { useCallback, useState } from "react";
import { ScanLine, Upload, AlertCircle } from "lucide-react";
import { parseSinopacCSV } from "@/lib/bank-csv-parser";
import { matchAllTransactions } from "@/lib/bank-reconciliation-matcher";
import type { BankTransaction, ReconciliationEntry, ARWithSchedules } from "@/lib/types";
import { Button } from "@/components/ui/button";

// ── Sub-components ──────────────────────────────────────────

function UploadArea({ onFile }: { onFile: (text: string) => void }) {
  const [dragging, setDragging] = useState(false);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => onFile(e.target?.result as string ?? "");
    reader.readAsText(file, "utf-8");
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) readFile(file);
      }}
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
        dragging
          ? "border-[var(--accent)] bg-[var(--accent)]/5"
          : "border-[var(--border)] hover:border-[var(--accent)]/50"
      }`}
    >
      <Upload className="mb-3 h-8 w-8 text-[var(--text-tertiary)]" />
      <p className="text-sm font-medium text-[var(--text-primary)]">
        拖放永豐銀行 CSV 至此，或
      </p>
      <label className="mt-2 cursor-pointer text-sm text-[var(--accent)] underline">
        選擇檔案
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) readFile(file);
          }}
        />
      </label>
      <p className="mt-2 text-xs text-[var(--text-tertiary)]">
        支援永豐銀行往來明細 CSV（UTF-8）
      </p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export function BankReconciliationClient() {
  const [entries, setEntries] = useState<ReconciliationEntry[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [accountNumber, setAccountNumber] = useState("");
  const [arList] = useState<ARWithSchedules[]>([]); // Task 6 will populate this

  const handleFile = useCallback(
    (csvText: string) => {
      const result = parseSinopacCSV(csvText);
      setParseErrors(result.errors);
      setAccountNumber(result.accountNumber);
      const matched = matchAllTransactions(result.transactions, arList);
      setEntries(matched);
    },
    [arList],
  );

  const creditCount = entries.filter((e) => e.tx.credit !== null).length;
  const debitCount = entries.filter((e) => e.tx.debit !== null).length;
  const highCount = entries.filter((e) => e.confidence === "high").length;
  const medCount = entries.filter((e) => e.confidence === "medium").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScanLine className="h-5 w-5 shrink-0 text-[var(--accent)]" />
        <h1 className="text-xl font-bold">核對入帳</h1>
      </div>

      {entries.length === 0 ? (
        <UploadArea onFile={handleFile} />
      ) : (
        <>
          {/* 摘要列 */}
          <div className="flex flex-wrap gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm">
            <span className="text-[var(--text-secondary)]">帳號：{accountNumber}</span>
            <span>共 <strong>{entries.length}</strong> 筆</span>
            <span className="text-green-700">存入 {creditCount} 筆</span>
            <span className="text-orange-600">支出 {debitCount} 筆</span>
            <span className="text-blue-700">高信心 {highCount} 筆</span>
            <span className="text-yellow-700">中信心 {medCount} 筆</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setEntries([]); setParseErrors([]); }}
              className="ml-auto text-xs"
            >
              重新上傳
            </Button>
          </div>

          {/* 解析錯誤 */}
          {parseErrors.length > 0 && (
            <div className="flex gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                {parseErrors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            </div>
          )}

          {/* 交易列表（Task 6+ 會擴充） */}
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.tx.txId}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[var(--text-tertiary)]">
                    {entry.tx.txDate} {entry.tx.txTime}
                  </span>
                  {entry.tx.credit !== null && (
                    <span className="font-semibold text-green-700">
                      +${entry.tx.credit.toLocaleString("zh-TW")}
                    </span>
                  )}
                  {entry.tx.debit !== null && (
                    <span className="font-semibold text-orange-600">
                      −${entry.tx.debit.toLocaleString("zh-TW")}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[var(--text-secondary)]">{entry.tx.description}</div>
                {entry.tx.memo && (
                  <div className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
                    {entry.tx.memo}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2：確認型別無誤**

```bash
npx tsc --noEmit
```
Expected: 無錯誤

- [ ] **Step 3：Commit**

```bash
git add src/app/bank-reconciliation/BankReconciliationClient.tsx src/app/bank-reconciliation/page.tsx
git commit -m "feat(bank-reconciliation): CSV upload, parse, and raw transaction list"
```

---

## Task 6：載入 AR 資料 + 自動比對顯示

**Files:**
- Modify: `src/app/bank-reconciliation/BankReconciliationClient.tsx`

此 Task 完成後：頁面載入時抓取所有未結清 AR（含分期），上傳 CSV 後自動顯示比對結果（高/中/無信心標記）。

`GET /api/sheets/ar?includeSchedules=true` 回傳格式：
```json
{ "ars": [ { ...ARRecord, "schedules": [...ARScheduleRecord] } ] }
```

- [ ] **Step 1：在 BankReconciliationClient.tsx 加入 AR 資料載入**

在 `BankReconciliationClient` 元件中，把 `const [arList] = useState<ARWithSchedules[]>([]);` 替換為：

```tsx
const [arList, setArList] = useState<ARWithSchedules[]>([]);
const [arLoading, setArLoading] = useState(true);

useEffect(() => {
  fetch("/api/sheets/ar?includeSchedules=true", { cache: "no-store" })
    .then((r) => r.json())
    .then((data: { ars: ARWithSchedules[] }) => setArList(data.ars ?? []))
    .catch(() => {})
    .finally(() => setArLoading(false));
}, []);
```

同時在 import 行補上 `useEffect`：
```tsx
import { useCallback, useEffect, useState } from "react";
```

- [ ] **Step 2：在 UploadArea 顯示 AR 載入狀態**

在 `UploadArea` 下方（entries.length === 0 的 branch）加入 AR 載入提示：

```tsx
{entries.length === 0 && (
  <>
    <UploadArea onFile={handleFile} />
    {arLoading && (
      <p className="text-center text-xs text-[var(--text-tertiary)]">
        正在載入 AR 資料…
      </p>
    )}
    {!arLoading && (
      <p className="text-center text-xs text-[var(--text-tertiary)]">
        已載入 {arList.length} 筆 AR，上傳 CSV 後自動比對
      </p>
    )}
  </>
)}
```

- [ ] **Step 3：在交易列表每筆加入比對結果標籤**

把 Task 5 的交易列表 card 替換為以下版本（增加信心標籤與比對結果）：

```tsx
{entries.map((entry) => {
  const { tx, confidence, caseId, caseNameSnapshot, paymentType } = entry;
  return (
    <div
      key={tx.txId}
      className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm"
    >
      {/* 第一行：日期 + 金額 */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-[var(--text-tertiary)]">
          {tx.txDate} {tx.txTime} · {tx.description}
        </span>
        {tx.credit !== null && (
          <span className="font-semibold text-green-700">
            +${tx.credit.toLocaleString("zh-TW")}
          </span>
        )}
        {tx.debit !== null && (
          <span className="font-semibold text-orange-600">
            −${tx.debit.toLocaleString("zh-TW")}
          </span>
        )}
      </div>

      {/* 備注 */}
      {tx.memo && (
        <div className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
          {tx.memo}
        </div>
      )}

      {/* 比對結果 */}
      <div className="mt-2 flex items-center gap-2">
        {confidence === "high" && (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
            ✓ 高信心
          </span>
        )}
        {confidence === "medium" && (
          <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">
            ? 中信心
          </span>
        )}
        {confidence === "none" && tx.credit !== null && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
            未配對
          </span>
        )}
        {tx.debit !== null && (
          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-600">
            支出
          </span>
        )}
        {caseId && (
          <span className="text-xs text-[var(--text-secondary)]">
            {caseId} {caseNameSnapshot}
          </span>
        )}
        {paymentType && (
          <span className="text-xs text-[var(--text-tertiary)]">{paymentType}</span>
        )}
      </div>
    </div>
  );
})}
```

- [ ] **Step 4：確認型別無誤**

```bash
npx tsc --noEmit
```
Expected: 無錯誤

- [ ] **Step 5：Commit**

```bash
git add src/app/bank-reconciliation/BankReconciliationClient.tsx
git commit -m "feat(bank-reconciliation): load AR data on mount, display match confidence per transaction"
```

---

## Task 7：人工覆蓋 UI（案件搜尋 + 款項類型 + 略過）

**Files:**
- Modify: `src/app/bank-reconciliation/BankReconciliationClient.tsx`

此 Task 完成後：每筆交易可手動指定案件號 / 款項類型，或標記為「略過」。

- [ ] **Step 1：加入 setEntries 工具函數和 PAYMENT_TYPE_OPTIONS**

在元件最頂部（import 下方，元件外）加入：

```typescript
const PAYMENT_TYPE_OPTIONS: BankPaymentType[] = [
  "訂金", "尾款", "全額", "進貨款", "佣金", "雜項",
];
```

在 import 加入 `BankPaymentType`：
```tsx
import type { BankTransaction, BankPaymentType, ReconciliationEntry, ARWithSchedules } from "@/lib/types";
```

- [ ] **Step 2：加入 updateEntry helper**

在 `BankReconciliationClient` 元件內加入：

```tsx
const updateEntry = useCallback(
  (txId: string, patch: Partial<ReconciliationEntry>) => {
    setEntries((prev) =>
      prev.map((e) => (e.tx.txId === txId ? { ...e, ...patch } : e)),
    );
  },
  [],
);
```

- [ ] **Step 3：把每筆 card 下方加入操作列**

在 Task 6 的比對結果區塊下方加入：

```tsx
{/* 操作列 */}
{entry.status !== "ignored" && entry.tx.credit !== null && (
  <div className="mt-2 flex flex-wrap items-center gap-2">
    {/* 案件號手動輸入 */}
    <input
      type="text"
      placeholder="案件號（如 S879）"
      defaultValue={entry.caseId ?? ""}
      onBlur={(e) => {
        const val = e.target.value.trim().toUpperCase();
        const matched = arList.find((a) => a.caseId === val);
        updateEntry(tx.txId, {
          caseId: val || null,
          arId: matched?.arId ?? null,
          scheduleId: matched ? (entry.scheduleId ?? null) : null,
          caseNameSnapshot: matched?.caseNameSnapshot ?? null,
          clientNameSnapshot: matched?.clientNameSnapshot ?? null,
        });
      }}
      className="h-7 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
    />

    {/* 款項類型 */}
    <select
      value={entry.paymentType ?? ""}
      onChange={(e) =>
        updateEntry(tx.txId, {
          paymentType: (e.target.value as BankPaymentType) || null,
        })
      }
      className="h-7 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs"
    >
      <option value="">款項類型</option>
      {PAYMENT_TYPE_OPTIONS.map((pt) => (
        <option key={pt} value={pt}>{pt}</option>
      ))}
    </select>

    {/* 略過 */}
    <button
      type="button"
      onClick={() => updateEntry(tx.txId, { status: "ignored" })}
      className="rounded px-2 py-0.5 text-xs text-[var(--text-tertiary)] hover:bg-[var(--surface-2)]"
    >
      略過
    </button>
  </div>
)}

{entry.status === "ignored" && (
  <div className="mt-2 flex items-center gap-2">
    <span className="text-xs text-[var(--text-tertiary)]">已略過</span>
    <button
      type="button"
      onClick={() => updateEntry(tx.txId, { status: "pending" })}
      className="text-xs text-[var(--accent)] underline"
    >
      取消略過
    </button>
  </div>
)}

{/* 支出 / 無收入欄位的行只顯示略過 */}
{entry.tx.debit !== null && entry.status !== "ignored" && (
  <div className="mt-2">
    <button
      type="button"
      onClick={() => updateEntry(tx.txId, { status: "ignored" })}
      className="rounded px-2 py-0.5 text-xs text-[var(--text-tertiary)] hover:bg-[var(--surface-2)]"
    >
      略過（進貨款 / 不需核對）
    </button>
  </div>
)}
```

- [ ] **Step 4：確認型別無誤**

```bash
npx tsc --noEmit
```
Expected: 無錯誤

- [ ] **Step 5：Commit**

```bash
git add src/app/bank-reconciliation/BankReconciliationClient.tsx
git commit -m "feat(bank-reconciliation): manual override UI with case search, payment type, and ignore"
```

---

## Task 8：確認 + 寫回 AR

**Files:**
- Modify: `src/app/bank-reconciliation/BankReconciliationClient.tsx`

此 Task 完成後：點「確認已配對項目」後，系統呼叫 `POST .../receive` 寫回每一筆有 arId + scheduleId + paymentType 的確認項目，並顯示每筆的成功/失敗狀態。

- [ ] **Step 1：加入「確認所有已配對」按鈕 + 執行邏輯**

在 summary 列旁邊（`<Button variant="ghost" ... 重新上傳>`前），新增確認按鈕。

先在 `BankReconciliationClient` 加入狀態和 handler：

```tsx
const [submitting, setSubmitting] = useState(false);
const [submitResults, setSubmitResults] = useState<Record<string, "ok" | "error">>({});

// 可確認的定義：有 arId + scheduleId + paymentType，且 status !== "ignored"
const confirmable = entries.filter(
  (e) =>
    e.status !== "ignored" &&
    e.tx.credit !== null &&
    e.arId !== null &&
    e.scheduleId !== null &&
    e.paymentType !== null,
);

async function handleConfirmAll() {
  if (!confirmable.length) return;
  if (!confirm(`確定將 ${confirmable.length} 筆收款寫入應收帳款？`)) return;

  setSubmitting(true);
  const results: Record<string, "ok" | "error"> = {};

  for (const entry of confirmable) {
    try {
      const res = await fetch(
        `/api/sheets/ar/${entry.arId}/schedules/${entry.scheduleId}/receive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduleId: entry.scheduleId,
            receivedAmount: entry.tx.credit,
            receivedDate: entry.tx.txDate,
            paymentMethod: "transfer",
            notes: `銀行核對：${entry.tx.memo}`,
          }),
        },
      );
      const data = (await res.json()) as { ok: boolean };
      results[entry.tx.txId] = data.ok ? "ok" : "error";
      if (data.ok) {
        updateEntry(entry.tx.txId, { status: "confirmed" });
      }
    } catch {
      results[entry.tx.txId] = "error";
    }
  }

  setSubmitResults(results);
  setSubmitting(false);
}
```

- [ ] **Step 2：在 summary 列加入確認按鈕**

在 summary 列（`重新上傳` Button 前）加入：

```tsx
{confirmable.length > 0 && (
  <Button
    size="sm"
    onClick={() => void handleConfirmAll()}
    disabled={submitting}
    className="text-xs"
  >
    {submitting ? "寫入中…" : `確認已配對項目（${confirmable.length} 筆）`}
  </Button>
)}
```

- [ ] **Step 3：在每筆 card 加入成功/失敗標記**

在操作列下方加入結果標記：

```tsx
{submitResults[tx.txId] === "ok" && (
  <p className="mt-1 text-xs text-green-600">✓ 已寫入 AR</p>
)}
{submitResults[tx.txId] === "error" && (
  <p className="mt-1 text-xs text-red-600">✗ 寫入失敗，請手動更新</p>
)}
```

- [ ] **Step 4：確認型別無誤**

```bash
npx tsc --noEmit
```
Expected: 無錯誤

- [ ] **Step 5：跑所有測試**

```bash
npm test
```
Expected: 全部 PASS

- [ ] **Step 6：Commit**

```bash
git add src/app/bank-reconciliation/BankReconciliationClient.tsx
git commit -m "feat(bank-reconciliation): confirm and write-back to AR receive endpoint"
```

---

## 完成後的行為總覽

| 操作 | 系統行為 |
|------|---------|
| 上傳永豐 CSV | 瀏覽器解析，原始帳單資料不離開客戶端 |
| 備注含全形訂單號 | 自動擷取、比對 AR，顯示信心等級 |
| 手動輸入案件號 | 重新比對 AR，更新顯示 |
| 款項類型下拉 | 覆蓋自動推斷結果 |
| 點「略過」 | 標記該筆為略過，不寫入 |
| 點「確認已配對項目」| 批次呼叫 receive endpoint，顯示各筆結果 |
| B2B 無 AR 的項目 | 標記案件號 + 類型，但 scheduleId=null，不觸發 receive |
| 進貨款（支出） | 只能略過，不寫入任何模組（第一版） |

---

## B2B 直接下單無 AR 的處理（補充說明）

這類項目（`scheduleId === null`）在確認按鈕的 `confirmable` filter 中會被自動排除——即使使用者填了案件號和款項類型，也不會呼叫 receive。

介面上會看到：
- 案件號有值（使用者填入）
- 款項類型有值
- 但**不在「確認已配對項目」的計數裡**

這是 MVP 的正確行為。未來功能可以是：若 scheduleId 為 null 但 caseId 有值，提示使用者「此案件尚無 AR，是否先建立 AR？」。
