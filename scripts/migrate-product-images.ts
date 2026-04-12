/**
 * Product Image Migration Script
 *
 * Downloads product images from Ragic URLs and saves to local/Vercel Blob.
 * Updates Google Sheets with new URLs.
 *
 * Usage:
 *   npx tsx scripts/migrate-product-images.ts
 *   npx tsx scripts/migrate-product-images.ts --dry-run  # Preview only
 *   npx tsx scripts/migrate-product-images.ts --limit 10  # Migrate first 10
 */

import fs from "fs";
import path from "path";
import { getSheetsClient } from "../src/lib/sheets-client";

const PURCHASE_PRODUCT_SHEET = "採購商品";
const PUBLIC_DIR = path.join(process.cwd(), "public", "product-images");
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

interface ProductRow {
  rowIndex: number; // 1-based (including header)
  id: string;
  productCode: string;
  category: string;
  supplierId: string;
  productName: string;
  specification: string;
  unit: string;
  unitPrice: number;
  imageUrl: string;
  notes: string;
  isActive: boolean;
}

function isRagicUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes("ragic.com") || lower.includes("ragic");
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
}

function sanitizeFilename(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

  console.log("🖼️  Product Image Migration");
  console.log(`Mode: ${dryRun ? "DRY RUN (preview only)" : "LIVE (will update Sheets)"}`);
  console.log(`Limit: ${limit === Infinity ? "all" : limit}\n`);

  const client = await getSheetsClient();
  if (!client) {
    console.error("❌ Google Sheets client not configured");
    process.exit(1);
  }

  // Ensure public directory exists
  if (!dryRun) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    console.log(`📁 Created directory: ${PUBLIC_DIR}\n`);
  }

  // Fetch all products
  const response = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: `${PURCHASE_PRODUCT_SHEET}!A2:M`,
  });

  const rows = response.data.values ?? [];
  const products: ProductRow[] = rows.map((row, idx) => ({
    rowIndex: idx + 2, // +2 because: idx starts at 0, and row 1 is header
    id: row[0] ?? "",
    productCode: row[1] ?? "",
    category: row[2] ?? "",
    supplierId: row[3] ?? "",
    productName: row[4] ?? "",
    specification: row[5] ?? "",
    unit: row[6] ?? "",
    unitPrice: Number(row[7]) || 0,
    imageUrl: row[8] ?? "",
    notes: row[9] ?? "",
    isActive: (row[10] ?? "true") === "true",
  }));

  const ragicProducts = products.filter((p) => isRagicUrl(p.imageUrl));
  const toMigrate = ragicProducts.slice(0, limit);

  console.log(`Total products: ${products.length}`);
  console.log(`With Ragic URLs: ${ragicProducts.length}`);
  console.log(`Will migrate: ${toMigrate.length}\n`);

  if (toMigrate.length === 0) {
    console.log("✅ No Ragic images to migrate!");
    return;
  }

  const updates: Array<{ rowIndex: number; newUrl: string }> = [];
  let successCount = 0;
  let failCount = 0;

  for (const product of toMigrate) {
    const safeCode = sanitizeFilename(product.productCode);
    const ext = path.extname(product.imageUrl).split("?")[0] || ".jpg";
    const filename = `${safeCode}${ext}`;
    const destPath = path.join(PUBLIC_DIR, filename);
    const newUrl = `/product-images/${filename}`;

    console.log(`[${successCount + failCount + 1}/${toMigrate.length}] ${product.productCode}`);
    console.log(`  From: ${product.imageUrl}`);
    console.log(`  To: ${newUrl}`);

    if (dryRun) {
      console.log(`  [DRY RUN] Would download to ${destPath}\n`);
      successCount++;
      continue;
    }

    try {
      await downloadImage(product.imageUrl, destPath);
      updates.push({ rowIndex: product.rowIndex, newUrl });
      console.log(`  ✅ Downloaded\n`);
      successCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ Failed: ${msg}\n`);
      failCount++;
    }
  }

  // Update Google Sheets
  if (!dryRun && updates.length > 0) {
    console.log(`\n📝 Updating ${updates.length} product URLs in Google Sheets...`);

    const batchData = updates.map((u) => ({
      range: `${PURCHASE_PRODUCT_SHEET}!I${u.rowIndex}`,
      values: [[u.newUrl]],
    }));

    await client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: {
        data: batchData,
        valueInputOption: "RAW",
      },
    });

    console.log(`✅ Updated Google Sheets`);
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log(`  Total: ${toMigrate.length}`);

  if (failCount > 0) {
    console.log(`\n⚠️  Some images failed to download. Re-run the script to retry.`);
  }
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
