// S Order 訂單看板的 custom field IDs（與生產看板不同）
export const S_ORDER_CUSTOM_FIELDS = {
  COLOR: "62ab30299746eb48429aa113",
  SCHEDULE_TEXT: "62ab308d2417f80fc2874b8d",
  SCHEDULE_DAY: "62ab308d2417f80fc2874b8b",
  CHAIR_LEG: "62ab308d2417f80fc2874b91",
  SEAT_MATERIALS: "63ed9f0e845b6702dd880519",
} as const;

export const TRELLO = {
  BOARD_ID: "5ccbe7e6128a5079a20f8b39",
  LISTS: {
    // 客人填完 Google 表單後自動建卡的落點；線上下訂確認單從這裡取卡。
    // 此時卡名多半只有客戶姓名（訂單編號是之後人工改名才補上）。
    REQUEST: "5cf6a0115e65d9317a0ee5e8",
    ORDER: "5cefef9f9c7cca170f5b823b",
    PRODUCTION: "5ceff0069ddcad59eb4b3eba",
    WAIT_SHIPPING: "5db80ff546d13017935c55a9",
    SHIPPED: "5f70224034d940207767d3a5",
    WAIT_REVIEW: "5cefefb35c4b448c9a7af5d3",
    COMPLETED: "5cefefdeb0649542b6330fc9",
    FAILED: "5ebb60c57e2ae14ba2ba0f61",
  },
  CUSTOM_FIELDS: {
    COLOR: "5dc009d5351ac03fd2bfa007",
    SCHEDULE_TEXT: "5fc362589d1bde25df28d934",
    SCHEDULE_DAY: "5dbffb41d3233f81ca015792",
    COMMUNITY_NAME: "60de85e6d4389c54299831bb",
    SOFA_AMOUNT: "5d68a10ca487a032ea013c7f",
    FURNITURE_AMOUNT: "5d68a112581dc1340a260357",
    BEDDING_AMOUNT: "5d68a11ab1d2721a2710e1db",
    ACCESSORIES: "61c2d6b5b453cc517914c966",
    CHAIR_LEG: "61c2d6a24f0dff7edb96fb54",
    SEAT_MATERIALS: "63eb49397127c06fce6c0b32",
    PRIMARY_CONTACT_NAME: "68dbc601cb33326044f58b0c",
    PRIMARY_CONTACT_PHONE: "68dbc64de823fab14eff02ab",
    SECONDARY_CONTACT_NAME: "68dbc658fe59d273e97395a4",
    SECONDARY_CONTACT_PHONE: "68dbc662112596182820b8e4",
    ORDER_DATE: "5d689e8486886f8be436316b",
  },
  LABELS: {
    BRAIDER_SHEN: "5ebcf42074a8d183074528e4",
    BRAIDER_YANG: "5ccbe7e691d0c2ddc526306e",
    DRIVER_SHIN: "5ccbe7e691d0c2ddc5263071",
    DRIVER_LOU: "5d00c0ff02fe2d684d407c92",
    DRIVER_FAN: "665aa288ac8d8c26ae04424a",
    DRIVER_YA: "5d959bab4e385d7900fe6ac2",
    DRIVER_FU: "5f6aa9adc159722ed25e4708",
    DRIVER_HANG: "5f7a80fb0496ea8a2d92b045",
    DRIVER_JIAN: "5fac0898ecc96e14517bbf8e",
    URGENT: "5d7b800053301c65f08da2ae",
    ASSEMBLY: "62d1964f9d7ddb7313669628",
    PURCHASE_NOTICE: "63390915f6d72a0016481f3b",
  },
} as const;

/**
 * 客人在線上下訂確認頁簽完名之後掛上的標籤。
 * 看板上原本沒有這個標籤，第一次用會由 ensureBoardLabel 自動建立，
 * 所以這裡記的是名稱與顏色、不是 ID。顏色挑 lime：看板上 green 全被
 * 「成交/XXX」佔滿，再用 green 會混在一起看不出來。
 *
 * 🔴 刻意「只加標籤、不移動卡片」：卡片要等**訂單解析**完成才會進
 *    「Order 訂單」清單（老闆 2026-10-05 確認）。若自動移卡，看板上會
 *    看起來已經處理完，實際上解析還沒做。要改成移卡前請先問過。
 */
export const ORDER_CONFIRMED_LABEL = { name: "已線上確認", color: "lime" } as const;

export const LIST_NAMES: Record<string, string> = {
  [TRELLO.LISTS.ORDER]: "接單",
  [TRELLO.LISTS.PRODUCTION]: "生產中",
  [TRELLO.LISTS.WAIT_SHIPPING]: "待出貨",
  [TRELLO.LISTS.SHIPPED]: "已出貨",
  [TRELLO.LISTS.WAIT_REVIEW]: "待驗收",
  [TRELLO.LISTS.COMPLETED]: "完成",
  [TRELLO.LISTS.FAILED]: "取消",
};

export interface TrelloProduct {
  displayName: string;
  moduleName: string;
  width: number;
  seatWidth: number;
  footSeatSize: string;
  armrestWidth: number;
  defaultFoot: string;
  defaultSeat: number;
  colorInfo?: string;
}

