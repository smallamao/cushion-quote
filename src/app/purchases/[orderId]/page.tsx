import { PurchaseEditorClient } from "@/app/purchases/PurchaseEditorClient";

type PageProps = {
  params: Promise<{ orderId: string }>;
};

export default async function PurchaseDetailPage({ params }: PageProps) {
  const { orderId } = await params;
  return <PurchaseEditorClient orderId={orderId} />;
}
