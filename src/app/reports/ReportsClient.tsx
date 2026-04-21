"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonthlyARReportCard } from "@/components/ar/MonthlyARReportCard";

interface TrendPoint {
  month: string;
  totalAmount: number;
  orderCount: number;
}

const PIE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

interface ProductRow {
  productId: string;
  productCode: string;
  supplierProductCode: string;
  productName: string;
  specification: string;
  category: string;
  unit: string;
  supplierId: string;
  supplierName: string;
  totalQuantity: number;
  totalAmount: number;
  orderCount: number;
  avgUnitPrice: number;
}

interface SummaryResponse {
  ok: boolean;
  from: string;
  to: string;
  totalAmount: number;
  totalQuantity: number;
  orderCount: number;
  products: ProductRow[];
  byCategory: Array<{ category: string; totalAmount: number; totalQuantity: number }>;
  bySupplier: Array<{ supplierId: string; supplierName: string; totalAmount: number; orderCount: number }>;
  error?: string;
}

type ReportMode = "month" | "range" | "year";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
}

function currentYear(): string {
  return new Date().getFullYear().toString();
}

function recentYears(count: number): string[] {
  const thisYear = new Date().getFullYear();
  return Array.from({ length: count }, (_, index) => (thisYear - index).toString());
}

function monthDateRange(value: string): { from: string; to: string } {
  const [year, month] = value.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${value}-01`,
    to: `${value}-${lastDay.toString().padStart(2, "0")}`,
  };
}

function isReportMode(value: string): value is ReportMode {
  return value === "month" || value === "range" || value === "year";
}

function buildSummaryQuery(params: {
  reportMode: ReportMode;
  month: string;
  rangeFrom: string;
  rangeTo: string;
  year: string;
}): { queryString: string | null; validationError: string | null } {
  const { reportMode, month, rangeFrom, rangeTo, year } = params;

  if (reportMode === "month") {
    if (!month) {
      return { queryString: null, validationError: "請選擇月份" };
    }

    return {
      queryString: `?month=${encodeURIComponent(month)}`,
      validationError: null,
    };
  }

  if (reportMode === "range") {
    if (!rangeFrom || !rangeTo) {
      return { queryString: null, validationError: "請完整選擇起訖日期" };
    }

    if (rangeFrom > rangeTo) {
      return { queryString: null, validationError: "起始日期不能晚於結束日期" };
    }

    return {
      queryString: `?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`,
      validationError: null,
    };
  }

  if (!/^\d{4}$/.test(year)) {
    return { queryString: null, validationError: "請輸入 4 位數年份" };
  }

  return {
    queryString: `?year=${encodeURIComponent(year)}`,
    validationError: null,
  };
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;
}

function fmtNumber(n: number): string {
  return n.toLocaleString("zh-TW", { maximumFractionDigits: 1 });
}

type SortKey = "amount" | "quantity";

export function ReportsClient() {
  const [reportMode, setReportMode] = useState<ReportMode>("month");
  const [month, setMonth] = useState<string>(currentMonth());
  const [rangeFrom, setRangeFrom] = useState<string>(() => monthDateRange(currentMonth()).from);
  const [rangeTo, setRangeTo] = useState<string>(() => monthDateRange(currentMonth()).to);
  const [year, setYear] = useState<string>(currentYear());
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [topN, setTopN] = useState<number>(20);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [labelMode, setLabelMode] = useState<
    "productCode" | "supplierProductCode" | "specification" | "productName"
  >("productCode");

  const summaryQuery = useMemo(
    () => buildSummaryQuery({ reportMode, month, rangeFrom, rangeTo, year }),
    [reportMode, month, rangeFrom, rangeTo, year],
  );
  const yearOptions = useMemo(() => recentYears(10), []);

  async function load(queryString: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sheets/reports/purchase-summary${queryString}`);
      const json = (await res.json()) as SummaryResponse;
      if (!json.ok) {
        setError(json.error ?? "載入失敗");
        setData(null);
      } else {
        setData(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (summaryQuery.validationError || !summaryQuery.queryString) {
      setLoading(false);
      setData(null);
      setError(summaryQuery.validationError);
      return;
    }

    void load(summaryQuery.queryString);
  }, [summaryQuery]);

  useEffect(() => {
    // 載入過去 6 個月趨勢 (與選的月份無關,固定本月往前)
    void (async () => {
      try {
        const res = await fetch(`/api/sheets/reports/monthly-trend?months=6`);
        const json = (await res.json()) as { ok: boolean; points?: TrendPoint[] };
        if (json.ok && json.points) setTrend(json.points);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const sortedProducts = useMemo(() => {
    if (!data) return [];
    const filtered = data.products
      .filter((p) => categoryFilter === "all" || p.category === categoryFilter)
      .filter((p) => supplierFilter === "all" || p.supplierId === supplierFilter);
    const sorted = [...filtered].sort((a, b) =>
      sortKey === "amount"
        ? b.totalAmount - a.totalAmount
        : b.totalQuantity - a.totalQuantity,
    );
    return sorted.slice(0, topN);
  }, [data, sortKey, categoryFilter, supplierFilter, topN]);

  const filteredTotals = useMemo(() => {
    if (!data) return { amount: 0, quantity: 0, count: 0 };
    const filtered = data.products
      .filter((p) => categoryFilter === "all" || p.category === categoryFilter)
      .filter((p) => supplierFilter === "all" || p.supplierId === supplierFilter);
    return {
      amount: filtered.reduce((s, p) => s + p.totalAmount, 0),
      quantity: filtered.reduce((s, p) => s + p.totalQuantity, 0),
      count: filtered.length,
    };
  }, [data, categoryFilter, supplierFilter]);

  const categories = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.products.map((p) => p.category))).sort();
  }, [data]);

  const suppliers = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, string>();
    for (const p of data.products) {
      if (!map.has(p.supplierId)) map.set(p.supplierId, p.supplierName || p.supplierId);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BarChart3 className="h-6 w-6" />
            報表總覽
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            月度應收概況與採購統計
          </p>
        </div>
      </div>

      <MonthlyARReportCard />

      <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
        <div className="w-full">
          <Label className="mb-2 block text-xs">查詢模式</Label>
          <Tabs
            value={reportMode}
            onValueChange={(value) => {
              if (isReportMode(value)) {
                setReportMode(value);
              }
            }}
            className="gap-2"
          >
            <TabsList>
              <TabsTrigger value="month">月份</TabsTrigger>
              <TabsTrigger value="range">區間</TabsTrigger>
              <TabsTrigger value="year">年度</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {reportMode === "month" && (
          <div>
            <Label className="mb-1 block text-xs">月份</Label>
            <Input
              type="month"
              value={month}
              onChange={(e) => {
                const nextMonth = e.target.value;
                setMonth(nextMonth);
                if (nextMonth) {
                  const nextRange = monthDateRange(nextMonth);
                  setRangeFrom(nextRange.from);
                  setRangeTo(nextRange.to);
                }
              }}
              className="w-40"
            />
          </div>
        )}
        {reportMode === "range" && (
          <>
            <div>
              <Label className="mb-1 block text-xs">起始日期</Label>
              <Input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="w-44"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">結束日期</Label>
              <Input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                className="w-44"
              />
            </div>
          </>
        )}
        {reportMode === "year" && (
          <div>
            <Label className="mb-1 block text-xs">年度</Label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="h-9 w-32 rounded-md border border-[var(--border)] bg-white px-2 text-sm"
            >
              {yearOptions.map((optionYear) => (
                <option key={optionYear} value={optionYear}>
                  {optionYear} 年
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <Label className="mb-1 block text-xs">分類</Label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-sm"
          >
            <option value="all">全部分類</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">廠商</Label>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-sm"
          >
            <option value="all">全部廠商</option>
            {suppliers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">排序依據</Label>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={sortKey === "amount" ? "default" : "outline"}
              onClick={() => setSortKey("amount")}
            >
              金額
            </Button>
            <Button
              size="sm"
              variant={sortKey === "quantity" ? "default" : "outline"}
              onClick={() => setSortKey("quantity")}
            >
              數量
            </Button>
          </div>
        </div>
        <div>
          <Label className="mb-1 block text-xs">顯示筆數</Label>
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-sm"
          >
            <option value={10}>Top 10</option>
            <option value={20}>Top 20</option>
            <option value={50}>Top 50</option>
            <option value={9999}>全部</option>
          </select>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-[var(--text-secondary)]">載入中...</p>
      )}
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="期間" value={`${data.from} ~ ${data.to}`} />
            <StatCard label="總金額" value={fmtMoney(filteredTotals.amount)} highlight />
            <StatCard label="品項數" value={`${filteredTotals.count} 種`} />
            <StatCard label="採購單數" value={`${data.orderCount} 張`} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-[var(--border)] bg-white p-4 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  商品 Top 10 (依{sortKey === "amount" ? "金額" : "數量"})
                </h3>
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-[var(--text-tertiary)]">標籤:</span>
                  {(
                    [
                      ["productCode", "商品編號"],
                      ["supplierProductCode", "廠商原碼"],
                      ["specification", "規格"],
                      ["productName", "名稱"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setLabelMode(mode)}
                      className={`rounded px-1.5 py-0.5 ${labelMode === mode ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={sortedProducts.slice(0, 10).map((p) => ({
                    ...p,
                    label:
                      labelMode === "productCode"
                        ? p.productCode
                        : labelMode === "supplierProductCode"
                          ? p.supplierProductCode || p.specification || p.productCode
                          : labelMode === "specification"
                            ? p.specification || p.productCode
                            : p.productName || p.productCode,
                  }))}
                  margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) =>
                      sortKey === "amount"
                        ? `$${(v / 1000).toFixed(0)}k`
                        : fmtNumber(v)
                    }
                  />
                  <Tooltip
                    formatter={(value: number) =>
                      sortKey === "amount" ? fmtMoney(value) : fmtNumber(value)
                    }
                    labelFormatter={(label: string, payload) => {
                      const p = payload?.[0]?.payload as ProductRow | undefined;
                      if (!p) return label;
                      const parts = [p.productCode];
                      if (p.supplierProductCode) parts.push(`[${p.supplierProductCode}]`);
                      if (p.productName) parts.push(`· ${p.productName}`);
                      return parts.join(" ");
                    }}
                  />
                  <Bar
                    dataKey={sortKey === "amount" ? "totalAmount" : "totalQuantity"}
                    name={sortKey === "amount" ? "金額" : "數量"}
                    fill="#2563eb"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold">分類佔比</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={data.byCategory}
                    dataKey="totalAmount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry: { category: string; percent?: number }) =>
                      `${entry.category} ${entry.percent ? (entry.percent * 100).toFixed(0) : 0}%`
                    }
                  >
                    {data.byCategory.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => fmtMoney(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {trend.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold">最近 6 個月採購趨勢</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === "totalAmount"
                        ? [fmtMoney(value), "金額"]
                        : [`${value} 張`, "張數"]
                    }
                  />
                  <Legend
                    formatter={(v) => (v === "totalAmount" ? "金額" : "張數")}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="totalAmount"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="orderCount"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="rounded-lg border border-[var(--border)]">
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
              <TrendingUp className="h-4 w-4 text-[var(--accent)]" />
              <h2 className="text-sm font-semibold">
                商品排行 (依{sortKey === "amount" ? "金額" : "數量"})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--text-secondary)]">
                  <tr>
                    <th className="w-12 px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">商品編號</th>
                    <th className="px-3 py-2 text-left">名稱</th>
                    <th className="px-3 py-2 text-left">分類</th>
                    <th className="px-3 py-2 text-left">廠商</th>
                    <th className="px-3 py-2 text-right">總數量</th>
                    <th className="px-3 py-2 text-right">均價</th>
                    <th className="px-3 py-2 text-right">總金額</th>
                    <th className="px-3 py-2 text-right">單次</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProducts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-3 py-8 text-center text-xs text-[var(--text-tertiary)]"
                      >
                        此期間沒有資料
                      </td>
                    </tr>
                  ) : (
                    sortedProducts.map((p, idx) => (
                      <tr
                        key={`${p.productId}-${p.productCode}`}
                        className="border-t border-[var(--border)]"
                      >
                        <td className="px-3 py-2 text-xs text-[var(--text-tertiary)]">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {p.productCode}
                        </td>
                        <td className="px-3 py-2">
                          {p.productName}
                          {p.specification && (
                            <span className="ml-1 text-xs text-[var(--text-tertiary)]">
                              ({p.specification})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{p.category}</td>
                        <td className="px-3 py-2 text-xs">
                          {p.supplierName || p.supplierId}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">
                          {fmtNumber(p.totalQuantity)} {p.unit}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-[var(--text-secondary)]">
                          {fmtMoney(Math.round(p.avgUnitPrice))}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">
                          {fmtMoney(p.totalAmount)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-[var(--text-tertiary)]">
                          {p.orderCount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)]">
              <div className="border-b border-[var(--border)] px-4 py-2.5">
                <h2 className="text-sm font-semibold">依分類彙總</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-2)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="px-3 py-1.5 text-left">分類</th>
                    <th className="px-3 py-1.5 text-right">總數量</th>
                    <th className="px-3 py-1.5 text-right">總金額</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCategory.map((c) => (
                    <tr key={c.category} className="border-t border-[var(--border)]">
                      <td className="px-3 py-1.5">{c.category}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs">
                        {fmtNumber(c.totalQuantity)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {fmtMoney(c.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-[var(--border)]">
              <div className="border-b border-[var(--border)] px-4 py-2.5">
                <h2 className="text-sm font-semibold">依廠商彙總</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-2)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="px-3 py-1.5 text-left">廠商</th>
                    <th className="px-3 py-1.5 text-right">採購單數</th>
                    <th className="px-3 py-1.5 text-right">總金額</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySupplier.map((s) => (
                    <tr key={s.supplierId} className="border-t border-[var(--border)]">
                      <td className="px-3 py-1.5">{s.supplierName}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs">
                        {s.orderCount}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {fmtMoney(s.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        highlight
          ? "border-[var(--accent)] bg-[var(--accent-muted)]/20"
          : "border-[var(--border)] bg-[var(--bg-elevated)]"
      }`}
    >
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
      <div
        className={`mt-1 font-mono ${
          highlight ? "text-lg font-bold text-[var(--accent)]" : "text-base font-semibold"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
