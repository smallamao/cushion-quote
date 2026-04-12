"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import useSWR from "swr";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { Button } from "@/components/ui/button";
import type { PurchaseProductHistoryResponse } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function ProductHistoryPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = use(params);

  const { data, error, isLoading } = useSWR<PurchaseProductHistoryResponse>(
    `/api/sheets/purchase-products/${productId}/history`,
    fetcher
  );

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-sm text-[var(--text-secondary)]">載入中...</p>
      </div>
    );
  }

  if (error || !data?.ok) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-sm text-red-600">
          {data?.error || "載入失敗"}
        </p>
        <Link href="/purchase-products">
          <Button variant="outline" size="sm" className="mt-4">
            <ArrowLeft className="mr-1 h-3 w-3" />
            返回商品列表
          </Button>
        </Link>
      </div>
    );
  }

  const { product, summary, history } = data;

  // Prepare chart data (reverse for chronological order)
  const chartData = [...history]
    .reverse()
    .map((item) => ({
      date: item.orderDate,
      price: item.unitPrice,
    }));

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href="/purchase-products">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-1 h-3 w-3" />
            返回商品列表
          </Button>
        </Link>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            商品採購歷史
          </h1>
          <div className="text-sm text-[var(--text-secondary)] space-y-1">
            <p>
              <span className="font-medium">商品：</span>
              {product.productCode} - {product.productName}
            </p>
            <p>
              <span className="font-medium">規格：</span>
              {product.specification || "—"}
            </p>
            <p>
              <span className="font-medium">廠商：</span>
              {product.supplierName}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
          📊 採購統計摘要
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div>
            <p className="text-xs text-[var(--text-secondary)]">總次數</p>
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              {summary.totalPurchases}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">總數量</p>
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              {summary.totalQuantity} {product.unit}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">平均單價</p>
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              ${summary.averagePrice}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">最近採購</p>
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              {summary.lastPurchaseDate || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">價格範圍</p>
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              ${summary.minPrice} - ${summary.maxPrice}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)]">價差</p>
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              ${summary.maxPrice - summary.minPrice}
            </p>
          </div>
        </div>
      </div>

      {/* Price Trend Chart */}
      {history.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
            📈 單價趨勢圖
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "var(--text-secondary)" }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "var(--text-secondary)" }}
                domain={["dataMin - 10", "dataMax + 10"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={{ r: 4 }}
                name="單價"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Purchase History Table */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            📦 採購明細記錄
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left font-medium">日期</th>
                <th className="px-4 py-3 text-left font-medium">採購單號</th>
                <th className="px-4 py-3 text-right font-medium">數量</th>
                <th className="px-4 py-3 text-right font-medium">單價</th>
                <th className="px-4 py-3 text-right font-medium">金額</th>
                <th className="px-4 py-3 text-left font-medium">案件</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {history.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-[var(--text-secondary)]"
                  >
                    尚無採購記錄
                  </td>
                </tr>
              ) : (
                history.map((item, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-[var(--bg-subtle)] transition-colors"
                  >
                    <td className="px-4 py-3 text-[var(--text-primary)]">
                      {item.orderDate}
                    </td>
                    <td className="px-4 py-3">
                        <Link
                          href={`/purchases/${encodeURIComponent(item.orderId)}`}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {item.orderId}
                        </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--text-primary)]">
                      {item.quantity} {product.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--text-primary)]">
                      ${item.unitPrice}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--text-primary)]">
                      ${item.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {item.caseId ? (
                        <Link
                          href={{ pathname: "/cases", query: { caseId: item.caseId } }}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {item.caseId}
                          {item.caseName && ` - ${item.caseName}`}
                        </Link>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
