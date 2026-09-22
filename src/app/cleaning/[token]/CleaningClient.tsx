"use client";

import { useEffect, useState } from "react";

const PERIODS = ["上午", "下午", "晚上", "皆可"] as const;
type Period = (typeof PERIODS)[number];
type Slot = { date: string; period: Period };

interface CustomerView {
  clientName: string;
  item: string;
  address: string;
  phone: string;
}
interface TechView {
  clientName: string;
  address: string;
  phone: string;
  item: string;
  issue: string;
  proposedSlots: Slot[];
  confirmedDate: string;
  confirmedPeriod: string;
}
type Loaded =
  | { ok: true; role: "customer"; status: string; view: CustomerView }
  | { ok: true; role: "tech"; status: string; view: TechView };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-lg px-4 py-3 text-sm font-semibold text-gray-800">
          馬鈴薯沙發 · 到府清潔預約
        </div>
      </div>
      <div className="mx-auto max-w-lg px-4 py-6">{children}</div>
    </div>
  );
}

function Notice({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
      <p className="text-lg font-semibold text-gray-800">{title}</p>
      <p className="mt-2 text-sm text-gray-500">{desc}</p>
    </div>
  );
}

const fmtDate = (d: string) => {
  if (!d) return "";
  const wd = ["日", "一", "二", "三", "四", "五", "六"][new Date(d + "T00:00:00").getDay()];
  return `${d}（${wd}）`;
};

export function CleaningClient({ token }: { token: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [done, setDone] = useState<null | "customer" | "confirmed" | "rejected">(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  // customer form
  const [slots, setSlots] = useState<Slot[]>([
    { date: "", period: "皆可" },
    { date: "", period: "皆可" },
    { date: "", period: "皆可" },
  ]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/public/cleaning/${token}`);
        const json = (await res.json()) as Loaded & { ok: boolean };
        if (cancelled) return;
        if (!json.ok) {
          setLoadError(true);
          return;
        }
        setData(json);
        if (json.role === "customer") {
          setName(json.view.clientName);
          setAddress(json.view.address);
          setPhone(json.view.phone);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submitCustomer() {
    const chosen = slots.filter((s) => s.date);
    if (chosen.length === 0) {
      setErr("請至少選一個日期＋時段");
      return;
    }
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch(`/api/public/cleaning/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: chosen, name: name.trim(), address: address.trim(), phone: phone.trim() }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "送出失敗");
      setDone("customer");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "送出失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function techAct(payload: { chosenIndex: number } | { reject: true }) {
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch(`/api/public/cleaning/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; rejected?: boolean };
      if (!json.ok) throw new Error(json.error ?? "操作失敗");
      setDone(json.rejected ? "rejected" : "confirmed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作失敗");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Shell><div className="py-20 text-center text-sm text-gray-400">載入中…</div></Shell>;
  if (loadError || !data) return <Shell><Notice title="連結無效" desc="找不到這筆預約，請確認連結或聯絡馬鈴薯沙發。" /></Shell>;

  // ---- done states ----
  if (done === "customer")
    return <Shell><Notice title="✓ 已送出，感謝您！" desc="我們會盡快為您安排師傅，確認時段後再通知您。" /></Shell>;
  if (done === "confirmed")
    return <Shell><Notice title="✓ 已確認時段" desc="已回填到服務單，客人與內勤都會收到通知。" /></Shell>;
  if (done === "rejected")
    return <Shell><Notice title="已回報「都不行」" desc="已通知內勤，會再請客人提供其他時段。" /></Shell>;

  // ---- customer ----
  if (data.role === "customer") {
    if (data.status !== "awaiting_customer")
      return <Shell><Notice title="您已送出時段" desc="我們正在為您安排師傅，確認後會通知您。" /></Shell>;
    const v = data.view;
    return (
      <Shell>
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">到府清潔預約</p>
            {v.clientName && <p className="mt-1 font-medium text-gray-800">{v.clientName}</p>}
            <p className="mt-0.5 text-sm text-gray-500">{v.item}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-1 text-sm font-semibold text-gray-800">方便到府的時段</p>
            <p className="mb-3 text-xs text-gray-400">最多選 3 組，師傅會從中挑一個確認</p>
            <div className="space-y-2">
              {slots.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="date"
                    value={s.date}
                    onChange={(e) => setSlots((p) => p.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={s.period}
                    onChange={(e) => setSlots((p) => p.map((x, j) => (j === i ? { ...x, period: e.target.value as Period } : x)))}
                    className="w-24 rounded-lg border border-gray-300 px-2 py-2 text-sm"
                  >
                    {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-2 text-sm font-semibold text-gray-800">到府資訊</p>
            <label className="mb-1 block text-xs font-medium text-gray-500">姓名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="您的稱呼"
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <label className="mb-1 block text-xs font-medium text-gray-500">地址</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="清潔地址"
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <label className="mb-1 block text-xs font-medium text-gray-500">聯絡電話</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="聯絡電話"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}
          <button type="button" onClick={() => void submitCustomer()} disabled={submitting}
            className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
            {submitting ? "送出中…" : "送出時段"}
          </button>
        </div>
      </Shell>
    );
  }

  // ---- tech ----
  const v = data.view;
  if (data.status === "confirmed")
    return <Shell><Notice title="已確認" desc={`已排定 ${fmtDate(v.confirmedDate)} ${v.confirmedPeriod}`} /></Shell>;
  const mapUrl = v.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address)}` : "";
  return (
    <Shell>
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <p className="font-semibold text-gray-800">{v.clientName || "客戶"}｜{v.item}</p>
          {v.address && (
            <p className="mt-1 text-gray-600">
              📍 {v.address}
              {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 underline">導航</a>}
            </p>
          )}
          {v.phone && <p className="mt-0.5 text-gray-600">📞 <a href={`tel:${v.phone}`} className="text-blue-600 underline">{v.phone}</a></p>}
          {v.issue && <p className="mt-1 text-gray-500">{v.issue}</p>}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-1 text-sm font-semibold text-gray-800">客人方便的時段</p>
          <p className="mb-3 text-xs text-gray-400">點一個您可以的時段確認</p>
          <div className="space-y-2">
            {v.proposedSlots.map((s, i) => (
              <button key={i} type="button" onClick={() => void techAct({ chosenIndex: i })} disabled={submitting}
                className="flex w-full items-center justify-between rounded-lg border-2 border-gray-200 px-4 py-3 text-left text-sm font-medium hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-40">
                <span>{fmtDate(s.date)}　{s.period}</span>
                <span className="text-emerald-600">選這個 ›</span>
              </button>
            ))}
          </div>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="button" onClick={() => void techAct({ reject: true })} disabled={submitting}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-600 disabled:opacity-40">
          都不行，請客人重新提供
        </button>
      </div>
    </Shell>
  );
}
