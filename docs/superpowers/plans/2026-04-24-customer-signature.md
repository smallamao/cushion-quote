# Customer Touch Signature (客戶手指觸控簽名) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a touch-friendly signature pad to the 售後服務 (after-sales service) editor so customers can sign with their finger on-site; the signature is uploaded to Cloudinary and persisted in Google Sheets.

**Architecture:** `react-signature-canvas` renders the Canvas pad inside a modal. On confirm, the canvas PNG data-URL is converted to a Blob, uploaded to Cloudinary via the existing `/api/upload` endpoint (folder `after-sales-signatures`), and the returned URL + timestamp are stored as two new columns (X, Y) in the "售後服務" sheet. The new fields are surfaced in both the editor UI and the PDF export.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, `react-signature-canvas`, Cloudinary (existing), Google Sheets (existing), `@react-pdf/renderer` (existing)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/types.ts` | Modify | Add `customerSignature?` and `customerSignedAt?` to `AfterSalesService` |
| `src/lib/after-sales-sheet.ts` | Modify | Extend sheet schema from A:W → A:Y; update row parsers and update range |
| `src/app/api/sheets/after-sales/[serviceId]/route.ts` | Modify | Add new fields to `PatchBody` |
| `src/components/after-sales/SignaturePad.tsx` | Create | Modal with react-signature-canvas, clear + confirm buttons |
| `src/app/after-sales/AfterSalesEditorClient.tsx` | Modify | State, upload handler, UI section after completion photos, load/save |
| `src/components/pdf/AfterSalesPDF.tsx` | Modify | Render signature image in 派工/維修 section |

---

## Task 1: Install react-signature-canvas

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install package**

```bash
cd /Users/Mao/SynologyDrive/馬鈴薯沙發/工具小程式/繃布報價
npm install react-signature-canvas
npm install --save-dev @types/react-signature-canvas
```

Expected: no errors, `node_modules/react-signature-canvas` present.

- [ ] **Step 2: Verify types resolve**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: same error count as before (no new errors from the package).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-signature-canvas"
```

---

## Task 2: Extend AfterSalesService type

**Files:**
- Modify: `src/lib/types.ts` lines 133–157

- [ ] **Step 1: Add two optional fields to the interface**

In `src/lib/types.ts`, inside `AfterSalesService`, add after `completionPhotos`:

```typescript
  completionPhotos: string[];
  customerSignature?: string;   // Cloudinary URL of PNG signature
  customerSignedAt?: string;    // ISO timestamp when customer signed
  createdAt: string;
```

Full updated interface (lines 133–157 become):

```typescript
export interface AfterSalesService {
  serviceId: string;
  receivedDate: string;
  relatedOrderNo: string;
  shipmentDate: string;
  clientName: string;
  clientPhone: string;
  clientContact2: string;
  clientPhone2: string;
  deliveryAddress: string;
  modelCode: string;
  modelNameSnapshot: string;
  issueDescription: string;
  issuePhotos: string[];
  status: AfterSalesStatus;
  assignedTo: string;
  scheduledDate: string;
  dispatchNotes: string;
  completedDate: string;
  completionNotes: string;
  completionPhotos: string[];
  customerSignature?: string;
  customerSignedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
```

