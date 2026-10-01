/**
 * 產生 src/lib/tw-holidays.ts —— 台灣國定假日表，給客人頁／司機頁顯示「這天是假日」提示用。
 *
 * 為什麼要有這支：假日表不可以憑印象手打（補假、彈性放假每年都不一樣，打錯就是給客人錯訊息）。
 * 資料來源＝行政院人事行政總處「中華民國政府行政機關辦公日曆表」政府開放資料。
 *
 * 明年要更新：
 *     node scripts/gen-tw-holidays.mjs
 * 它會自己抓最新的年度檔，重寫 src/lib/tw-holidays.ts。跑完記得 npm test。
 *
 * 🔴 只收「有名字的放假日」（備註非空），因為單純的週六週日備註是空的。
 *    週日另外由 isNonDeliveryDay 硬擋，所以這裡**排除週日**，免得同一天跳兩種訊息。
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATASET = "https://data.gov.tw/api/v2/rest/dataset/14718";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "tw-holidays.ts");

/** 要收哪幾個民國年。往後多抓一年，連結最長只會跨到隔年。 */
const ROC_YEARS = (() => {
  const roc = new Date().getFullYear() - 1911;
  return [roc, roc + 1, roc + 2];
})();

function decode(buf) {
  for (const enc of ["utf-8", "big5"]) {
    try {
      const txt = new TextDecoder(enc, { fatal: true }).decode(buf);
      return txt.replace(/^﻿/, "");
    } catch { /* 換下一個編碼 */ }
  }
  throw new Error("CSV 編碼認不出來");
}

/** 這份 CSV 欄位固定是 西元日期,星期,是否放假,備註，但備註可能含逗號，所以要正規解析。 */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = lines.shift().split(",").map((h) => h.trim());
  return lines.map((line) => {
    const cells = [];
    let cur = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { quoted = !quoted; continue; }
      if (ch === "," && !quoted) { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

const meta = await (await fetch(DATASET)).json();
const dists = (meta.result ?? meta).distribution ?? [];

const holidays = {};
const covered = [];
for (const roc of ROC_YEARS) {
  // 同一年可能有多個版本（例如「(1141020更新)」），取最後一個＝最新修訂
  const hits = dists.filter(
    (d) => (d.resourceDescription ?? "").startsWith(`${roc}年`) &&
           !(d.resourceDescription ?? "").includes("Google"),
  );
  if (hits.length === 0) continue;
  const url = hits[hits.length - 1].resourceDownloadUrl;
  const rows = parseCsv(decode(await (await fetch(url)).arrayBuffer()));
  let n = 0;
  for (const r of rows) {
    const ymd = r["西元日期"] ?? "";
    if (!/^\d{8}$/.test(ymd)) continue;
    if (r["是否放假"] !== "2") continue;        // 2＝放假
    const name = (r["備註"] ?? "").trim();
    if (!name) continue;                        // 沒名字的＝單純週末
    if (r["星期"] === "日") continue;            // 週日已由 isNonDeliveryDay 硬擋
    holidays[`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}`] = name;
    n++;
  }
  covered.push(`${roc} 年（西元 ${roc + 1911}）${n} 天`);
  console.log(`✅ ${roc} 年：${n} 天`);
}

if (Object.keys(holidays).length === 0) throw new Error("一天都沒抓到，先確認資料來源還在不在");

const entries = Object.entries(holidays).sort(([a], [b]) => a.localeCompare(b));
const body = entries.map(([d, n]) => `  "${d}": "${n}",`).join("\n");

writeFileSync(OUT, `// 這個檔案是產生出來的，不要手改。
// 重新產生： node scripts/gen-tw-holidays.mjs
//
// 來源：行政院人事行政總處「中華民國政府行政機關辦公日曆表」（data.gov.tw dataset 14718）
// 產生時間：${new Date().toISOString().slice(0, 10)}
// 涵蓋：${covered.join("、")}
//
// 只收「有名字的放假日」（含補假／彈性放假）；單純的週六不收，週日也不收
// —— 週日由 isNonDeliveryDay 硬擋，重複提示只會讓客人困惑。
//
// ⚠️ 表外的日期一律回空字串＝不顯示提示。這是刻意的：提示是輔助，
//    寧可少提示，也不要因為表過期就給客人錯的資訊。
export const TW_HOLIDAYS: Record<string, string> = {
${body}
};
`, "utf-8");

console.log(`\n寫入 ${OUT}（共 ${entries.length} 天）`);
