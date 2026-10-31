"use client";

import { useEffect, useMemo, useState } from "react";

import { validateProposedSlots } from "@/lib/cleaning-schedule";

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

/**
 * 到府清潔最快可排的日期＝今天 + 2 天（委外師傅需要前置時間）。
 *
 * 🔴 清潔是「委外師傅」，和司機配送的規則不同：**不擋週日、不綁製作完成日**，
 *    週六日與國定假日都能排。別把 /confirm（司機配送）那套限制搬過來。
 *    真的喬不攏還有後續「師傅確認時段」那關把關。
 */
const CLEANING_LEAD_DAYS = 2;
function earliestCleaningDate(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + CLEANING_LEAD_DAYS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function CleaningClient({ token }: { token: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [done, setDone] = useState<null | "customer" | "confirmed" | "rejected">(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  // 師傅端：先選哪一組日期，再指定具體時段（客人可能填「皆可」）
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [pickedPeriod, setPickedPeriod] = useState<"" | "上午" | "下午" | "晚上">("");
  const [timeNote, setTimeNote] = useState("");

  // customer form
  const minDate = useMemo(() => earliestCleaningDate(), []);
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
    // 規則與 API 共用（lib/cleaning-schedule.ts），訊息因此一致
    const slotError = validateProposedSlots(chosen);
    if (slotError) {
      setErr(slotError);
      return;
    }
    // 前端 min 擋得住一般操作，擋不住手動輸入或舊頁籤，送出前再確認一次
    if (chosen.some((s) => s.date < minDate)) {
      setErr(`最快可排 ${fmtDate(minDate)} 起，請改選較晚的日期`);
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

  async function techAct(
    payload:
      | { chosenIndex: number; period: "上午" | "下午" | "晚上" | ""; timeNote: string }
      | { reject: true },
  ) {
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
            {/* 🔴 強制三組（老闆 2026-10-31）：只給一組的客人會把那天當成「師傅一定會到」，
                師傅排不進去就得重發連結、重新溝通一輪，溝通成本全回到內勤身上。 */}
            <p className="mb-1 text-xs text-gray-500">
              請完整填寫 <strong className="text-gray-700">三組</strong>方便的時間（不同日期），
              師傅會從中挑一個確認
            </p>
            {/* 把「可以選什麼」直接寫出來——客人最常問的就是「最快哪天」「週日可以嗎」。
                正面寫出週末假日可排，比只用 min 靜默反灰更能減少來回詢問。 */}
            <p className="mb-3 text-xs leading-relaxed text-gray-500">
              📅 最快可排 <strong className="text-gray-700">{fmtDate(minDate)}</strong> 起
              <br />
              <span className="text-gray-400">※ 週六、週日、國定假日都可以安排</span>
            </p>
            <div className="space-y-2">
              {slots.map((s, i) => (
                <div key={i}>
                  {/* 三組都要填，所以每組各自標號並標「必填」——只放一個總說明，
                      客人容易以為填一組就好（叫料那邊 2026-10-29 實際發生過） */}
                  <p className="mb-1 text-sm font-medium text-gray-600">
                    第 {i + 1} 組
                    {!s.date && <span className="ml-1 text-red-500">必填</span>}
                  </p>
                  <div className="flex gap-2">
                  <input
                    type="date"
                    value={s.date}
                    min={minDate}
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

        {/* 🔴 2026-10-19：原本點一下就直接確認，不帶時間——客人填「皆可」時確認結果
            還是「皆可」，等於排了一個不能執行的時間（實際踩到：師傅說「週四 13:00 後」，
            系統沒地方存）。現在先選日期，再指定上午／下午／晚上，並可補一句備註。 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-1 text-sm font-semibold text-gray-800">客人方便的時段</p>
          <p className="mb-3 text-xs text-gray-400">先選一個日期，再指定您方便的時段</p>
          <div className="space-y-2">
            {v.proposedSlots.map((s, i) => (
              <button key={i} type="button" onClick={() => { setPickedIdx(i); setPickedPeriod(s.period === "皆可" ? "" : s.period); }} disabled={submitting}
                className={`flex w-full items-center justify-between rounded-lg border-2 px-4 py-3 text-left text-sm font-medium disabled:opacity-40 ${pickedIdx === i ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-emerald-300"}`}>
                <span>{fmtDate(s.date)}　{s.period}</span>
                <span className="text-emerald-600">{pickedIdx === i ? "已選 ✓" : "選這個 ›"}</span>
              </button>
            ))}
          </div>

          {pickedIdx !== null && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="mb-2 text-sm font-semibold text-gray-800">您方便的時段</p>
              <div className="flex gap-2">
                {(["上午", "下午", "晚上"] as const).map((pd) => (
                  <button key={pd} type="button" onClick={() => setPickedPeriod(pd)} disabled={submitting}
                    className={`flex-1 rounded-lg border-2 px-3 py-2.5 text-sm font-medium disabled:opacity-40 ${pickedPeriod === pd ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600 hover:border-emerald-300"}`}>
                    {pd}
                  </button>
                ))}
              </div>

              <label className="mt-3 mb-1 block text-xs font-medium text-gray-500">時間補充（選填）</label>
              <input value={timeNote} onChange={(e) => setTimeNote(e.target.value)} maxLength={24}
                placeholder="例：13:00 後、需提前 30 分通知"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm" />

              <button type="button" disabled={submitting || !pickedPeriod}
                onClick={() => void techAct({ chosenIndex: pickedIdx, period: pickedPeriod, timeNote })}
                className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
                {submitting ? "送出中…" : pickedPeriod ? `確認 ${fmtDate(v.proposedSlots[pickedIdx].date)} ${pickedPeriod}` : "請先選上午／下午／晚上"}
              </button>
            </div>
          )}
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
