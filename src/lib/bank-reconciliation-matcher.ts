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

  const closeMatches = candidates.filter((s) => Math.abs(s.amount - amount) <= AMOUNT_TOLERANCE);
  const close = closeMatches.sort((a, b) => Math.abs(a.amount - amount) - Math.abs(b.amount - amount))[0] ?? null;
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
