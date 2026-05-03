import { formatCurrency } from "@/lib/utils";
import { REWARD_TIER_META } from "@/lib/referral-utils";
import type { ReferrerStats } from "@/lib/referral-utils";

interface Props {
  referrers: ReferrerStats[];
}

export function PendingRewards({ referrers }: Props) {
  const pending = referrers.filter((r) => r.rewardTier >= 1);

  if (pending.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
        目前沒有待發放的獎勵
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--text-secondary)]">
        共 {pending.length} 位引薦人待發獎勵（Phase 2 將加入手動標記已發放功能）
      </p>
      <div className="overflow-hidden rounded-md border border-[var(--border)]">
        {pending.map((r, idx) => {
          const meta = REWARD_TIER_META[r.rewardTier];
          return (
            <div
              key={r.companyId}
              className={`flex items-center gap-4 px-4 py-3 ${idx !== 0 ? "border-t border-[var(--border)]" : ""}`}
            >
              <span className="text-lg">{meta?.icon ?? ""}</span>
              <div className="flex-1">
                <div className="font-medium text-[var(--text-primary)]">{r.companyName}</div>
                <div className="text-xs text-[var(--text-secondary)]">
                  介紹 {r.clientCount} 位客戶
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {meta?.name ?? "—"}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {meta ? formatCurrency(meta.value) : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
