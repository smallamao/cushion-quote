import { ReceivablesClient, type ReceivablesTab } from "./ReceivablesClient";

// ?tab=bank 直接開「銀行對帳」（舊 /bank-reconciliation 導到這裡）
const TABS: readonly ReceivablesTab[] = ["active", "pending-monthly", "bank"];

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = TABS.find((t) => t === tab) ?? "active";
  return <ReceivablesClient initialTab={initialTab} />;
}
