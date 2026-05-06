import { PRODUCTS, S_ORDER_CUSTOM_FIELDS, TRELLO } from "@/lib/trello-constants";

export interface TrelloLabel {
  id: string;
  name: string;
  color: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  due: string | null;
  dueComplete: boolean;
  idList: string;
  idBoard: string;
  labels: TrelloLabel[];
  badges: { checkItems: number; checkItemsChecked: number };
  customFieldItems?: CustomFieldItem[];
}

export interface CustomFieldItem {
  id: string;
  idCustomField: string;
  value: { text?: string; number?: string; checked?: string; date?: string };
}

export interface TrelloAttachmentPreview {
  id: string;
  url: string;
  width: number;
  height: number;
  scaled: boolean;
}

export interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  bytes: number;
  date: string;
  isUpload: boolean;
  previews: TrelloAttachmentPreview[];
}

export interface DriverConfig {
  key: string;
  phone: string;
}

export type TrelloAttachmentImagePreference = "thumbnail" | "full";

// ─────────────── helpers ───────────────

export function getCustomFieldText(items: CustomFieldItem[], fieldId: string): string {
  return items.find((i) => i.idCustomField === fieldId)?.value?.text ?? "";
}

// Try multiple field IDs in order; returns the first non-empty text value.
// Useful for cards from different boards that share the same logical field
// but have different field IDs (e.g. production board vs. S Order board).
export function getCustomFieldTextAny(items: CustomFieldItem[], ...fieldIds: string[]): string {
  for (const id of fieldIds) {
    const val = items.find((i) => i.idCustomField === id)?.value?.text;
    if (val) return val;
  }
  return "";
}

