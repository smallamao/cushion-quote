import type { Route } from "next";
import { redirect } from "next/navigation";

// 舊版派工連結路徑（/dispatch/…）。2026-09-29 改用更短的 /w/… 後，
// 這支只做轉址，讓改版前已發給師傅的連結繼續可用（簽章驗證同時接受新舊長度）。
export const dynamic = "force-dynamic";

export default async function LegacyDispatchRedirect({
  params,
}: {
  params: Promise<{ serviceId: string; sig: string }>;
}) {
  const { serviceId, sig } = await params;
  // typedRoutes 對動態組出的路徑無法靜態推導，這裡明確轉型
  redirect(`/w/${encodeURIComponent(serviceId)}/${encodeURIComponent(sig)}` as Route);
}