- [ ] **Step 2: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(after-sales): add customerSignature and customerSignedAt fields to type"
```

---

## Task 3: Extend sheet data layer

**Files:**
- Modify: `src/lib/after-sales-sheet.ts` lines 10–13, 30–84, 165–193

Current sheet is A:W (23 columns, indices 0–22). New columns:
- X (index 23) = `customerSignature`
- Y (index 24) = `customerSignedAt`

- [ ] **Step 1: Update range constants (lines 10–13)**

```typescript
const MAIN_RANGE_FULL = `${MAIN_SHEET}!A:Y`;
const MAIN_RANGE_DATA = `${MAIN_SHEET}!A2:Y`;
const MAIN_RANGE_IDS = `${MAIN_SHEET}!A2:A`;
```

- [ ] **Step 2: Update `rowToService` — add two new fields after `completionPhotos`**

```typescript
function rowToService(row: string[]): AfterSalesService {
  return {
    serviceId: row[0] ?? "",
    receivedDate: row[1] ?? "",
    relatedOrderNo: row[2] ?? "",
    shipmentDate: row[3] ?? "",
    clientName: row[4] ?? "",
    clientPhone: row[5] ?? "",
    clientContact2: row[6] ?? "",
    clientPhone2: row[7] ?? "",
    deliveryAddress: row[8] ?? "",
    modelCode: row[9] ?? "",
    modelNameSnapshot: row[10] ?? "",
    issueDescription: row[11] ?? "",
    issuePhotos: parseJsonArray(row[12]),
    status: (row[13] as AfterSalesStatus) || "pending",
    assignedTo: row[14] ?? "",
    scheduledDate: row[15] ?? "",
    dispatchNotes: row[16] ?? "",
    completedDate: row[17] ?? "",
    completionNotes: row[18] ?? "",
    completionPhotos: parseJsonArray(row[19]),
    customerSignature: row[23] ?? undefined,
    customerSignedAt: row[24] ?? undefined,
    createdAt: row[20] ?? "",
    updatedAt: row[21] ?? "",
    createdBy: row[22] ?? "",
  };
}
```

Note: indices 20–22 stay at createdAt/updatedAt/createdBy; 23–24 are the new ones.

- [ ] **Step 3: Update `serviceToRow` — append two new values**

```typescript
function serviceToRow(s: AfterSalesService): string[] {
  return [
    s.serviceId,
    s.receivedDate,
    s.relatedOrderNo,
    s.shipmentDate,
    s.clientName,
    s.clientPhone,
    s.clientContact2,
    s.clientPhone2,
    s.deliveryAddress,
    s.modelCode,
    s.modelNameSnapshot,
    s.issueDescription,
    JSON.stringify(s.issuePhotos),
    s.status,
    s.assignedTo,
    s.scheduledDate,
    s.dispatchNotes,
    s.completedDate,
    s.completionNotes,
    JSON.stringify(s.completionPhotos),
    s.createdAt,
    s.updatedAt,
    s.createdBy,
    s.customerSignature ?? "",
    s.customerSignedAt ?? "",
  ];
}
```

- [ ] **Step 4: Update `updateService` write range from W to Y**

In `updateService` function (around line 189), change:

```typescript
    range: `${MAIN_SHEET}!A${sheetRow}:W${sheetRow}`,
```

to:

```typescript
    range: `${MAIN_SHEET}!A${sheetRow}:Y${sheetRow}`,
```

- [ ] **Step 5: Verify type check passes**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/after-sales-sheet.ts
git commit -m "feat(after-sales): extend sheet schema to column Y for customer signature"
```

---

## Task 4: Update API PATCH route

**Files:**
- Modify: `src/app/api/sheets/after-sales/[serviceId]/route.ts` lines 50–70

- [ ] **Step 1: Add two fields to `PatchBody` interface**

```typescript
  interface PatchBody {
    receivedDate?: string;
    relatedOrderNo?: string;
    shipmentDate?: string;
    clientName?: string;
    clientPhone?: string;
    clientContact2?: string;
    clientPhone2?: string;
    deliveryAddress?: string;
    modelCode?: string;
    modelNameSnapshot?: string;
    issueDescription?: string;
    issuePhotos?: string[];
    status?: AfterSalesStatus;
    assignedTo?: string;
    scheduledDate?: string;
    dispatchNotes?: string;
    completedDate?: string;
    completionNotes?: string;
    completionPhotos?: string[];
    customerSignature?: string;
    customerSignedAt?: string;
  }
```

- [ ] **Step 2: Verify type check passes**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sheets/after-sales/[serviceId]/route.ts
git commit -m "feat(after-sales): accept customerSignature in PATCH body"
```

---

## Task 5: Create SignaturePad component

**Files:**
- Create: `src/components/after-sales/SignaturePad.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

import { Button } from "@/components/ui/button";

interface SignaturePadProps {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
  uploading?: boolean;
}

