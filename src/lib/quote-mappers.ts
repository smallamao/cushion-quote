import type { FlexQuoteItem, OrderItem, VersionLineRecord } from "@/lib/types";
import { buildSplitItemFields } from "@/lib/split-panel-metadata";

/**
 * 把已儲存的報價版本明細 (VersionLineRecord) 轉成報價編輯器／PDF 用的 FlexQuoteItem。
 * 供 QuoteEditor（載入版本）與 QuotePreviewDrawer（產報價單 PDF）共用，確保口徑一致。
 */
export function toFlexItemsFromVersion(lines: VersionLineRecord[]): FlexQuoteItem[] {
  return lines.map((line) => ({
    id: crypto.randomUUID(),
    name: line.itemName,
    spec: line.spec,
    qty: line.qty || 1,
    unit: line.unit,
    unitPrice: line.unitPrice,
    amount: line.lineAmount,
    isCostItem: line.isCostItem,
    notes: line.notes,
    imageUrl: line.imageUrl,
    specImageUrl: line.specImageUrl,
    materialId: line.materialId,
    autoPriced: false,
    costPerUnit: line.estimatedUnitCost,
    ...buildSplitItemFields(line),
  }));
}

/**
 * 把報價版本明細轉成訂製訂單品項（供「報價成立 → 建立訂製訂單」帶入品項用）。
 * 只帶客戶看得到、且非內部成本列的品項；依 lineNo 排序。
 * 對應：名稱←itemName、尺寸規格←spec、數量←qty+單位、備註←notes、色號←該筆材質代碼。
 * 泡棉在報價中是獨立一筆品項，會原樣成為一筆訂單品項（不塞進 foamSpec 欄位）。
 *
 * @param materialCodeById 材質 id → 代碼（色號）對照，缺表時色號留空。
 */
/**
 * 報價明細 → 訂製訂單品項。
 *
 * 報價的品名是「給客人看的文案」（多行、含尺寸、含行銷語句），訂單的欄位則是
 * 「給師傅做」用的（名稱／尺寸／數量／色號／泡棉各自分開）。早期是整欄照搬，
 * 結果尺寸欄裝的是布料、尺寸埋在名稱裡、運費也變成要做的品項——近 20 張單裡
 * 有 11 張得人工重打（2026-10-12 清查）。這裡把人工在做的三件事自動化：
 *   ① 濾掉運費／自取／折讓這類不是要做的行
 *   ② 一行裡有多個部位就拆成多項（部位名可同行或獨立成行）
 *   ③ 把尺寸、件數、色號、泡棉各自歸位，行銷文案丟掉
 *
 * 依賴報價文案的既有慣例（quote-drafter skill 有規範）：第一行是品名、尺寸行
 * 形如 `W90 x 60 x 7cm * 二只`、泡棉寫在括號、規格欄用「｜」分段。
 */

/** 不是要製作的品項，不該出現在師傅的工單上。 */
const NON_MAKE_ITEM =
  /(運費|配送費|來回搬運|來回運送|搬運|自行取件|自行送件|自取|丈量|車資|安裝費|折讓)/;
/** 尺寸行：支援 cm 與「公分」、W/D/H 前綴、7-10cm 這種區間寫法。 */
const DIMENSION_LINE =
  /(?:W|w)?\s*\d+(?:\.\d+)?\s*(?:x|×|X)\s*(?:D|H|h|d)?\s*\d+(?:\.\d+)?(?:\s*[~\-–]\s*\d+(?:\.\d+)?)?(?:\s*(?:x|×|X)\s*(?:H|h)?\s*\d+(?:\.\d+)?(?:\s*[~\-–]\s*\d+(?:\.\d+)?)?)?\s*(?:cm|CM|公分)/;
/** 部位名獨立成行（「貴妃坐墊」）；允許英數開頭，否則 L型三人坐墊 會被漏掉。 */
const PART_LABEL_LINE = /^([0-9A-Za-z\u4e00-\u9fa5]{2,10})\s*$/;
/** 部位名與尺寸同行（「坐墊 W66.5 x 64 x 11cm」）。 */
const PART_LABEL_INLINE = /^([0-9A-Za-z\u4e00-\u9fa5]{1,8})\s+(?=(?:W|w)?\s*\d)/;
/** 件數：`* 四塊`、`* 二只`。 */
const PIECE_COUNT = /\*\s*([一二三四五六七八九十兩\d]+\s*(?:只|片|件|塊|組|座|位|式|張|支|顆|pcs?))/i;
/** 泡棉規格。「沿用／不換」是說明不是規格，要排除。 */
const FOAM_SPEC = /kg\/m|密度|泡棉|乳膠/;
const FOAM_NOT_SPEC = /沿用|不換|保留|無內裡/;
/** 行銷文案：師傅不需要看。 */
const SALES_COPY = /適合|兼顧|最常使用|推薦|耐用度|久坐|觸感|質感/;

/**
 * 從規格或品名裡找布料色號。只認兩種樣式：字母開頭的料號（GC75503、BF02-04、
 * S6916）與數字色號（523-33、1000-02）。收得這麼緊是因為放寬會把 `0.08`
 * 這種泡棉密度也當成色號。
 */
function extractColorCode(text: string): string {
  for (const token of String(text ?? "").split(/[\s｜|，,、]+/)) {
    const t = token.trim();
    if (t.length < 3 || t.length > 20) continue;
    if (/^[WDHwdh]\d/.test(t)) continue; // W190、H85 是尺寸不是色號
    if (/^[A-Za-z][A-Za-z0-9\-_.]{2,}$/.test(t) && /\d/.test(t)) return t;
    if (/^\d{2,4}-\d{1,3}$/.test(t)) return t;
  }
  return "";
}

