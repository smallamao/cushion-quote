import type { Metadata } from "next";

import { MaterialConfirmClient } from "./MaterialConfirmClient";

export const metadata: Metadata = {
  title: "叫料確認看板 · 馬鈴薯沙發",
};

export default function MaterialConfirmBoardPage() {
  return (
    <div className="px-4 py-6 sm:px-6">
      <MaterialConfirmClient />
    </div>
  );
}