export function SignaturePad({ open, onClose, onSave, uploading }: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [empty, setEmpty] = useState(true);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <h2 className="mb-3 text-center text-sm font-semibold text-[var(--text-primary)]">
          客戶簽名確認
        </h2>

        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
          <SignatureCanvas
            ref={sigRef}
            penColor="black"
            canvasProps={{ width: 320, height: 160, className: "block touch-none" }}
            onBegin={() => setEmpty(false)}
          />
        </div>
        <p className="mt-1.5 text-center text-[11px] text-[var(--text-tertiary)]">
          請在上方用手指簽名
        </p>

        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              sigRef.current?.clear();
              setEmpty(true);
            }}
          >
            清除
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={empty || uploading}
            onClick={() => {
              const dataUrl = sigRef.current?.getTrimmedCanvas().toDataURL("image/png");
              if (dataUrl) onSave(dataUrl);
            }}
          >
            {uploading ? "上傳中…" : "確認簽名"}
          </Button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full text-center text-xs text-[var(--text-tertiary)] underline"
        >
          取消
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type check passes**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/after-sales/SignaturePad.tsx
git commit -m "feat(after-sales): add SignaturePad modal component"
```

---

## Task 6: Integrate signature into AfterSalesEditorClient

**Files:**
- Modify: `src/app/after-sales/AfterSalesEditorClient.tsx`

There are four changes in this file: (a) imports, (b) emptyDraft, (c) load effect, (d) signature handler + state, (e) signature UI section.

- [ ] **Step 1: Add import for SignaturePad and PenLine icon**

At the top of the file, add to the existing lucide-react import block `PenLine`:

```typescript
import {
  ArrowLeft,
  Eye,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  PenLine,
  Save,
  Send,
  Stethoscope,
  Trash2,
} from "lucide-react";
```

Add the SignaturePad import after the existing component imports:

```typescript
import { SignaturePad } from "@/components/after-sales/SignaturePad";
```

- [ ] **Step 2: Add `customerSignature` and `customerSignedAt` to `emptyDraft()`**

```typescript
function emptyDraft(): DraftService {
  const today = new Date().toISOString().slice(0, 10);
  return {
    receivedDate: today,
    relatedOrderNo: "",
    shipmentDate: "",
    clientName: "",
    clientPhone: "",
    clientContact2: "",
    clientPhone2: "",
    deliveryAddress: "",
    modelCode: "",
    modelNameSnapshot: "",
    issueDescription: "",
    issuePhotos: [],
    status: "pending",
    assignedTo: "",
    scheduledDate: "",
    dispatchNotes: "",
    completedDate: "",
    completionNotes: "",
    completionPhotos: [],
    customerSignature: "",
    customerSignedAt: "",
  };
}
```

- [ ] **Step 3: Add signature state variables after existing state declarations (around line 133)**

Add two new state variables after the `saving` state line:

```typescript
const [signatureOpen, setSignatureOpen] = useState(false);
const [signatureUploading, setSignatureUploading] = useState(false);
```

- [ ] **Step 4: Update load effect to populate signature fields**

In the `setDraft(...)` call inside the `useEffect` (around lines 234–254), add the two fields:

```typescript
        setDraft({
          receivedDate: service.receivedDate,
          relatedOrderNo: service.relatedOrderNo,
          shipmentDate: service.shipmentDate,
          clientName: service.clientName,
          clientPhone: service.clientPhone,
          clientContact2: service.clientContact2,
          clientPhone2: service.clientPhone2,
          deliveryAddress: service.deliveryAddress,
          modelCode: service.modelCode,
          modelNameSnapshot: service.modelNameSnapshot,
          issueDescription: service.issueDescription,
          issuePhotos: service.issuePhotos ?? [],
          status: service.status,
          assignedTo: service.assignedTo,
          scheduledDate: service.scheduledDate,
          dispatchNotes: service.dispatchNotes,
          completedDate: service.completedDate,
          completionNotes: service.completionNotes,
          completionPhotos: service.completionPhotos ?? [],
          customerSignature: service.customerSignature ?? "",
          customerSignedAt: service.customerSignedAt ?? "",
        });
