import { AssistantPanel } from "@/components/assistant/AssistantPanel";

export const metadata = { title: "AI 助手" };

export default function AssistantPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">AI 助手</h1>
        <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
          用自然語言查訂單、改狀態（改狀態一律先確認才執行）。
        </p>
      </div>
      <AssistantPanel />
    </div>
  );
}
