import fetch from "node-fetch";
import { createHash } from "node:crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

function buildGivemeSign(timeStamp: string, idno: string, password: string): string {
  return createHash("md5").update(`${timeStamp}${idno}${password}`).digest("hex").toUpperCase();
}

async function testGiveme() {
  const uncode = process.env.GIVEME_UNCODE?.trim();
  const idno = process.env.GIVEME_IDNO?.trim();
  const password = process.env.GIVEME_PASSWORD?.trim();
  const baseUrl = process.env.GIVEME_BASE_URL?.trim() || "https://www.giveme.com.tw/invoice.do";

  if (!uncode || !idno || !password) {
    console.error("Missing Giveme credentials in .env.local");
    return;
  }

  const timeStamp = Date.now().toString();
  const sign = buildGivemeSign(timeStamp, idno, password);

  const payload = {
    timeStamp,
    uncode,
    idno,
    sign,
    customerName: "測試客戶",
    datetime: new Date().toISOString().slice(0, 10), // yyyy-mm-dd
    totalFee: "100",
    content: "測試發票",
    taxType: 0,
    items: [
      {
        name: "測試商品",
        money: 100,
        number: 1,
      }
    ]
  };

  console.log("Sending payload:", JSON.stringify(payload, null, 2));

  try {
    const res = await fetch(`${baseUrl}?action=addB2C`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    console.log("Status:", res.status);
    const data = await res.text();
    console.log("Response:", data);
  } catch (error) {
    console.error("Error:", error);
  }
}

testGiveme();