```

- [ ] **Step 5: Add `handleSignatureSave` function after `removePhoto`**

```typescript
  async function handleSignatureSave(dataUrl: string) {
    setSignatureUploading(true);
    try {
      const fetchRes = await fetch(dataUrl);
      const blob = await fetchRes.blob();
      const file = new File([blob], "signature.png", { type: "image/png" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "after-sales-signatures");
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const json = (await uploadRes.json()) as { ok?: boolean; url?: string; error?: string };
      if (!uploadRes.ok || !json.url) throw new Error(json.error ?? "簽名上傳失敗");
      setDraft((prev) => ({
        ...prev,
        customerSignature: json.url!,
        customerSignedAt: new Date().toISOString(),
      }));
      setSignatureOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "簽名上傳失敗");
    } finally {
      setSignatureUploading(false);
    }
  }
```

- [ ] **Step 6: Add signature UI section after the 完工照片 block (after line ~890)**

After the closing `</div>` of the 完工照片 section (after the `completionPhotoInputRef` input, before the closing `</div>` of 派工區), add:

```tsx
        {/* 客戶簽名 */}
        <div className="mt-4">
          <Label>客戶確認簽名</Label>
          {draft.customerSignature ? (
            <div className="mt-2 flex items-start gap-3">
              <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.customerSignature}
                  alt="客戶簽名"
                  className="h-16 w-auto"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                {draft.customerSignedAt && (
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {new Date(draft.customerSignedAt).toLocaleString("zh-TW")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSignatureOpen(true)}
                  className="text-left text-xs text-[var(--accent)] underline"
                >
                  重新簽名
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      customerSignature: "",
                      customerSignedAt: "",
                    }))
                  }
                  className="text-left text-xs text-red-500 underline"
                >
                  刪除簽名
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSignatureOpen(true)}
              className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <PenLine className="h-4 w-4" />
              點擊讓客戶簽名確認
            </button>
          )}
        </div>
```

- [ ] **Step 7: Mount SignaturePad modal at the bottom of the JSX return, before the last closing tag**

Add just before the final `</>` or closing `</div>` of the component return:

```tsx
      <SignaturePad
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onSave={(dataUrl) => void handleSignatureSave(dataUrl)}
        uploading={signatureUploading}
      />
```

- [ ] **Step 8: Verify type check passes**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: zero new errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/after-sales/AfterSalesEditorClient.tsx
git commit -m "feat(after-sales): integrate customer signature capture and upload"
```

---

## Task 7: Show signature in PDF export

**Files:**
- Modify: `src/components/pdf/AfterSalesPDF.tsx` lines 348–375

- [ ] **Step 1: Add signature image and timestamp inside 派工/維修 section**

After the `completionNotes` row block (around line 372), inside the `<>` fragment of the "派工/維修" conditional, add:

```tsx
              {service.customerSignature ? (
                <View style={s.infoRow}>
                  <View style={{ flexDirection: "row", flex: 1 }}>
                    <Text style={s.infoLabel}>客戶簽名</Text>
                    <View style={{ flex: 1, padding: 5 }}>
                      <Image
                        src={service.customerSignature}
                        style={{ width: 120, height: 40, objectFit: "contain" }}
                      />
                      {service.customerSignedAt ? (
                        <Text style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>
                          {new Date(service.customerSignedAt).toLocaleString("zh-TW")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              ) : null}
```

- [ ] **Step 2: Verify type check passes**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pdf/AfterSalesPDF.tsx
git commit -m "feat(after-sales): render customer signature in PDF export"
```

---

## Task 8: Build verification

- [ ] **Step 1: Run full build**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` with no errors.

- [ ] **Step 2: Manual smoke test**

1. Open an existing service record (edit mode).
2. Scroll to 派工/維修記錄 → 完工照片 → 客戶確認簽名.
3. Tap "點擊讓客戶簽名確認" — modal opens.
4. Draw a signature, tap "確認簽名" — uploading spinner shows, modal closes.
5. Signature thumbnail and timestamp appear.
6. Tap "儲存" — page reloads, signature persists.
7. Open PDF preview — signature visible in 派工/維修資訊 section.

- [ ] **Step 3: Final commit if any last fixes were needed**

```bash
git add -A
git commit -m "fix(after-sales): post-build fixes for customer signature"
```
