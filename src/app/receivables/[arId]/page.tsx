import { ReceivableDetailClient } from "./ReceivableDetailClient";

interface PageProps {
  params: Promise<{ arId: string }>;
}

export default async function ReceivableDetailPage({ params }: PageProps) {
  const { arId } = await params;
  return <ReceivableDetailClient arId={arId} />;
}
