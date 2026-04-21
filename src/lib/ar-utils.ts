import type {
  ARPaymentMethod,
  ARRecord,
  ARScheduleRecord,
  ARScheduleStatus,
  ARStatus,
} from "@/lib/types";

export const AR_SHEET = "應收帳款";
export const AR_SCHEDULE_SHEET = "應收分期";

// Column ranges — use full column notation ("A:V") + skip header row in code
// to avoid "Unable to parse range" errors on newly-created empty sheets.
export const AR_RANGE_FULL = `${AR_SHEET}!A:V`;
export const AR_RANGE_DATA = `${AR_SHEET}!A2:V1000`;
export const AR_RANGE_IDS = `${AR_SHEET}!A2:A1000`;
export const AR_ROW_RANGE = (sheetRow: number) =>
  `${AR_SHEET}!A${sheetRow}:V${sheetRow}`;

export const AR_SCHEDULE_RANGE_FULL = `${AR_SCHEDULE_SHEET}!A:O`;
export const AR_SCHEDULE_RANGE_DATA = `${AR_SCHEDULE_SHEET}!A2:O10000`;
export const AR_SCHEDULE_ROW_RANGE = (sheetRow: number) =>
  `${AR_SCHEDULE_SHEET}!A${sheetRow}:O${sheetRow}`;

// ===== Helpers =====