export function getCustomFieldDate(items: CustomFieldItem[], fieldId: string): Date | null {
  const raw = items.find((i) => i.idCustomField === fieldId)?.value?.date;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function getCustomFieldDateAny(items: CustomFieldItem[], ...fieldIds: string[]): Date | null {
  for (const id of fieldIds) {
    const result = getCustomFieldDate(items, id);
    if (result) return result;
  }
  return null;
}

export function getCustomFieldNumber(items: CustomFieldItem[], fieldId: string): number {
  const raw = items.find((i) => i.idCustomField === fieldId)?.value?.number;
  return raw ? parseFloat(raw) : 0;
}

export function normalizePhone(raw: string): string | null {
  const digits = raw.split("").filter((c) => c >= "0" && c <= "9").join("");
  if (digits.startsWith("886")) {
    const local = digits.slice(3);
    if (local.startsWith("0")) return local.length >= 10 ? local.slice(0, 10) : null;
    return local.length >= 9 ? "0" + local.slice(0, 9) : null;
  }
  if (digits.length === 9) return "0" + digits;
  if (digits.length >= 10) return digits.slice(0, 10);
  return null;
}

export function formatRocDate(isoString: string | null): string | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  const rocYear = date.getFullYear() - 1911;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${rocYear}.${month}.${day}`;
}

export function formatHHmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function addHours(date: Date, h: number): Date {
  return new Date(date.getTime() + h * 3600 * 1000);
}

function dedupeUrls(urls: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push(url);
  }

  return unique;
}

function isImageAttachment(attachment: TrelloAttachment): boolean {
  return attachment.mimeType.startsWith("image/") || attachment.previews.length > 0;
}

function getAttachmentImageUrls(
  attachment: TrelloAttachment,
  preference: TrelloAttachmentImagePreference,
): string[] {
  const previews = attachment.previews ?? [];
  const orderedPreviews = preference === "thumbnail" ? previews : [...previews].reverse();
  return dedupeUrls([...orderedPreviews.map((preview) => preview.url), attachment.url]);
}

export function getTrelloAttachmentImageUrls(
  attachments: TrelloAttachment[],
  preference: TrelloAttachmentImagePreference = "full",
): string[] {
  for (let i = attachments.length - 1; i >= 0; i -= 1) {
    const attachment = attachments[i];
    if (!attachment || !isImageAttachment(attachment)) continue;

    const urls = getAttachmentImageUrls(attachment, preference);
    if (urls.length > 0) return urls;
  }

  return [];
}

export function getAllTrelloImageUrlGroups(
  attachments: TrelloAttachment[],
  preference: TrelloAttachmentImagePreference = "full",
): string[][] {
  const groups: string[][] = [];
  for (const attachment of attachments) {
    if (!isImageAttachment(attachment)) continue;
    const urls = getAttachmentImageUrls(attachment, preference);
    if (urls.length > 0) groups.push(urls);
  }
  return groups;
}

// ─────────────── 維修單 ───────────────

export function buildRepairOrderText(card: TrelloCard, customFields: CustomFieldItem[]): string | null {
  const shippingDate = formatRocDate(card.due);
  if (!shippingDate) return null;

  const orderNumber = card.name.match(/P\d{4,6}/)?.[0];
  if (!orderNumber) return null;

  const descLines = card.desc.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const address = descLines[0];
  if (!address) return null;

  const communityName = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.COMMUNITY_NAME);
  const finalAddress = communityName ? `${address}〔${communityName}〕` : address;

  const primaryName =
    getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.PRIMARY_CONTACT_NAME) ||
    card.name.replace(orderNumber, "").trim();

  const primaryPhoneRaw =
    getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.PRIMARY_CONTACT_PHONE) ||
    descLines.slice(1).find((l) => !l.includes("/")) ||
    "";
  const primaryPhone = normalizePhone(primaryPhoneRaw);
  if (!primaryPhone) return null;

  const styleLabel = card.labels.find((l) => l.name.startsWith("成交/"));
  const style = styleLabel?.name.replace("成交/", "") ?? null;

  const secondaryPhoneRaw = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.SECONDARY_CONTACT_PHONE);
  const secondaryName = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.SECONDARY_CONTACT_NAME);
  let secondaryLine: string | null = null;
  if (secondaryPhoneRaw && secondaryName) {
    const p = normalizePhone(secondaryPhoneRaw);
    if (p) secondaryLine = `${p} ${secondaryName}`;
  } else {
    const slashLine = [...descLines].reverse().find((l) => l.includes("/"));
    if (slashLine) {
      const parts = slashLine.split("/");
      const p = normalizePhone(parts[0] ?? "");
      const n = parts[parts.length - 1]?.trim();
      if (p && n) secondaryLine = `${p} ${n}`;
    }
  }

  const lines = [shippingDate, orderNumber];
  if (style) lines.push(style);
  lines.push(finalAddress);
  lines.push(`${primaryPhone} ${primaryName}`);
  if (secondaryLine) lines.push(secondaryLine);

  return lines.join("\n");
}

// ─────────────── 客戶資訊 ───────────────

export function buildCustomerInfoText(card: TrelloCard, customFields: CustomFieldItem[]): string {
  const descLines = card.desc.split("\n").map((l) => l.trim()).filter(Boolean);
  const address = descLines[0] ?? "";
  const communityName = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.COMMUNITY_NAME);
  const finalAddress = communityName ? `${address}〔${communityName}〕` : address;

  const orderNumber = card.name.match(/P\d{4,6}/)?.[0] ?? "";
  const primaryName =
    getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.PRIMARY_CONTACT_NAME) ||
    card.name.replace(orderNumber, "").trim();
  const primaryPhoneRaw =
    getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.PRIMARY_CONTACT_PHONE) ||
    descLines[1] ||
    "";
  const primaryPhone = normalizePhone(primaryPhoneRaw) ?? primaryPhoneRaw;

  const secondaryPhoneRaw = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.SECONDARY_CONTACT_PHONE);
  const secondaryName = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.SECONDARY_CONTACT_NAME);

  const lines = [finalAddress, `${primaryPhone} ${primaryName}`];
  if (secondaryPhoneRaw && secondaryName) {
    const p = normalizePhone(secondaryPhoneRaw.split("/")[0]?.trim() ?? "");
    if (p) lines.push(`${p} ${secondaryName}`);
  }
  return lines.join("\n");
}

// ─────────────── 排程簡訊 ───────────────

export function buildScheduleSMS(card: TrelloCard, customFields: CustomFieldItem[]): string {
  if (!card.due) return "未設置出貨日期";

  const colorStr = getCustomFieldTextAny(customFields, TRELLO.CUSTOM_FIELDS.COLOR, S_ORDER_CUSTOM_FIELDS.COLOR).replace(/,/g, "&");
  let scheduleTextStr = getCustomFieldTextAny(customFields, TRELLO.CUSTOM_FIELDS.SCHEDULE_TEXT, S_ORDER_CUSTOM_FIELDS.SCHEDULE_TEXT);
  let accessoriesText = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.ACCESSORIES);
  let chairLegStyle = getCustomFieldTextAny(customFields, TRELLO.CUSTOM_FIELDS.CHAIR_LEG, S_ORDER_CUSTOM_FIELDS.CHAIR_LEG);

  if (!chairLegStyle) {
    const productLabel = card.labels.find((l) => l.name?.startsWith("成交/"));
    const productCode = productLabel?.name?.replace("成交/", "");
    chairLegStyle = PRODUCTS.find((p) => p.displayName === productCode)?.defaultFoot ?? "";
  }

  if (accessoriesText.includes("/")) {
    const [color, num] = accessoriesText.split("/");
    accessoriesText = `抱枕(${color ?? ""})${num ?? ""}只`;
  } else if (accessoriesText && !accessoriesText.includes("只")) {
    accessoriesText = `抱枕(${accessoriesText})2只`;
  }

  const date = new Date(card.due);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const deadline = new Date(card.due);
  deadline.setDate(deadline.getDate() + 5);
  const dm = deadline.getMonth() + 1;
  const dd = deadline.getDate();
  const scheduleString = month === dm ? `${month}/${day}-${dd}` : `${month}/${day}-${dm}/${dd}`;

  let name = card.name.slice(0, 7);
  if (card.name.includes("S")) name = card.name;
  const area = card.desc?.slice(0, 2) ?? "";

  let pressing = false;
  let sofaRecycle = false;
  let purchaseNotice = false;
  let exhibits = false;
  let hasAssembly = false;

  let contentMsg = `[急]${name}-舊、${area} \n`;
  if (card.name.includes("S")) contentMsg = `[急]${card.name}-舊 \n`;

  for (const label of card.labels) {
    const labelName = label.name ?? "";
    if (labelName.startsWith("成交/")) {
      const productCode = labelName.replace("成交/", "");
      const product = PRODUCTS.find((p) => p.displayName === productCode);

      const scheduleTextArr = scheduleTextStr.split(",");
      let scheduleTextFirst = scheduleTextArr[0] ?? "";
      scheduleTextFirst = scheduleTextFirst.replace(/\d+cm/g, "");

      const hasModifyArmrest = scheduleTextArr.slice(1).some((s) => s.includes("改") && s.includes("扶手"));
      const hasModifyPlatform = scheduleTextArr.slice(1).some((s) => s.includes("改") && s.includes("平台"));

      if (hasModifyArmrest) {
        scheduleTextFirst = scheduleTextFirst
          .replace("(扣扶手)", "")
          .replace("(扣平台扶手)", "(扣平台)")
          .replace("(扣平台扣扶手)", "(扣平台)")
          .replace("(扣平台、扶手)", "(扣平台)");
      }
      if (hasModifyPlatform) {
        scheduleTextFirst = scheduleTextFirst.replace("(扣平台)", "");
      }

      scheduleTextArr[0] = scheduleTextFirst;
      scheduleTextStr = scheduleTextArr.join(",");

      if (product && !scheduleTextFirst.includes(product.moduleName)) {
        scheduleTextStr = product.moduleName + scheduleTextStr;
      }
      contentMsg += scheduleTextStr;
    }
    if (labelName.includes("急單")) pressing = true;
    if (labelName.includes("舊沙發")) sofaRecycle = true;
    if (labelName.includes("無電梯")) { /* will annotate address separately */ }
    if (labelName.includes("組裝")) { contentMsg += ",【扶手現場組裝】"; hasAssembly = true; }
    if (labelName.includes("到料")) purchaseNotice = true;
    if (labelName.includes("展示品")) exhibits = true;
  }
  void hasAssembly;

  if (accessoriesText.length > 1) contentMsg += `,${accessoriesText}`;
  contentMsg += `,${colorStr}`;
  if (purchaseNotice) contentMsg += "         ***到料通知***";
  contentMsg += "\n";
  contentMsg += `${chairLegStyle}\n`;
  contentMsg += scheduleString;

  if (!sofaRecycle) contentMsg = contentMsg.replace("-舊", "");
  if (!pressing) contentMsg = contentMsg.replace("[急]", "");
  if (exhibits) contentMsg = "(展示品)" + contentMsg;

  return contentMsg;
}

// ─────────────── 裁剪工作單 ───────────────

export function buildCuttingWorkOrder(card: TrelloCard, customFields: CustomFieldItem[]): string {
  let colorStr = getCustomFieldTextAny(customFields, TRELLO.CUSTOM_FIELDS.COLOR, S_ORDER_CUSTOM_FIELDS.COLOR).replace(/,/g, "&");
  const scheduleTextStr = getCustomFieldTextAny(customFields, TRELLO.CUSTOM_FIELDS.SCHEDULE_TEXT, S_ORDER_CUSTOM_FIELDS.SCHEDULE_TEXT);

  const name = card.name.includes("S") ? card.name : card.name.slice(0, 5);
  let contentMsg = `${name}\n`;

  for (const label of card.labels) {
    const labelName = label.name ?? "";
    if (!labelName.startsWith("成交/")) continue;

    const productCode = labelName.replace("成交/", "");
    const product = PRODUCTS.find((p) => p.displayName === productCode);

    const scheduleTextArr = scheduleTextStr.split(",");
    const scheduleTextFirst = scheduleTextArr[0] ?? "";

    if (product) {
      if (scheduleTextFirst.includes(product.moduleName)) {
        contentMsg += scheduleTextFirst;
      } else {
        contentMsg += `${product.moduleName} ${scheduleTextFirst}`;
      }
    } else {
      contentMsg += scheduleTextFirst;
    }

    contentMsg = contentMsg.replace("(扣扶手)", "");
    if (scheduleTextStr.includes("反")) contentMsg = contentMsg.replace("反", "(反向)");
    if (scheduleTextStr.includes("組一")) contentMsg = contentMsg.replace("組一", "(組椅)");
    if (scheduleTextFirst.includes("訂")) {
      contentMsg = contentMsg.replace("訂", " ");
      contentMsg += "【訂尺寸】";
    }
    contentMsg += "\n";

    for (let i = 1; i < scheduleTextArr.length; i++) {
      const item = scheduleTextArr[i] ?? "";
      if (!item.includes("USB") && !item.includes("抱枕") && !item.includes("組裝")) {
        contentMsg += `${item}\n`;
      }
    }

    if (colorStr.includes("&")) {
      const colorArr = colorStr.split("&");
      const colorInfoArr = (product?.colorInfo ?? "&").split("&");
      colorStr = `${colorArr[0]}：${colorInfoArr[0] ?? ""}\n${colorArr[1]}：${colorInfoArr[1] ?? ""}`;
    }
  }

  contentMsg += "\n";
  contentMsg += colorStr;
  return contentMsg;
}

// ─────────────── 出貨通知簡訊 ───────────────

export interface ShippingMsgOptions {
  timeRangeHours: 1 | 2;
  driverTitle: string;    // driver.title — shown in customer-facing messages (e.g., "阿信 (兩人）[BXH-6828]")
  driverGreeting: string; // driver.confirmTitle — first line of driver confirm message (e.g., "阿信哥～")
  driverPhone: string;
  driverKey: string;
  finalPayment: number;
  receiveAccount: "jinshuei" | "potato";
  sofaRecycle: boolean;
  sofaRecycleFree: boolean;
  isDriverConfirm: boolean;
  isBackShipping: boolean;
  isCleaning: boolean;
}

export function buildShippingMsg(
  card: TrelloCard,
  customFields: CustomFieldItem[],
  opts: ShippingMsgOptions,
): string {
  if (!card.due) return "未設置出貨日期";

  const date = new Date(card.due);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const timeStr = formatHHmm(date);
  const timeEnd = formatHHmm(addHours(date, opts.timeRangeHours));
  const timeRange = `${timeStr} - ${timeEnd}`;
  const dateStr = `${date.getFullYear()}年${month}月${day}日(${["日","一","二","三","四","五","六"][date.getDay()]}) ${timeStr}`;
  const paymentStr = `$${opts.finalPayment.toLocaleString("zh-TW")}`;

  // 司機確認單模式
  if (opts.isDriverConfirm) {
    return buildDriverConfirmMsg(card, customFields, opts, dateStr, timeRange);
  }

  // 載回貨趟
  if (opts.isBackShipping) {
    return buildBackShippingMsg(date, month, day, timeRange, opts);
  }

  // 到府清潔
  if (opts.isCleaning) {
    return buildCleaningMsg(date, month, day, timeStr);
  }

  const furnitureAmount = getCustomFieldNumber(customFields, TRELLO.CUSTOM_FIELDS.FURNITURE_AMOUNT);
  const hasAssembly = card.labels.some((l) => l.name?.includes("組裝"));
  void hasAssembly;

  let msg = `【馬鈴薯沙發 出貨通知】

您好，已為您安排好配送車趟資訊如下

日期：${date.getFullYear()}年${month}月${day}日
時間：${timeRange}
(確切時間依司機當日出車狀況而定！)

司機：${opts.driverTitle}
電話：${opts.driverPhone}


備註事項：
1.餘額 ${paymentStr}
貨到付款煩請給司機收！

2.舊沙發

⚠️如需更動煩請儘速通知我們協助調度
⚠️傢俱類到貨7日內為鑑賞期(注意:鑑賞期非試用期)，
若非商品品質瑕疵問題於鑑賞期內退貨之情形，我們需酌收退貨運費！
⚠️受限於交通狀況，易產生延遲狀況，恕無法保證到貨時段，煩請依照物流司機大哥實際聯絡情況！

【溫馨提示】
您安排的配送時間接近下班時段，車流量較大抵達時間容易有誤差，如有任何配送問題可直接與司機大哥聯繫。

💡 麻煩收到沙發後協助提供幾張美美的照片(橫拍)
💡 讓我們可以整理歸檔分享給其他客人參考哦🙏🙏

💡 沙發到貨後如果覺得滿意請給予我們支持與鼓勵
💡 您們的真心好評就是我們最大的動力 😊
💡 若有任何流程需要改進的地方也請不吝告知！

FB 連結🔗  http://bit.ly/35pl3CP
Google 連結🔗  http://bit.ly/35qiKPM
(＊使用Google Map App開啟才可以夾帶照片喔！）`;

  // 17:00 前移除溫馨提示
  if (date.getHours() < 17) {
    msg = msg.replace(
      /\n\n【溫馨提示】\n您安排的配送時間接近下班時段，[\s\S]*?聯繫。/,
      "",
    );
  }

  // 舊沙發處理
  if (opts.sofaRecycle) {
    if (opts.sofaRecycleFree) {
      msg = msg.replace("2.舊沙發", "2.舊沙發抬至回收處(優惠），如司機有額外收取費用請通知我們！");
    } else {
      msg = msg.replace("2.舊沙發", "2.舊沙發抬至回收處，司機評估後，依大小酌收＄500~1,000(現收）");
    }
  } else {
    msg = msg.replace("\n2.舊沙發\n", "\n");
  }

  // 尾款處理
  if (opts.finalPayment === 0) {
    msg = msg.replace(`1.餘額 ${paymentStr}`, `1.餘額 ${paymentStr} 尾款已結清！`);
    msg = msg.replace("\n貨到付款煩請給司機收！", "");
  } else if (opts.driverKey === "ya") {
    // 葉師傅：尾款改匯款
    const bankLine = buildBankLine(opts.receiveAccount, month, day);
    msg = msg.replace("貨到付款煩請給司機收！", `尾款請於【${month}/${day}】前匯至以下帳戶\n\n${bankLine}\n\n完成匯款後，請告知匯款日期及帳號後五碼喔！`);
  } else {
    const bankLine = buildBankLine(opts.receiveAccount, month, day);
    msg = msg.replace(
      "貨到付款煩請給司機收！",
      `貨到付款煩請給司機收！\n如需匯款請於【${month}/${day}】前匯至以下帳戶\n\n${bankLine}\n\n完成匯款後，請告知匯款日期及帳號後五碼喔！`,
    );
  }

  // 傢俱金額為 0 移除鑑賞期提示
  if (furnitureAmount === 0) {
    msg = msg.replace(/\n⚠️傢俱類到貨7日內為鑑賞期[\s\S]*?退貨運費！/, "");
  }

  return msg;
}

function buildBankLine(account: "jinshuei" | "potato", month: number, day: number): string {
  void month; void day;
  if (account === "potato") {
    return "銀行戶名：馬鈴薯沙發企業社\n代號：807 永豐商業銀行\n分行代碼：0302 學府分行\n帳號：03001800081061";
  }
  return "銀行戶名：陳金水\n代號：807 永豐商業銀行\n分行代碼：1664 海山分行\n帳號：16600400697189";
}

function buildDriverConfirmMsg(
  card: TrelloCard,
  customFields: CustomFieldItem[],
  opts: ShippingMsgOptions,
  _dateStr: string,
  timeRange: string,
): string {
  const greeting = opts.driverGreeting; // e.g. "阿信哥～", used as first line
  const date = new Date(card.due!);
  const dateMMDD = `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;

  const descLines = card.desc.split("\n").map((l) => l.trim()).filter(Boolean);
  const address = descLines[0] ?? "";
  const communityName = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.COMMUNITY_NAME);
  let finalAddress = communityName ? `${address}〔${communityName}〕` : address;

  const hasAssembly = card.labels.some((l) => l.name?.includes("組裝"));
  const hasNoElevator = card.labels.some((l) => l.name?.includes("無電梯"));
  const hasStairs = card.labels.some((l) => l.name?.includes("室內梯"));
  if (hasAssembly) finalAddress += "【扶手現場組裝】";
  if (hasNoElevator) finalAddress += "【無電梯】";
  if (hasStairs) finalAddress += "【室內梯】";

  const orderNumber = card.name.match(/P\d{4,6}/)?.[0] ?? "";
  const styleLabel = card.labels.find((l) => l.name.startsWith("成交/"));
  const styleCode = styleLabel?.name.replace("成交/", "") ?? "";
  const product = PRODUCTS.find((p) => p.displayName === styleCode);
  const styleLine = `#${orderNumber}  ${styleCode} ${product?.moduleName ?? ""}`;

  const primaryName = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.PRIMARY_CONTACT_NAME) || card.name.replace(orderNumber, "").trim();
  const primaryPhoneRaw = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.PRIMARY_CONTACT_PHONE) || descLines[1] || "";
  const primaryPhone = normalizePhone(primaryPhoneRaw) ?? primaryPhoneRaw;

  const secondaryPhoneRaw = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.SECONDARY_CONTACT_PHONE);
  const secondaryName = getCustomFieldText(customFields, TRELLO.CUSTOM_FIELDS.SECONDARY_CONTACT_NAME);
  let secondaryLine = "";
  if (secondaryPhoneRaw && secondaryName) {
    const p = normalizePhone(secondaryPhoneRaw);
    if (p) secondaryLine = `${p} ${secondaryName}`;
  }

  const descLine2 = descLines[1] ?? "";

  // 簡師傅用 tab 格式 + ＊管傢俱出貨
  if (opts.driverKey === "jian") {
    const lines = [...(greeting ? [greeting, ""] : []), `${dateMMDD}\t${timeRange}`, "", styleLine, finalAddress, `${primaryPhone} ${primaryName}`];
    if (secondaryLine) lines.push(secondaryLine);
    if (descLine2) lines.push(descLine2);
    lines.push("", "＊管傢俱出貨");
    return lines.join("\n");
  }

  const lines = [...(greeting ? [greeting] : []), `${dateMMDD}  ${timeRange}`, "", styleLine, finalAddress, `${primaryPhone} ${primaryName}`];
  if (secondaryLine) lines.push(secondaryLine);
  if (descLine2) lines.push(descLine2);
  return lines.join("\n");
}

