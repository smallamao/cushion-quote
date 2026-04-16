import { Suspense } from "react";
import { SettingsClient } from "@/app/settings/SettingsClient";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsClient />
    </Suspense>
  );
}
