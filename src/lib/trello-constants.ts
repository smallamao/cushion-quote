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
}

export const DRIVER_LIST: DriverInfo[] = [
  { key: "shin", title: "阿信 (兩人）[BXH-6828]", confirmTitle: "阿信哥～",  phoneNumber: "0958640520", labelId: TRELLO.LABELS.DRIVER_SHIN },
  { key: "lou",  title: "羅先生 [0725-ED]",        confirmTitle: "阿伯～",    phoneNumber: "0933208509", labelId: TRELLO.LABELS.DRIVER_LOU },
  { key: "fan",  title: "范先生 [BFR-7003]",        confirmTitle: "范大哥～",  phoneNumber: "0925616827", labelId: TRELLO.LABELS.DRIVER_FAN },
  { key: "ya",   title: "葉先生 (回頭車)",          confirmTitle: "葉先生",    phoneNumber: "0933468058 / 0928338272", labelId: TRELLO.LABELS.DRIVER_YA },
  { key: "fu",   title: "阿富",                    confirmTitle: "阿富～",    phoneNumber: "0953123527", labelId: TRELLO.LABELS.DRIVER_FU },
  { key: "hang", title: "志航",                    confirmTitle: "",          phoneNumber: "0922898816", labelId: TRELLO.LABELS.DRIVER_HANG },
  { key: "jian", title: "簡先生",                  confirmTitle: "簡大哥～",  phoneNumber: "0910347260", labelId: TRELLO.LABELS.DRIVER_JIAN },
];