function buildBackShippingMsg(
  date: Date,
  month: number,
  day: number,
  timeRange: string,
  opts: ShippingMsgOptions,
): string {
  let msg = `【馬鈴薯沙發 載貨通知】

您好，已為您安排好配送車趟資訊如下

日期：${date.getFullYear()}年${month}月${day}日
時間：${timeRange}
(確切時間依司機當日出車狀況而定！)

司機：${opts.driverTitle}
電話：${opts.driverPhone}

⚠️如需更動煩請儘速通知我們協助調度
⚠️受限於交通狀況，易產生延遲狀況，恕無法保證到貨時段，煩請依照物流司機大哥實際聯絡情況！

【溫馨提示】
您安排的配送時間接近下班時段，車流量較大抵達時間容易有誤差，如有任何配送問題可直接與司機大哥聯繫。`;

  if (date.getHours() < 17) {
    msg = msg.replace(/\n\n【溫馨提示】\n[\s\S]*?聯繫。/, "");
  }
  return msg;
}

function buildCleaningMsg(date: Date, month: number, day: number, timeStr: string): string {
  return `【馬鈴薯沙發 到府清潔通知】

您好，已為您安排好資訊如下

日期：${date.getFullYear()}年${month}月${day}日
時間：${timeStr}

沙發醫護師：Barry 佳莉
電話：0913-605-107

⚠️如需更動煩請儘速通知我們協助調度
⚠️受限於交通狀況，易產生延遲狀況，當日可直接與醫護師聯繫喔！`;
}
