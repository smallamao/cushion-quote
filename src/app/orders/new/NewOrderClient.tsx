"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientCombobox } from "@/components/quote-editor/ClientCombobox";
import { useClients } from "@/hooks/useClients";
import type { OrderItemCategory } from "@/lib/types";

type Mode = "quote" | "direct";

const ORDER_ITEM_CATEGORIES: OrderItemCategory[] = [
  "坐/背墊",
  "臥榻墊",
  "縫布裱板",
  "到府清潔",
  "到府施工",
  "訂製沙發",
  "泡棉內裏",
  "皮/布套",
  "維修",
  "大和樂活",
];

export function NewOrderClient() {
  const router = useRouter();
  const { clients, loading: clientsLoading } = useClients();
  const [mode, setMode] = useState<Mode>("quote");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Mode A fields
  const [versionId, setVersionId] = useState("");

  // Mode B fields
  const [clientId, setClientId] = useState(""); // "" = 未選；"__new__" = 散客手動輸入
  const [clientName, setClientName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [itemCategory, setItemCategory] = useState<OrderItemCategory | "">("");

  // 選了客戶檔 → 帶入正式名稱並關聯；選「新客戶／不關聯」→ 只解除關聯，
  // 保留使用者已打的散客名稱（不清空）
  function handlePickClient(id: string) {
    if (id === "__new__" || id === "") {
      setClientId("");
      return;
    }
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c) {
      setClientName(c.companyName);
      setError("");
    }
  }

  async function handleCreate(
    payload:
      | { sourceType: "quote"; versionId: string }
      | { sourceType: "direct"; clientName: string; orderNumber: string; itemCategory?: string; clientId?: string }
  ) {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/sheets/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        ok: boolean;
        orderId?: string;
        error?: string;
      };
      if (!json.ok) throw new Error(json.error ?? "建立失敗");
      router.push(`/orders/${json.orderId}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setCreating(false);
    }
  }

  function handleSubmitQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!versionId.trim()) {
      setError("請輸入版本 ID");
      return;
    }
    void handleCreate({ sourceType: "quote", versionId: versionId.trim() });
  }

  function handleSubmitDirect(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) {
      setError("請輸入客戶名稱");
      return;
    }
    if (!orderNumber.trim()) {
      setError("請輸入工單編號");
      return;
    }
    void handleCreate({
      sourceType: "direct",
      clientName: clientName.trim(),
      orderNumber: orderNumber.trim(),
      ...(itemCategory ? { itemCategory } : {}),
      ...(clientId ? { clientId } : {}),
    });
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/orders")}
          className="shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-semibold">新增訂製訂單</h1>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2 border rounded-lg p-1 bg-muted/30">
        <button
          type="button"
          onClick={() => {
            setMode("quote");
            setError("");
          }}
          className={`flex-1 py-2 px-4 rounded-md text-sm transition-colors ${
            mode === "quote"
              ? "bg-[var(--bg-muted,hsl(var(--muted)))] font-semibold shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          從報價建立
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("direct");
            setError("");
          }}
          className={`flex-1 py-2 px-4 rounded-md text-sm transition-colors ${
            mode === "direct"
              ? "bg-[var(--bg-muted,hsl(var(--muted)))] font-semibold shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          直接建立（直客／B2B）
        </button>
      </div>

      {/* Mode A: from quote */}
      {mode === "quote" && (
        <form onSubmit={handleSubmitQuote} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="versionId">版本 ID</Label>
            <Input
              id="versionId"
              placeholder="例：V-xxxxx"
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
              disabled={creating}
            />
            <p className="text-xs text-muted-foreground">
              可在「報價紀錄」頁面查詢版本 ID
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" disabled={creating} className="w-full">
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                建立中…
              </>
            ) : (
              "建立訂單"
            )}
          </Button>
        </form>
      )}

      {/* Mode B: direct create (直客／B2B, no quote) */}
      {mode === "direct" && (
        <form onSubmit={handleSubmitDirect} className="space-y-4">
          {/* 客戶名稱永遠可直接打字（散客不建檔）；要歸戶對帳的公司行號再從資料庫關聯 */}
          <div className="space-y-2">
            <Label htmlFor="clientName">
              客戶名稱 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="clientName"
              placeholder="例：P1648 王小姐（散客直接打名字即可）"
              value={clientName}
              onChange={(e) => {
                setClientName(e.target.value);
                if (error) setError("");
              }}
              disabled={creating}
            />
          </div>

          <div className="space-y-2">
            <Label>關聯客戶資料庫（選填）</Label>
            <ClientCombobox
              value={clientId}
              clients={clients}
              loading={clientsLoading}
              onChange={handlePickClient}
            />
            <p className="text-xs text-[var(--text-tertiary)]">
              公司行號（榭琳、米羅…）建議從資料庫選 —— 名稱會統一、請款單才能歸戶。
              <br />
              一次性散客<span className="font-medium">不必選</span>，直接在上面打名字即可，
              <span className="font-medium">不會建進客戶資料庫</span>。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="orderNumber">
              工單編號 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="orderNumber"
              placeholder="工單編號"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              disabled={creating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="itemCategory">品項分類</Label>
            <Select
              value={itemCategory}
              onValueChange={(v) => setItemCategory(v as OrderItemCategory)}
              disabled={creating}
            >
              <SelectTrigger id="itemCategory">
                <SelectValue placeholder="（選填）" />
              </SelectTrigger>
              <SelectContent>
                {ORDER_ITEM_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" disabled={creating} className="w-full">
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                建立中…
              </>
            ) : (
              "建立訂單"
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