export const PRODUCTS: TrelloProduct[] = [
  { displayName: "ELEC",  moduleName: "高壓電",        width: 262, seatWidth: 76, armrestWidth: 17, footSeatSize: "79x80", defaultFoot: "黑鐵腳",     defaultSeat: 3 },
  { displayName: "POINT", moduleName: "轉捩點",        width: 275, seatWidth: 73, armrestWidth: 28, footSeatSize: "74x96", defaultFoot: "方木腳H8/H6", defaultSeat: 3 },
  { displayName: "ATR",   moduleName: "吸引力",        width: 287, seatWidth: 79, armrestWidth: 25, footSeatSize: "80x96", defaultFoot: "L鐵腳",      defaultSeat: 3 },
  { displayName: "BOOM",  moduleName: "爆發力",        width: 293, seatWidth: 79, armrestWidth: 28, footSeatSize: "80x96", defaultFoot: "L鐵腳",      defaultSeat: 3 },
  { displayName: "BOOMs", moduleName: "爆發力(縮扶手)", width: 277, seatWidth: 79, armrestWidth: 20, footSeatSize: "80x96", defaultFoot: "L鐵腳",      defaultSeat: 3 },
  { displayName: "FLA",   moduleName: "引爆點",        width: 304, seatWidth: 82, armrestWidth: 29, footSeatSize: "82x94", defaultFoot: "U鋁腳",      defaultSeat: 3 },
  { displayName: "BJ",    moduleName: "伯爵",          width: 264, seatWidth: 52, armrestWidth: 28, footSeatSize: "76x80", defaultFoot: "黑鐵腳",     defaultSeat: 4 },
  { displayName: "AMI",   moduleName: "愛馬仕",        width: 272, seatWidth: 80, armrestWidth: 16, footSeatSize: "92x83", defaultFoot: "方木腳H12",  defaultSeat: 3 },
  { displayName: "AMY",   moduleName: "艾米",          width: 270, seatWidth: 80, armrestWidth: 15, footSeatSize: "",      defaultFoot: "圓木腳H12",  defaultSeat: 3 },
  { displayName: "EDSON", moduleName: "安德森",        width: 260, seatWidth: 58, armrestWidth: 14, footSeatSize: "82x94", defaultFoot: "U鋁腳",      defaultSeat: 4 },
  { displayName: "BLT",   moduleName: "安格斯",        width: 263, seatWidth: 75, armrestWidth: 19, footSeatSize: "78x86", defaultFoot: "黑鐵腳",     defaultSeat: 3 },
  { displayName: "MIKO",  moduleName: "米可",          width: 284, seatWidth: 78, armrestWidth: 25, footSeatSize: "78x82", defaultFoot: "圓木腳H12",  defaultSeat: 3 },
  { displayName: "JIMMY", moduleName: "吉米",          width: 277, seatWidth: 79, armrestWidth: 20, footSeatSize: "79x79", defaultFoot: "方木腳H12",  defaultSeat: 3 },
  { displayName: "LEO",   moduleName: "里歐",          width: 286, seatWidth: 76, armrestWidth: 29, footSeatSize: "76x82", defaultFoot: "方木腳H12",  defaultSeat: 3 },
  { displayName: "OBA",   moduleName: "歐巴",          width: 286, seatWidth: 76, armrestWidth: 29, footSeatSize: "76x82", defaultFoot: "方木腳H12",  defaultSeat: 3 },
  { displayName: "GALI",  moduleName: "咖哩",          width: 262, seatWidth: 76, armrestWidth: 17, footSeatSize: "80x86", defaultFoot: "黑鐵腳",     defaultSeat: 3 },
  { displayName: "ICE",   moduleName: "艾斯",          width: 280, seatWidth: 78, armrestWidth: 23, footSeatSize: "78x86", defaultFoot: "黑鐵腳",     defaultSeat: 3 },
  { displayName: "BSK",   moduleName: "巴斯克",        width: 280, seatWidth: 80, armrestWidth: 20, footSeatSize: "80x60", defaultFoot: "方木腳H12",  defaultSeat: 3 },
  { displayName: "LEMON", moduleName: "雷夢",          width: 275, seatWidth: 85, armrestWidth: 10, footSeatSize: "85x85", defaultFoot: "三角板",     defaultSeat: 3 },
  { displayName: "MULE",  moduleName: "沐樂",          width: 262, seatWidth: 76, armrestWidth: 17, footSeatSize: "76x82", defaultFoot: "鋅合金",     defaultSeat: 3 },
  { displayName: "HAILY", moduleName: "海力",          width: 279, seatWidth: 75, armrestWidth: 27, footSeatSize: "75x82", defaultFoot: "鏡鈢腳H15",  defaultSeat: 3 },
  { displayName: "HANA",  moduleName: "哈娜",          width: 280, seatWidth: 73, armrestWidth: 31, footSeatSize: "73x78", defaultFoot: "12",         defaultSeat: 3 },
];

