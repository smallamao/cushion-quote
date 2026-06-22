import type { Metadata } from "next";
import { TemplatesClient } from "./TemplatesClient";

export const metadata: Metadata = {
  title: "快速回覆工具箱 | 馬鈴薯沙發營運系統",
  description: "預存罐頭訊息與告知事項，一鍵複製貼到對話",
};

export default function TemplatesPage() {
  return (
    <div>
      <TemplatesClient />
    </div>
  );
}
