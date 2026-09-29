import type { Metadata } from "next";

import { findServiceById } from "@/lib/after-sales-sheet";
import { verifyDispatchToken } from "@/lib/dispatch-link";
import type { AfterSalesStatus } from "@/lib/types";

// node:crypto（驗簽）＋ server-only（讀 Sheets）→ 需 Node runtime；每次即時讀取。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 帶客戶電話/地址的對外頁，禁止被搜尋引擎或連結預覽索引。
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<AfterSalesStatus, string> = {
  pending: "待確認",
  scheduled: "已排程",
  in_progress: "進行中",
  completed: "已完成",
  cancelled: "已取消",
};

const WD = ["日", "一", "二", "三", "四", "五", "六"];
function fmtDate(d: string): string {
  if (!d) return "";
  const t = new Date(`${d}T00:00:00`);
  return Number.isNaN(t.getTime()) ? d : `${d}（${WD[t.getDay()]}）`;
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: "16px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif',
      }}
    >
      <div style={{ maxWidth: 460, margin: "0 auto" }}>{children}</div>
    </main>
  );
}

function Notice({ title, desc }: { title: string; desc: string }) {
  return (
    <Page>
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "32px 24px",
          textAlign: "center",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          marginTop: 48,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>{title}</div>
        <div style={{ marginTop: 8, fontSize: 15, color: "#6b7280" }}>{desc}</div>
      </div>
    </Page>
  );
}

export default async function DispatchPage({
  params,
}: {
  params: Promise<{ serviceId: string; sig: string }>;
}) {
  const { serviceId, sig } = await params;

  // 先驗簽（純運算、不碰 Sheets）→ 亂猜或過期（逾 30 天）的簽章不會觸發任何讀取。
  if (!verifyDispatchToken(serviceId, sig)) {
    return <Notice title="連結已失效" desc="這條派工連結不正確或已超過 30 天，請向內勤重新索取。" />;
  }

  // Sheets 讀取可能失敗（額度/連線/憑證）。對外頁不可把錯誤堆疊丟給師傅，
  // 一律吞成通用訊息（真正錯誤記在伺服器 log）。
  let service;
  try {
    service = await findServiceById(serviceId);
  } catch (err) {
    console.error("dispatch page findServiceById failed", err);
    return <Notice title="暫時無法查詢" desc="系統忙線中，請稍後再試，或直接聯絡內勤。" />;
  }
  if (!service) {
    return <Notice title="查無此單" desc="找不到對應的派工單，請確認連結是否完整。" />;
  }
  // 已完成／已取消 → 停用連結（避免結案後電話地址仍被外流查看）。
  if (service.status === "completed" || service.status === "cancelled") {
    return <Notice title="此單已結案" desc="這張工單已完成或取消，派工連結已自動停用。" />;
  }

  const model = [service.modelNameSnapshot, service.itemDescription].filter(Boolean).join(" ");
  const mapUrl = service.deliveryAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(service.deliveryAddress)}`
    : "";
  const schedule = [fmtDate(service.scheduledDate), service.scheduledTime].filter(Boolean).join(" ");
  const statusLabel = STATUS_LABEL[service.status] ?? service.status;

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: "#9ca3af",
    marginBottom: 4,
    fontWeight: 600,
  };
  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  };
  // block（非 flex）：電話號碼過長時整段自然換行，不會像 flex item 被撐出容器。
  const bigAction: React.CSSProperties = {
    display: "block",
    padding: "16px 18px",
    borderRadius: 14,
    fontSize: 19,
    fontWeight: 700,
    lineHeight: 1.4,
    textDecoration: "none",
    marginTop: 10,
    overflowWrap: "anywhere",
  };

  return (
    <Page>
      {/* 標頭 */}
      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>到府派工單</div>
          <span
            style={{
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 700,
              color: "#1d4ed8",
              background: "#dbeafe",
              borderRadius: 999,
              padding: "3px 12px",
            }}
          >
            {statusLabel}
          </span>
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "#9ca3af", fontFamily: "monospace" }}>
          {service.serviceId}
        </div>
      </div>

      {/* 客戶 + 電話 + 地址（重點：可直撥、可導航） */}
      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <div style={labelStyle}>客戶</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>
          {service.clientName || "—"}
        </div>

        {service.clientPhone && (
          <a href={`tel:${service.clientPhone}`} style={{ ...bigAction, background: "#ecfdf5", color: "#047857" }}>
            📞 撥打　{service.clientPhone}
          </a>
        )}
        {service.clientPhone2 && (
          <a href={`tel:${service.clientPhone2}`} style={{ ...bigAction, background: "#ecfdf5", color: "#047857" }}>
            📞 撥打{service.clientContact2 ? `（${service.clientContact2}）` : "備用"}　{service.clientPhone2}
          </a>
        )}

        {service.deliveryAddress && (
          <>
            <div style={{ ...labelStyle, marginTop: 16 }}>地址</div>
            <div style={{ fontSize: 17, color: "#111827", lineHeight: 1.5 }}>
              {service.deliveryAddress}
            </div>
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...bigAction, background: "#eff6ff", color: "#1d4ed8" }}
              >
                📍 開啟導航
              </a>
            )}
          </>
        )}
      </div>

      {/* 工作內容 */}
      <div style={cardStyle}>
        {model && (
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>款式／品項</div>
            <div style={{ fontSize: 16, color: "#111827", lineHeight: 1.5 }}>{model}</div>
          </div>
        )}
        {service.itemLocation && (
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>位置</div>
            <div style={{ fontSize: 16, color: "#111827" }}>{service.itemLocation}</div>
          </div>
        )}
        {service.issueDescription && (
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>問題／需求</div>
            <div style={{ fontSize: 16, color: "#111827", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {service.issueDescription}
            </div>
          </div>
        )}
        {schedule && (
          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>預定時間</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>{schedule}</div>
          </div>
        )}
        {service.dispatchNotes && (
          <div>
            <div style={labelStyle}>派工備註</div>
            <div style={{ fontSize: 16, color: "#111827", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {service.dispatchNotes}
            </div>
          </div>
        )}
        {!model && !service.issueDescription && !schedule && !service.dispatchNotes && (
          <div style={{ fontSize: 14, color: "#9ca3af" }}>（此單尚未填寫工作內容）</div>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 16, marginBottom: 8, fontSize: 12, color: "#9ca3af" }}>
        馬鈴薯沙發 · 派工資訊
      </div>
    </Page>
  );
}