export interface DriverInfo {
  key: string;
  title: string;
  confirmTitle: string;
  phoneNumber: string;
  labelId: string;
  /**
   * 這位司機只能跑的範圍；空＝沒有限制。
   * 排車時要先排除跑不了的人，否則會排出送不到的車次。
   */
  serviceArea?: string;
  /** 主力司機＝沒有指定其他人時的預設派工對象 */
  isPrimary?: boolean;
}

/**
 * 目前仍在配合的司機。
 *
 * 🔴 羅先生 [0725-ED]、范先生 [BFR-7003] 已於 2026-10-31 停止配合，自清單移除。
 *    但 TRELLO.LABELS 裡的 DRIVER_LOU / DRIVER_FAN **刻意保留**——
 *    歷史卡片上還掛著那兩個標籤，常數刪掉會讓舊單的司機欄顯示不出來。
 *    標籤是歷史事實，清單是現在能派的人，兩者不同。
 */
export const DRIVER_LIST: DriverInfo[] = [
  // 主力司機，派工的預設對象（老闆 2026-11-01）。沒有範圍限制，
  // 其餘三位都是特定情況才派：葉先生等南部回頭車、阿富跑東部、簡先生支援北台灣（台北、新北、桃園、新竹）。
  { key: "shin", title: "阿信 (兩人）[BXH-6828]", confirmTitle: "阿信哥～", phoneNumber: "0958640520", labelId: TRELLO.LABELS.DRIVER_SHIN, isPrimary: true },
  // 回頭車：只在跑南部（高雄）時順路載，不能派台北都會區的單（老闆 2026-10-31）
  { key: "ya",   title: "葉先生 (回頭車・南部高雄)", confirmTitle: "葉先生", phoneNumber: "0933468058 / 0928338272", labelId: TRELLO.LABELS.DRIVER_YA, serviceArea: "南部（高雄）回頭車" },
  // 專跑東部：花蓮、台東的單都派他（老闆 2026-11-01）
  { key: "fu",   title: "阿富 (花蓮台東)",         confirmTitle: "阿富～",   phoneNumber: "0953123527", labelId: TRELLO.LABELS.DRIVER_FU, serviceArea: "東部（花蓮、台東）" },
  // 支援北台灣四縣市：台北、新北、桃園、新竹（老闆 2026-11-01）。
  // 阿信排不下時由他接手；北部每一個縣市都有兩人可跑，沒有單點依賴。
  { key: "jian", title: "簡先生 (北台灣支援)", confirmTitle: "簡大哥～", phoneNumber: "0910347260", labelId: TRELLO.LABELS.DRIVER_JIAN, serviceArea: "台北、新北、桃園、新竹（支援）" },
];

/**
 * 已停止配合、但歷史卡片上還掛著標籤的司機。
 *
 * 🔴 現役司機的事實來源是**司機設定表**（`drivers-sheet.ts`，Sheets 裡有
 *    labelId 欄位，老闆可以從設定頁新增）。這裡**只放** DRIVER_LIST 與設定表
 *    都不會再有的歷史標籤——否則就會變成第三份真相，新增的司機永遠被算成
 *    「未指派」。這正是同一批改動裡批評過的「門檻有三份」的錯。
 *
 *    羅先生 [0725-ED]、范先生 [BFR-7003] 於 2026-10-31 停止配合。
 *    志航已不在 DRIVER_LIST，但舊卡上有標籤。
 */
const RETIRED_DRIVER_LABELS: Record<string, string> = {
  [TRELLO.LABELS.DRIVER_LOU]: "羅先生",
  [TRELLO.LABELS.DRIVER_FAN]: "范先生",
  [TRELLO.LABELS.DRIVER_HANG]: "志航",
};

/**
 * 從卡片的 idLabels 認出司機。沒有司機標籤時回空字串——
 * **不要**猜成主力司機：猜錯會把別人的趟數算到阿信頭上，比留白更糟
 * （同 delivery-region.ts「抓不到就回 null，不猜」的理由）。
 *
 * `roster` 傳現役司機（呼叫端從 `listDrivers()` 讀，或退回 DRIVER_LIST）。
 * 不傳就只認得 DRIVER_LIST ＋ 歷史標籤，設定頁新增的司機會認不出來。
 *
 * 一張卡理論上只該有一個司機標籤（shipping-notice 指派前會先清掉全部），
 * 真的有多個時取第一個認得的，並在呼叫端當「已指派」處理。
 */
export function driverNameFromLabelIds(
  idLabels: readonly string[] | undefined,
  roster: readonly { labelId: string; title: string }[] = DRIVER_LIST,
): string {
  const byLabel = new Map<string, string>(Object.entries(RETIRED_DRIVER_LABELS));
  for (const d of roster) {
    if (!d.labelId) continue;
    // 顯示用短名：標題裡的括號與車號對排車沒用，只會把徽章擠爆
    byLabel.set(d.labelId, d.title.replace(/\s*[（(\[].*$/, "").trim() || d.title);
  }
  for (const id of idLabels ?? []) {
    const name = byLabel.get(id);
    if (name) return name;
  }
  return "";
}