function cleanNote(text: string): string {
  return text.replace(/[（(）)]/g, "").replace(/\s+/g, " ").trim();
}

export function versionLinesToOrderItems(
  lines: VersionLineRecord[],
  materialCodeById: Map<string, string> = new Map(),
): OrderItem[] {
  const items: OrderItem[] = [];

  for (const line of lines
    .filter((l) => l.showOnQuote && !l.isCostItem && l.itemName.trim() !== "")
    .slice()
    .sort((a, b) => a.lineNo - b.lineNo)) {
    const rows = line.itemName.split("\n").map((r) => r.trim()).filter(Boolean);
    if (rows.length === 0) continue;
    const head = rows[0];
    if (NON_MAKE_ITEM.test(head)) continue;

    const specSegments = String(line.spec ?? "")
      .split(/[｜|\n]/)
      .map((x) => x.trim())
      .filter(Boolean);

    let foamSpec = specSegments
      .filter((x) => FOAM_SPEC.test(x) && !FOAM_NOT_SPEC.test(x))
      .join("；");

    // 規格欄有時裝的真的是尺寸（`w60 x 60cm`）或泡棉料別（`0.08 黑硬Q`），
    // 這種就不該去上面找色號，也要留著當 dimensions 的退路。
    const specText = String(line.spec ?? "");
    const specIsDimension = DIMENSION_LINE.test(specText) && !FOAM_SPEC.test(specText);

    // 有連到材質資料庫就用它（最準）；純文字的報價行退而求其次從文字抓代號。
    const linkedCode = line.materialId ? materialCodeById.get(line.materialId) ?? "" : "";
    // 色號只在規格欄找。品名裡放的是尺寸，從那裡抓會把 W190、w216 當成色號
    // （2026-10-12 試跑時真的發生，色號填充率看起來 82% 其實一半是尺寸）。
    const colorFromSpec = specIsDimension ? "" : extractColorCode(specText);
    const colorCode = linkedCode || colorFromSpec;

    // 掃描品名的其餘行，配出 (部位, 尺寸) 組合
    const body = rows.slice(1);
    const parts: { label: string; text: string }[] = [];
    let pendingLabel = "";
    for (const row of body) {
      if (DIMENSION_LINE.test(row)) {
        const inline = row.match(PART_LABEL_INLINE);
        parts.push({
          label: inline ? inline[1] : pendingLabel,
          text: inline ? row.replace(PART_LABEL_INLINE, "") : row,
        });
        pendingLabel = "";
      } else if (PART_LABEL_LINE.test(row) && !SALES_COPY.test(row) && !FOAM_SPEC.test(row)) {
        pendingLabel = row.match(PART_LABEL_LINE)![1];
      }
    }

    if (!foamSpec) {
      foamSpec = body
        .filter((r) => FOAM_SPEC.test(r) && !FOAM_NOT_SPEC.test(r))
        .map((r) => cleanNote(r).replace(/\s*[-–—]\s*$/, ""))
        .join("；");
    }

    // 報價行自身的備註欄要保留，再接上品名裡剩下的說明文字
    const subNote = cleanNote(
      [
        String(line.notes ?? "").trim(),
        body
          .filter(
            (r) =>
              !DIMENSION_LINE.test(r) &&
              !PART_LABEL_LINE.test(r) &&
              !SALES_COPY.test(r) &&
              !FOAM_SPEC.test(r),
          )
          .join(" "),
      ]
        .filter(Boolean)
        .join(" "),
    );

    // 品名裡找不到尺寸時，規格欄若不是布料也不是泡棉，就拿它當尺寸（舊行為的退路）
    const specAsDimension =
      parts.length === 0 &&
      !foamSpec &&
      /\d/.test(specText) && // 純文字的材質描述（「半苯染 半牛皮」）不是尺寸
      (specIsDimension || !colorFromSpec)
        ? specText
        : "";

    const fallbackQty = line.qty > 0 ? `${line.qty}${line.unit ?? ""}` : "";
    const make = (name: string, dimensions: string, quantity: string): OrderItem => ({
      id: `item-${items.length + 1}`,
      name,
      dimensions,
      quantity: quantity || fallbackQty,
      foamSpec,
      foamColor: null,
      itemType: "normal",
      colorCode: colorCode || undefined,
      subNote: subNote || undefined,
    });

    const labelled = parts.filter((p) => p.label);
    if (labelled.length >= 2) {
      // 同部位的多個尺寸合併成一項，不同部位各自一項
      const byPart = new Map<string, string[]>();
      for (const p of labelled) {
        const list = byPart.get(p.label) ?? [];
        list.push(p.text);
        byPart.set(p.label, list);
      }
      for (const [label, texts] of byPart) {
        items.push(
          make(
            `${head}｜${label}`,
            texts.map((t) => t.replace(/\*.*$/, "").trim()).join(" / "),
            texts.map((t) => t.match(PIECE_COUNT)?.[1] ?? "").filter(Boolean).join("＋"),
          ),
        );
      }
      continue;
    }

    items.push(
      make(
        head,
        parts.map((p) => p.text.replace(/\*.*$/, "").trim()).join(" / ") || specAsDimension,
        parts.map((p) => p.text.match(PIECE_COUNT)?.[1] ?? "").filter(Boolean).join("＋"),
      ),
    );
  }

  return items;
}
