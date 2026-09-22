import { CleaningClient } from "@/app/cleaning/[token]/CleaningClient";

export default async function CleaningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CleaningClient token={token} />;
}
