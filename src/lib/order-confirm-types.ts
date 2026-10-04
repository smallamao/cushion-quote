import {
  templateCategories,
  type DisclosureTemplateItem,
} from "@/app/templates/data/templates";

/**
 * 線上下訂確認單的純型別（client 與 server 共用，不含 server-only 相依）。
 *
 * 業務背景：客人決定下訂 → 填 Google 表單 → 自動在 Trello「Request」清單建卡。
 * 過去內勤要在 LINE 手動傳訂貨單照片、顏色照片、告知事項與匯款資訊，之後還要再把
 * 照片上傳 Trello 一次。這張確認單把「傳一次 Trello → 客人線上看完並簽名」串起來，
 * 省掉重複上傳，也留下客人同意告知事項的時點證據。
 *
 * 流程位置：Google 表單建卡 →【線上下訂確認單】→ 收訂金 → 排程 → 叫料確認單 → 出貨。
 */

export type OrderConfirmStatus =
  | "sent"       // 已產生連結，等客人確認
  | "confirmed"; // 客人已簽名確認

/** 一張下訂確認的 session（對應 Sheets「訂單確認」一列）。 */
export interface OrderConfirm {
  token: string;        // 客人連結 token（唯一憑證）
  cardId: string;       // Trello 卡片 id（客人端永遠拿不到）
  cardName: string;     // 卡片名稱快照，例「P6276 謝純淳」或「鄭卉絜」
  depositAmount: number;
  /** 本單適用的告知事項條款索引（對應 disclosure.items 的位置） */
  checkedIndexes: number[];
  status: OrderConfirmStatus;
  signerName: string;
  signatureUrl: string; // Cloudinary
  confirmedAt: string;
  signerIp: string;
  signerUserAgent: string;
  /** 內勤實際把連結傳給客人的時間。空＝連結建好但還沒傳出去 */
  notifiedAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  /** 訂單編號（例 P6275）。必填——客人匯款備註要標這個，空的話收款端對不上帳。 */
  orderNo: string;
  /** 匯款期限 YYYY-MM-DD；空＝文案不提期限 */
  payByDate: string;
}

/** 客人端只看得到這些——照片一律走 token 端點，不外洩 Trello 卡號與網址。 */
export interface PublicOrderConfirmView {
  status: OrderConfirmStatus;
  customerName: string;
  depositAmount: number;
  /** 照片張數；客人端用 /photo/{idx} 逐張取圖 */
  photoCount: number;
  /** 告知事項抬頭 */
  disclosureHeader: string;
  /** 本單適用的告知事項條文（已依 checkedIndexes 篩選過） */
  disclosureItems: string[];
  /** 完整匯款訊息（已填入訂金、期限、訂單編號的業務確認版文案） */
  paymentInfo: string;
  orderNo: string;
  /** 匯款期限 YYYY-MM-DD；空＝未設定 */
  payByDate: string;
  signerName: string;
  confirmedAt: string;
}

/**
 * 取得「告知事項」範本。
 *
 * 🔴 刻意不複製一份文字過來：這 12 條是業務核可的法律條文（無鑑賞期、叫料後不可取消、
 *    誤差值、色差、搬運衍生費用…），複製就會有一天兩邊不一致，對客人主張的依據就壞了。
 *    一律從既有的快速回覆範本讀取，那裡是唯一真相來源。
 */
export function getOrderDisclosure(): DisclosureTemplateItem | null {
  for (const cat of templateCategories) {
    const found = cat.items.find(
      (i): i is DisclosureTemplateItem => i.type === "disclosure" && i.id === "disclosure",
    );
    if (found) return found;
  }
  return null;
}

/**
 * 預設勾選的條款索引。
 *
 * 範本的 defaultChecked 已經標好哪幾條預設不適用（椅腳／牛皮／寵物貓抓布那幾項，
 * 只有該單真的有改椅腳、選牛皮時才需要告知），內勤產生連結時可再逐單調整。
 */
export function defaultCheckedIndexes(): number[] {
  const d = getOrderDisclosure();
  if (!d) return [];
  return d.items
    .map((_, i) => i)
    .filter((i) => d.defaultChecked?.[i] !== false);
}

/** 依勾選索引取出要顯示給客人的條文（索引超出範圍者略過）。 */
export function pickDisclosureItems(checked: number[]): string[] {
  const d = getOrderDisclosure();
  if (!d) return [];
  const set = new Set(checked);
  return d.items.filter((_, i) => set.has(i));
}
