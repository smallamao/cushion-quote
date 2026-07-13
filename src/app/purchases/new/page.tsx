import { PurchaseEditorClient } from "@/app/purchases/PurchaseEditorClient";

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ fromOrder?: string }>;
}) {
  const { fromOrder } = await searchParams;
  return <PurchaseEditorClient fromOrderId={fromOrder} />;
}