function toNumber(value: string | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toBoolean(value: string | undefined): boolean {
  return value === "TRUE" || value === "true" || value === "1";
}

export function isoDateNow(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoNow(): string {
  return new Date().toISOString();
}

// ===== Row converters =====

export function arRowToRecord(row: string[]): ARRecord {
  return {
    arId: row[0] ?? "",
    issueDate: row[1] ?? "",
    caseId: row[2] ?? "",
    caseNameSnapshot: row[3] ?? "",
    quoteId: row[4] ?? "",
    versionId: row[5] ?? "",
    clientId: row[6] ?? "",
    clientNameSnapshot: row[7] ?? "",
    contactNameSnapshot: row[8] ?? "",
    clientPhoneSnapshot: row[9] ?? "",
    projectNameSnapshot: row[10] ?? "",
    totalAmount: toNumber(row[11]),
    receivedAmount: toNumber(row[12]),
    outstandingAmount: toNumber(row[13]),
    scheduleCount: toNumber(row[14]),
    arStatus: (row[15] as ARStatus) || "active",
    hasOverdue: toBoolean(row[16]),
    lastReceivedAt: row[17] ?? "",
    notes: row[18] ?? "",
    createdAt: row[19] ?? "",
    updatedAt: row[20] ?? "",
    createdBy: row[21] ?? "",
  };
}

export function arRecordToRow(r: ARRecord): string[] {
  return [
    r.arId,
    r.issueDate,
    r.caseId,
    r.caseNameSnapshot,
    r.quoteId,
    r.versionId,
    r.clientId,
    r.clientNameSnapshot,
    r.contactNameSnapshot,
    r.clientPhoneSnapshot,
    r.projectNameSnapshot,
    String(r.totalAmount),
    String(r.receivedAmount),
    String(r.outstandingAmount),
    String(r.scheduleCount),
    r.arStatus,
    r.hasOverdue ? "TRUE" : "FALSE",
    r.lastReceivedAt,
    r.notes,
    r.createdAt,
    r.updatedAt,
    r.createdBy,
  ];
}

export function arScheduleRowToRecord(row: string[]): ARScheduleRecord {
  return {
    scheduleId: row[0] ?? "",
    arId: row[1] ?? "",
    seq: toNumber(row[2]),
    label: row[3] ?? "",
    ratio: toNumber(row[4]),
    amount: toNumber(row[5]),
    dueDate: row[6] ?? "",
    receivedAmount: toNumber(row[7]),
    receivedDate: row[8] ?? "",
    paymentMethod: (row[9] as ARPaymentMethod) || "",
    scheduleStatus: (row[10] as ARScheduleStatus) || "pending",
    adjustmentAmount: toNumber(row[11]),
    notes: row[12] ?? "",
    createdAt: row[13] ?? "",
    updatedAt: row[14] ?? "",
  };
}

export function arScheduleRecordToRow(r: ARScheduleRecord): string[] {
  return [
    r.scheduleId,
    r.arId,
    String(r.seq),
    r.label,
    String(r.ratio),
    String(r.amount),
    r.dueDate,
    String(r.receivedAmount),
    r.receivedDate,
    r.paymentMethod,
    r.scheduleStatus,
    String(r.adjustmentAmount),
    r.notes,
    r.createdAt,
    r.updatedAt,
  ];
}

// ===== Status calculators =====

/**
 * Calculate the derived status of a schedule based on its current state + today.
 * Does not mutate — returns a new status string.
 */
export function calcScheduleDerivedStatus(
  schedule: ARScheduleRecord,
  today: string = isoDateNow(),
): ARScheduleStatus {
  if (schedule.scheduleStatus === "waived") return "waived";

  const target = schedule.amount + schedule.adjustmentAmount;
  if (schedule.receivedAmount >= target && target > 0) return "paid";
  if (schedule.receivedAmount > 0) return "partial";
  if (schedule.dueDate && schedule.dueDate < today) return "overdue";
  return "pending";
}

/**
 * Roll up AR status from its schedules.
 */
export function calcARStatusFromSchedules(
  schedules: ARScheduleRecord[],
  today: string = isoDateNow(),
): { arStatus: ARStatus; hasOverdue: boolean } {
  if (schedules.length === 0) {
    return { arStatus: "draft", hasOverdue: false };
  }

  const derived = schedules.map((s) => calcScheduleDerivedStatus(s, today));
  const hasOverdue = derived.some((s) => s === "overdue");
  const allPaidOrWaived = derived.every((s) => s === "paid" || s === "waived");
  const anyReceived = schedules.some((s) => s.receivedAmount > 0);

  if (allPaidOrWaived) return { arStatus: "paid", hasOverdue: false };
  if (hasOverdue) return { arStatus: "overdue", hasOverdue: true };
  if (anyReceived) return { arStatus: "partial", hasOverdue: false };
  return { arStatus: "active", hasOverdue: false };
}

// ===== ID generators =====

export async function generateArId(
  existingIds: string[],
  now: Date = new Date(),
): Promise<string> {
  const month = now.toISOString().slice(0, 7).replace("-", "");
  const prefix = `AR-${month}-`;
  const maxSeq = existingIds
    .filter((id) => id.startsWith(prefix))
    .reduce((max, id) => {
      const seq = Number(id.slice(prefix.length));
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

export function generateArScheduleId(arId: string, seq: number): string {
  return `${arId}-S${String(seq).padStart(2, "0")}`;
}

// ===== Preset schedule templates =====

export interface SchedulePreset {
  key: string;
  label: string;
  schedules: Array<{ label: string; ratio: number }>;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  {
    key: "full",
    label: "一次付清",
    schedules: [{ label: "全額", ratio: 100 }],
  },
  {
    key: "deposit-final",
    label: "訂金 + 尾款（50/50）",
    schedules: [
      { label: "訂金", ratio: 50 },
      { label: "尾款", ratio: 50 },
    ],
  },
  {
    key: "3-stage",
    label: "3 期（訂 30 / 期中 40 / 尾 30）",
    schedules: [
      { label: "訂金", ratio: 30 },
      { label: "期中款", ratio: 40 },
      { label: "尾款", ratio: 30 },
    ],
  },
  {
    key: "custom",
    label: "自訂",
    schedules: [],
  },
];

export function buildSchedulesFromPreset(
  presetKey: string,
  totalAmount: number,
  startDate: string = isoDateNow(),
): Array<{ label: string; ratio: number; amount: number; dueDate: string }> {
  const preset = SCHEDULE_PRESETS.find((p) => p.key === presetKey);
  if (!preset || preset.schedules.length === 0) return [];

  const total = Math.round(totalAmount);
  const result: Array<{
    label: string;
    ratio: number;
    amount: number;
    dueDate: string;
  }> = [];

  let allocated = 0;
  preset.schedules.forEach((s, idx) => {
    const isLast = idx === preset.schedules.length - 1;
    const amount = isLast
      ? total - allocated
      : Math.round((total * s.ratio) / 100);
    allocated += amount;

    // Default due dates: first期 = today; 後續每期 +30 天
    const due = addDays(startDate, idx * 30);

    result.push({
      label: s.label,
      ratio: s.ratio,
      amount,
      dueDate: due,
    });
  });
  return result;
}

function addDays(dateText: string, days: number): string {
  if (!dateText) return isoDateNow();
  const base = new Date(dateText);
  if (Number.isNaN(base.getTime())) return dateText;
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

// ===== Status labels (for UI) =====

export const AR_STATUS_LABEL: Record<ARStatus, string> = {
  draft: "草稿",
  active: "待收款",
  partial: "部分收款",
  paid: "已收清",
  overdue: "逾期",
  cancelled: "已取消",
};

export const AR_STATUS_COLOR: Record<ARStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export const AR_SCHEDULE_STATUS_LABEL: Record<ARScheduleStatus, string> = {
  pending: "待收",
  partial: "部分",
  paid: "已收",
  overdue: "逾期",
  waived: "豁免",
};

export const AR_SCHEDULE_STATUS_COLOR: Record<ARScheduleStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  waived: "bg-gray-100 text-gray-500",
};

export const AR_PAYMENT_METHOD_LABEL: Record<
  Exclude<ARPaymentMethod, "">,
  string
> = {
  cash: "現金",
  transfer: "匯款",
  check: "支票",
  credit_card: "刷卡",
  other: "其他",
};

/**
 * Default credit card fee rate (percentage).
 * Fee is deducted by bank from the amount the customer actually charges.
 * Net received = customer paid × (1 - feeRate/100).
 */
export const DEFAULT_CARD_FEE_RATE = 3;

/**
 * Given a target net received amount and a fee rate,
 * compute the gross amount the customer needs to charge
 * so that the merchant receives the exact target.
 *
 * Example: target=34650, feeRate=3 → gross=34650/0.97=35721
 */
export function grossFromNet(netTarget: number, feeRatePct: number): number {
  const rate = feeRatePct / 100;
  if (rate >= 1 || rate < 0) return netTarget;
  return Math.round(netTarget / (1 - rate));
}

/**
 * Given a gross amount charged and fee rate, return the merchant's net receipt.
 */
export function netFromGross(grossAmount: number, feeRatePct: number): number {
  const fee = Math.round((grossAmount * feeRatePct) / 100);
  return grossAmount - fee;
}
