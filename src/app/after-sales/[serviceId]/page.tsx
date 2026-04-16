import { AfterSalesEditorClient } from "@/app/after-sales/AfterSalesEditorClient";

export default async function AfterSalesDetailPage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  return <AfterSalesEditorClient mode="edit" serviceId={serviceId} />;
}
