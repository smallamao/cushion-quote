# Bug 回報：autoCreateMissing 線上不觸發（已確認根因）

> 回報：排程系統串接端　日期：2026-07-23　嚴重度：中（串接主功能不完整）

## 現象
- 部署已生效（response 有 `autoCreated` 欄位＝新 code 已上 production）。
- 但 `autoCreateMissing:true` + `dryRun:false` **真跑**時：`autoCreated` 恆 `[]`、unmatched 原封不動。
- 實測 `POST /from-paste {pasteText:"BBL5-17 14y #P6177", autoCreateMissing:true, dryRun:false}`
  → `autoCreated:[]`、`unmatched:["BBL5-17"]`（BBL5-12、BBL5-19 明明在目錄、能被比對、能進採購單）。
- 那批 16 行驗收：仍 7 unmatched、只建 3 張（應 5 張）。

## ✅ 已確認根因（欄位不對稱）

**比對貼上色號**（`resolveParsedLines`，`lib/purchase-paste-parser.ts` L181-203）用 **5 個欄位**建索引：
`productCode` / `supplierProductCode` / `colorCode` / `normalizeCode(productCode)` / `normalizeCode(specification)`
（`normalizeCode` = 去掉非英數，"BBL5-12" → "bbl512"）。
→ 所以「BBL5-12」**很可能是靠 `colorCode` 或 `specification` 對到的**，那筆商品的 `productCode` 其實是內部編號（如 `SC…`）。

**但 `findBestTemplate`**（`lib/purchase-from-paste.ts` L32-50）**只用 `productCode` 抽前綴**：
```ts
catalog.filter(p => p.isActive && extractProductPrefix(p.productCode) === prefix)
```
`extractProductPrefix("BBL5-17")` = "BBL5"，但 BBL5 系列商品的 `productCode` 若是 `SC…` → `extractProductPrefix` = "SC" ≠ "BBL5" → 候選 0 → 回 null → 跳過 → autoCreate 0。

**一句話：找範本用的欄位（僅 productCode）跟比對貼上色號用的欄位（5 個）不對稱，所以「對得到卻複製不出來」。**

## 修法（讓 findBestTemplate 與 resolveParsedLines 用同一組欄位）

候選判定改成「商品任一識別欄位的前綴 === 目標前綴」：

```ts
function productPrefixes(p: PurchaseProduct): string[] {
  return [p.productCode, p.colorCode, p.supplierProductCode, p.specification]
    .filter(Boolean)
    .map((s) => extractProductPrefix(String(s)))
    .filter(Boolean);
}

export function findBestTemplate(code, catalog) {
  const prefix = extractProductPrefix(code);
  if (!prefix) return null;
  const candidates = catalog.filter(
    (p) => p.isActive && productPrefixes(p).includes(prefix),
  );
  if (candidates.length === 0) return null;
  return candidates.slice().sort((a, b) => {
    const cmp = b.updatedAt.localeCompare(a.updatedAt);
    return cmp !== 0 ? cmp : a.productCode.localeCompare(b.productCode);
  })[0];
}
```

> 另：`cloneProductAsNew` 目前把 `productCode` 與 `colorCode` 都設成新色號（如 BBL5-17）。
> 若真正識別欄位是 `colorCode`，這樣建出來的新品**下次會對得到**（resolveParsedLines 也查 colorCode），OK。
> 但請確認「新品的 supplierId 沿用範本」正確（範本靠 colorCode 找到，其 supplierId 要是 BBL5→尚慶）。

## 驗收（修好後）
`POST {pasteText:<16行驗收案例>, autoCreateMissing:true, dryRun:false}`
→ `autoCreated` 應含 `BBL5-17←BBL5-12`、`BBL5-09←BBL5-12`、`BG114←BG115`、`BG102←BG115`… → unmatched 只剩「真的沒有同前綴範本」者 → 建 5 張採購單。

## 排程端現況
串接已完成、可正常呼叫（金鑰對、能建單、PDF→JPG 都通）。**只差這個 findBestTemplate 欄位修正**，整條線就完整自動。
