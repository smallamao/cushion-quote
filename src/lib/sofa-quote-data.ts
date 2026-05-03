// ─── Products ────────────────────────────────────────────────────────────────

export interface SofaProduct {
  displayName: string
  moduleName: string
  width: number
  seatWidth: number
  footSeatSize: string
  armrestWidth: number
  defaultFoot: string
  defaultSeat: number
}

export const SOFA_PRODUCTS: SofaProduct[] = [
  { displayName: 'ELEC',  moduleName: '高壓電',        width: 262, seatWidth: 76, armrestWidth: 17, footSeatSize: '79x80', defaultFoot: '黑鐵腳',    defaultSeat: 3 },
  { displayName: 'POINT', moduleName: '轉捩點',        width: 275, seatWidth: 73, armrestWidth: 28, footSeatSize: '74x96', defaultFoot: '方木腳H8/H6', defaultSeat: 3 },
  { displayName: 'ATR',   moduleName: '吸引力',        width: 287, seatWidth: 79, armrestWidth: 25, footSeatSize: '80x96', defaultFoot: 'L鐵腳',      defaultSeat: 3 },
  { displayName: 'BOOM',  moduleName: '爆發力',        width: 293, seatWidth: 79, armrestWidth: 28, footSeatSize: '80x96', defaultFoot: 'L鐵腳',      defaultSeat: 3 },
  { displayName: 'BOOMs', moduleName: '爆發力(縮扶手)', width: 277, seatWidth: 79, armrestWidth: 20, footSeatSize: '80x96', defaultFoot: 'L鐵腳',      defaultSeat: 3 },
  { displayName: 'FLA',   moduleName: '引爆點',        width: 304, seatWidth: 82, armrestWidth: 29, footSeatSize: '82x94', defaultFoot: 'U鋁腳',      defaultSeat: 3 },
  { displayName: 'BJ',    moduleName: '伯爵',          width: 264, seatWidth: 52, armrestWidth: 28, footSeatSize: '76x80', defaultFoot: '黑鐵腳',     defaultSeat: 4 },
  { displayName: 'AMI',   moduleName: '愛馬仕',        width: 272, seatWidth: 80, armrestWidth: 16, footSeatSize: '92x83', defaultFoot: '方木腳H12',  defaultSeat: 3 },
  { displayName: 'AMY',   moduleName: '艾米',          width: 270, seatWidth: 80, armrestWidth: 15, footSeatSize: '',      defaultFoot: '圓木腳H12',  defaultSeat: 3 },
  { displayName: 'EDSON', moduleName: '安德森',        width: 260, seatWidth: 58, armrestWidth: 14, footSeatSize: '82x94', defaultFoot: 'U鋁腳',      defaultSeat: 4 },
  { displayName: 'BLT',   moduleName: '安格斯',        width: 263, seatWidth: 75, armrestWidth: 19, footSeatSize: '78x86', defaultFoot: '黑鐵腳',     defaultSeat: 3 },
  { displayName: 'MIKO',  moduleName: '米可',          width: 284, seatWidth: 78, armrestWidth: 25, footSeatSize: '78x82', defaultFoot: '圓木腳H12',  defaultSeat: 3 },
  { displayName: 'JIMMY', moduleName: '吉米',          width: 277, seatWidth: 79, armrestWidth: 20, footSeatSize: '79x79', defaultFoot: '方木腳H12',  defaultSeat: 3 },
  { displayName: 'LEO',   moduleName: '里歐',          width: 286, seatWidth: 76, armrestWidth: 29, footSeatSize: '76x82', defaultFoot: '方木腳H12',  defaultSeat: 3 },
  { displayName: 'OBA',   moduleName: '歐巴',          width: 286, seatWidth: 76, armrestWidth: 29, footSeatSize: '76x82', defaultFoot: '方木腳H12',  defaultSeat: 3 },
  { displayName: 'GALI',  moduleName: '咖哩',          width: 262, seatWidth: 76, armrestWidth: 17, footSeatSize: '80x86', defaultFoot: '黑鐵腳',     defaultSeat: 3 },
  { displayName: 'ICE',   moduleName: '艾斯',          width: 280, seatWidth: 78, armrestWidth: 23, footSeatSize: '78x86', defaultFoot: '黑鐵腳',     defaultSeat: 3 },
  { displayName: 'BSK',   moduleName: '巴斯克',        width: 280, seatWidth: 80, armrestWidth: 20, footSeatSize: '80x60', defaultFoot: '方木腳H12',  defaultSeat: 3 },
  { displayName: 'LEMON', moduleName: '雷夢',          width: 275, seatWidth: 85, armrestWidth: 10, footSeatSize: '85x85', defaultFoot: '三角板',     defaultSeat: 3 },
  { displayName: 'MULE',  moduleName: '沐樂',          width: 262, seatWidth: 76, armrestWidth: 17, footSeatSize: '76x82', defaultFoot: '鋅合金',     defaultSeat: 3 },
  { displayName: 'HAILY', moduleName: '海力',          width: 279, seatWidth: 75, armrestWidth: 27, footSeatSize: '75x82', defaultFoot: '鏡鈢腳H15',  defaultSeat: 3 },
  { displayName: 'HANA',  moduleName: '哈娜',          width: 280, seatWidth: 73, armrestWidth: 31, footSeatSize: '73x78', defaultFoot: '12',         defaultSeat: 3 },
]

// ─── Material Grades ──────────────────────────────────────────────────────────

export interface MaterialGrade {
  id: string
  displayName: string
  materialDescription: string
  ratePerSeatPerCm: number   // width adjustment cost per cm per seat
  origin: '台灣' | '進口' | '天然牛皮'
}

export const MATERIAL_GRADES: MaterialGrade[] = [
  { id: 'TW_LV1',      displayName: '台灣 LV1 藍標', materialDescription: '台製機能超纖涼感布/台製貓抓布/舒適棉麻布(藍標)',    ratePerSeatPerCm: 150, origin: '台灣' },
  { id: 'TW_LV2',      displayName: '台灣 LV2 綠標', materialDescription: '台製高階貓抓布/台製輕奢皮革(綠標)',                  ratePerSeatPerCm: 150, origin: '台灣' },
  { id: 'TW_LV3',      displayName: '台灣 LV3 黃標', materialDescription: '比利時抗污布/以色列貓抓布/天絲涼感布(黃標)',          ratePerSeatPerCm: 150, origin: '台灣' },
  { id: 'TW_LV4',      displayName: '台灣 LV4 橘標', materialDescription: '超纖亞麻布/極致涼感布(橘標)',                        ratePerSeatPerCm: 150, origin: '台灣' },
  { id: 'TW_LV5',      displayName: '台灣 LV5 紅標', materialDescription: '頂級機能布料/高階特殊材質(紅標)',                    ratePerSeatPerCm: 200, origin: '台灣' },
  { id: 'IMPORT_LV1',  displayName: '進口 LV1',      materialDescription: '進口基礎系列布料(藍標)',                            ratePerSeatPerCm: 200, origin: '進口' },
  { id: 'IMPORT_LV2',  displayName: '進口 LV2',      materialDescription: '進口中階系列布料(綠標)',                            ratePerSeatPerCm: 250, origin: '進口' },
  { id: 'IMPORT_LV3',  displayName: '進口 LV3',      materialDescription: '進口高階系列布料(黃標)',                            ratePerSeatPerCm: 250, origin: '進口' },
  { id: 'IMPORT_LV4',  displayName: '進口 LV4',      materialDescription: '進口頂級系列布料(橘標)',                            ratePerSeatPerCm: 250, origin: '進口' },
  { id: 'IMPORT_LV5',  displayName: '進口 LV5',      materialDescription: '進口特殊限定系列(紅標)',                            ratePerSeatPerCm: 250, origin: '進口' },
  { id: 'LEATHER_LV1', displayName: '牛皮 LV1',      materialDescription: '塗料染牛皮/半苯染牛皮(三星)',                       ratePerSeatPerCm: 150, origin: '天然牛皮' },
  { id: 'LEATHER_LV2', displayName: '牛皮 LV2',      materialDescription: '義大利半苯染Nappa牛皮(四星)',                       ratePerSeatPerCm: 200, origin: '天然牛皮' },
  { id: 'LEATHER_LV3', displayName: '牛皮 LV3',      materialDescription: '義大利全苯染頂級牛皮(五星)',                        ratePerSeatPerCm: 250, origin: '天然牛皮' },
]

// ─── Base Pricing (from l1_base_pricing.json) ────────────────────────────────
// Price for full 3-piece L-shape sofa

type MaterialId = string
type ProductCode = string

export const BASE_PRICING: Record<ProductCode, Record<MaterialId, number>> = {
  ELEC:  { TW_LV1: 42600, TW_LV2: 43600, TW_LV3: 45600, TW_LV4: 47600, TW_LV5: 50600, IMPORT_LV1: 56800, IMPORT_LV2: 62800, IMPORT_LV3: 65800, IMPORT_LV4: 70800, IMPORT_LV5: 77800, LEATHER_LV1: 56600, LEATHER_LV2: 69600, LEATHER_LV3: 87600 },
  POINT: { TW_LV1: 45600, TW_LV2: 46600, TW_LV3: 48600, TW_LV4: 50600, TW_LV5: 53600, IMPORT_LV1: 59800, IMPORT_LV2: 65800, IMPORT_LV3: 68800, IMPORT_LV4: 73800, IMPORT_LV5: 80800, LEATHER_LV1: 59600, LEATHER_LV2: 72600, LEATHER_LV3: 90600 },
  ATR:   { TW_LV1: 48600, TW_LV2: 49600, TW_LV3: 51600, TW_LV4: 53600, TW_LV5: 56600, IMPORT_LV1: 62800, IMPORT_LV2: 68800, IMPORT_LV3: 71800, IMPORT_LV4: 76800, IMPORT_LV5: 83800, LEATHER_LV1: 62600, LEATHER_LV2: 75600, LEATHER_LV3: 93600 },
  BOOM:  { TW_LV1: 48600, TW_LV2: 49600, TW_LV3: 51600, TW_LV4: 53600, TW_LV5: 56600, IMPORT_LV1: 62800, IMPORT_LV2: 68800, IMPORT_LV3: 71800, IMPORT_LV4: 76800, IMPORT_LV5: 83800, LEATHER_LV1: 62600, LEATHER_LV2: 75600, LEATHER_LV3: 93600 },
  BOOMs: { TW_LV1: 48600, TW_LV2: 49600, TW_LV3: 51600, TW_LV4: 53600, TW_LV5: 56600, IMPORT_LV1: 62800, IMPORT_LV2: 68800, IMPORT_LV3: 71800, IMPORT_LV4: 76800, IMPORT_LV5: 83800, LEATHER_LV1: 62600, LEATHER_LV2: 75600, LEATHER_LV3: 93600 },
  FLA:   { TW_LV1: 46600, TW_LV2: 47600, TW_LV3: 49600, TW_LV4: 51600, TW_LV5: 54600, IMPORT_LV1: 60800, IMPORT_LV2: 66800, IMPORT_LV3: 69800, IMPORT_LV4: 74800, IMPORT_LV5: 81800, LEATHER_LV1: 60600, LEATHER_LV2: 73600, LEATHER_LV3: 91600 },
  BJ:    { TW_LV1: 45600, TW_LV2: 46600, TW_LV3: 48600, TW_LV4: 50600, TW_LV5: 53600, IMPORT_LV1: 59800, IMPORT_LV2: 65800, IMPORT_LV3: 68800, IMPORT_LV4: 73800, IMPORT_LV5: 80800, LEATHER_LV1: 59600, LEATHER_LV2: 72600, LEATHER_LV3: 90600 },
  AMI:   { TW_LV1: 46600, TW_LV2: 47600, TW_LV3: 49600, TW_LV4: 51600, TW_LV5: 54600, IMPORT_LV1: 60800, IMPORT_LV2: 66800, IMPORT_LV3: 69800, IMPORT_LV4: 74800, IMPORT_LV5: 60600, LEATHER_LV1: 73600, LEATHER_LV2: 91600, LEATHER_LV3: 88900 },
  AMY:   { TW_LV1: 45600, TW_LV2: 46600, TW_LV3: 48600, TW_LV4: 50600, TW_LV5: 53600, IMPORT_LV1: 59800, IMPORT_LV2: 65800, IMPORT_LV3: 68800, IMPORT_LV4: 73800, IMPORT_LV5: 59600, LEATHER_LV1: 72600, LEATHER_LV2: 90600, LEATHER_LV3: 89900 },
  EDSON: { TW_LV1: 45600, TW_LV2: 46600, TW_LV3: 48600, TW_LV4: 50600, TW_LV5: 53600, IMPORT_LV1: 59800, IMPORT_LV2: 65800, IMPORT_LV3: 68800, IMPORT_LV4: 73800, IMPORT_LV5: 80800, LEATHER_LV1: 59600, LEATHER_LV2: 72600, LEATHER_LV3: 90600 },
  BLT:   { TW_LV1: 44600, TW_LV2: 45600, TW_LV3: 47600, TW_LV4: 49600, TW_LV5: 52600, IMPORT_LV1: 58800, IMPORT_LV2: 64800, IMPORT_LV3: 67800, IMPORT_LV4: 72800, IMPORT_LV5: 79800, LEATHER_LV1: 58600, LEATHER_LV2: 71600, LEATHER_LV3: 89600 },
  MIKO:  { TW_LV1: 44600, TW_LV2: 45600, TW_LV3: 47600, TW_LV4: 49600, TW_LV5: 52600, IMPORT_LV1: 58800, IMPORT_LV2: 64800, IMPORT_LV3: 67800, IMPORT_LV4: 72800, IMPORT_LV5: 79800, LEATHER_LV1: 60900, LEATHER_LV2: 73900, LEATHER_LV3: 89900 },
  JIMMY: { TW_LV1: 44600, TW_LV2: 45600, TW_LV3: 47600, TW_LV4: 49600, TW_LV5: 52600, IMPORT_LV1: 58800, IMPORT_LV2: 64800, IMPORT_LV3: 67800, IMPORT_LV4: 72800, IMPORT_LV5: 79800, LEATHER_LV1: 60900, LEATHER_LV2: 73900, LEATHER_LV3: 89900 },
  LEO:   { TW_LV1: 51600, TW_LV2: 52600, TW_LV3: 54600, TW_LV4: 56600, TW_LV5: 59600, IMPORT_LV1: 65800, IMPORT_LV2: 71800, IMPORT_LV3: 74800, IMPORT_LV4: 79800, IMPORT_LV5: 86800, LEATHER_LV1: 65600, LEATHER_LV2: 78600, LEATHER_LV3: 96600 },
  OBA:   { TW_LV1: 53600, TW_LV2: 54600, TW_LV3: 56600, TW_LV4: 58600, TW_LV5: 61600, IMPORT_LV1: 67800, IMPORT_LV2: 73800, IMPORT_LV3: 76800, IMPORT_LV4: 81800, IMPORT_LV5: 88800, LEATHER_LV1: 67600, LEATHER_LV2: 80600, LEATHER_LV3: 98600 },
  GALI:  { TW_LV1: 44600, TW_LV2: 45600, TW_LV3: 47600, TW_LV4: 49600, TW_LV5: 52600, IMPORT_LV1: 58800, IMPORT_LV2: 64800, IMPORT_LV3: 67800, IMPORT_LV4: 72800, IMPORT_LV5: 79800, LEATHER_LV1: 58600, LEATHER_LV2: 71600, LEATHER_LV3: 89600 },
  ICE:   { TW_LV1: 48600, TW_LV2: 49600, TW_LV3: 51600, TW_LV4: 53600, TW_LV5: 56600, IMPORT_LV1: 62800, IMPORT_LV2: 68800, IMPORT_LV3: 71800, IMPORT_LV4: 76800, IMPORT_LV5: 83800, LEATHER_LV1: 62600, LEATHER_LV2: 75600, LEATHER_LV3: 93600 },
  BSK:   { TW_LV1: 51600, TW_LV2: 52600, TW_LV3: 54600, TW_LV4: 56600, TW_LV5: 59600, IMPORT_LV1: 65800, IMPORT_LV2: 71800, IMPORT_LV3: 74800, IMPORT_LV4: 79800, IMPORT_LV5: 86800, LEATHER_LV1: 67900, LEATHER_LV2: 83900, LEATHER_LV3: 99900 },
  LEMON: { TW_LV1: 51600, TW_LV2: 52600, TW_LV3: 54600, TW_LV4: 56600, TW_LV5: 59600, IMPORT_LV1: 65800, IMPORT_LV2: 71800, IMPORT_LV3: 74800, IMPORT_LV4: 79800, IMPORT_LV5: 86800, LEATHER_LV1: 66900, LEATHER_LV2: 81900, LEATHER_LV3: 97900 },
  MULE:  { TW_LV1: 54600, TW_LV2: 55600, TW_LV3: 57600, TW_LV4: 59600, TW_LV5: 62600, IMPORT_LV1: 68800, IMPORT_LV2: 74800, IMPORT_LV3: 77800, IMPORT_LV4: 82800, IMPORT_LV5: 89800, LEATHER_LV1: 68600, LEATHER_LV2: 81600, LEATHER_LV3: 97600 },
  HAILY: { TW_LV1: 58600, TW_LV2: 59600, TW_LV3: 61600, TW_LV4: 63600, TW_LV5: 66600, IMPORT_LV1: 72800, IMPORT_LV2: 78800, IMPORT_LV3: 81800, IMPORT_LV4: 86800, IMPORT_LV5: 93800, LEATHER_LV1: 72600, LEATHER_LV2: 85600, LEATHER_LV3: 101600 },
  HANA:  { TW_LV1: 63600, TW_LV2: 64600, TW_LV3: 66600, TW_LV4: 68600, TW_LV5: 71600, IMPORT_LV1: 77800, IMPORT_LV2: 83800, IMPORT_LV3: 86800, IMPORT_LV4: 91800, IMPORT_LV5: 98800, LEATHER_LV1: 77600, LEATHER_LV2: 90600, LEATHER_LV3: 106600 },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmtAmount(value: number): string {
  return Math.round(value).toLocaleString('zh-TW')
}

export function getBasePrice(productCode: string, materialId: string): number {
  return BASE_PRICING[productCode]?.[materialId] ?? 0
}

export interface WidthCalcResult {
  adjustCm: number
  adjustPrice: number
  oneSeatWidth: number
}

export function calcWidthAdjustment(
  inputWidth: number,
  product: SofaProduct,
  seatCount: number,
  grade: MaterialGrade,
): WidthCalcResult {
  const adjustCm = inputWidth - product.width
  const oneSeatWidth = (inputWidth - product.armrestWidth * 2) / seatCount

  let adjustPrice = 0
  if (adjustCm > 0) {
    // Enlargement: rate × cm (no seat-count multiplier per spec)
    adjustPrice = adjustCm * grade.ratePerSeatPerCm
  } else if (adjustCm <= -20) {
    // Reduction: floor to 10cm steps × 80, capped at 50cm
    const stepCm = Math.min(Math.floor(Math.abs(adjustCm) / 10) * 10, 50)
    adjustPrice = -(stepCm * 80)
  }
  // -1 to -19cm → no price diff

  return { adjustCm, adjustPrice, oneSeatWidth }
}

export interface LShapeCalc {
  basePrice: number
  L3: number         // L三人份
  L1: number         // L一人份
  platform: number   // 平台（扣除平台的金額）
  sizeL3: number
  sizeL1: number
}

export function calcLShape(product: SofaProduct, basePrice: number): LShapeCalc {
  const L3 = Math.round((basePrice / 7) * 4)
  const L1 = Math.round((basePrice / 7) * 2.1)
  const platform = basePrice - L3 - L1
  const sizeL3 = product.seatWidth * 2 + product.armrestWidth
  const sizeL1 = product.seatWidth + product.armrestWidth
  return { basePrice, L3, L1, platform, sizeL3, sizeL1 }
}

export function getReductionDiscount(product: SofaProduct, inputWidth: number): string | null {
  const reduced = product.width - inputWidth
  if (reduced < 20) return null
  const highDiscount = Math.floor(reduced / 10) * 800
  const lowDiscount = highDiscount - 500
  return `訂製 ${inputWidth}cm - $${fmtAmount(lowDiscount)} ~ $${fmtAmount(highDiscount)}`
}

function lShapeStepPrice(diffCm: number): number {
  const abs = Math.abs(diffCm)
  if (abs < 20) return 0
  if (abs >= 50) return 2500
  if (abs >= 40) return 2000
  if (abs >= 30) return 1500
  return 1000
}

export interface QuoteOutput {
  detailText: string
  copyText: string
}

// ─── Add-on Prices ───────────────────────────────────────────────────────────
const PRICE_GROUND_HALF = 1500
const PRICE_GROUND_FULL = 2000
const PRICE_HEIGHT_REDUCTION = -1000
const PRICE_ARMREST_REMOVAL = -1500
const PRICE_USB = 1500
const PRICE_REMOVE_STANDARD_USB = -1000
const PRICE_WIRELESS = 1200
const PRICE_PLATFORM_NO_STORAGE = -1000

// ─── Add-on Options ────────────────────────────────────────────────────────────

export interface SofaAddons {
  groundOption: "none" | "half" | "full"
  heightReduction: boolean
  removeArmrestCount: number
  usbCount: number
  removeStandardUsb: boolean
  wirelessChargeCount: number
  slideRailCount: number
  /** Must be set via `getSlideRailRate(productCode)`. 800 for BOOM/BOOMs, 1000 for others. */
  slideRailRatePerSeat: number
  platformNoStorage: boolean
}

export const DEFAULT_ADDONS: SofaAddons = {
  groundOption: "none",
  heightReduction: false,
  removeArmrestCount: 0,
  usbCount: 0,
  removeStandardUsb: false,
  wirelessChargeCount: 0,
  slideRailCount: 0,
  slideRailRatePerSeat: 1000,
  platformNoStorage: false,
}

export function getSlideRailRate(productCode: string): number {
  return ["BOOM", "BOOMs"].includes(productCode) ? 800 : 1000;
}

export function calcAddons(addons: SofaAddons): number {
  const groundCost = addons.groundOption === "full" ? PRICE_GROUND_FULL
    : addons.groundOption === "half" ? PRICE_GROUND_HALF : 0;
  const heightDiscount = addons.heightReduction ? PRICE_HEIGHT_REDUCTION : 0;
  const armrestDiscount = addons.removeArmrestCount * PRICE_ARMREST_REMOVAL;
  const usbCost = addons.usbCount * PRICE_USB;
  const removeUsbDiscount = addons.removeStandardUsb ? PRICE_REMOVE_STANDARD_USB : 0;
  const wirelessCost = addons.wirelessChargeCount * PRICE_WIRELESS;
  const slideRailCost = addons.slideRailCount * addons.slideRailRatePerSeat;
  const platformNoStorageDiscount = addons.platformNoStorage ? PRICE_PLATFORM_NO_STORAGE : 0;
  return groundCost + heightDiscount + armrestDiscount + usbCost
    + removeUsbDiscount + wirelessCost + slideRailCost + platformNoStorageDiscount;
}

export function buildQuoteOutput(
  product: SofaProduct,
  grade: MaterialGrade,
  inputWidth: number,
  seatCount: number,
  basePrice: number,
  addons?: SofaAddons,
): QuoteOutput {
  const lc = calcLShape(product, basePrice)
  const wc = calcWidthAdjustment(inputWidth, product, seatCount, grade)
  const addonTotal = addons ? calcAddons(addons) : 0

  const isEdsonBj = ['EDSON', 'BJ'].includes(product.displayName)
  const reductionText = getReductionDiscount(product, inputWidth)

  const detailLines: string[] = []

  // 一字型 (左二右二)
  if (!isEdsonBj) {
    detailLines.push('【一字型 分四位(左二右二)】')
    const fullWidthForL = lc.sizeL3 * 2
    const widthDiff = fullWidthForL - inputWidth
    if (widthDiff < 0) {
      // 加寬
      const addPrice = Math.abs(widthDiff) * grade.ratePerSeatPerCm
      detailLines.push(`${lc.sizeL3 * 2} - ${inputWidth} = ${Math.abs(widthDiff)}cm`)
      detailLines.push(`$${fmtAmount(lc.L3 * 2)} + ${fmtAmount(addPrice)} = $${fmtAmount(lc.L3 * 2 + addPrice)}  [不含腳椅]`)
    } else {
      const stepPrice = lShapeStepPrice(widthDiff)
      detailLines.push(`${lc.sizeL3 * 2} - ${inputWidth} = ${widthDiff}cm`)
      detailLines.push(`$${fmtAmount(lc.L3 * 2)} - ${fmtAmount(stepPrice)} = $${fmtAmount(lc.L3 * 2 - stepPrice)}  [不含腳椅]`)
    }
    detailLines.push('')
  }

  // L型 分三位
  detailLines.push('【L型 分三位】')
  const sofaTotal = basePrice + wc.adjustPrice
  if (wc.adjustPrice < 0) {
    detailLines.push(`$${fmtAmount(basePrice)} - ${fmtAmount(Math.abs(wc.adjustPrice))} = $${fmtAmount(sofaTotal)}`)
  } else if (wc.adjustPrice > 0) {
    detailLines.push(`$${fmtAmount(basePrice)} + ${fmtAmount(wc.adjustPrice)} = $${fmtAmount(sofaTotal)}`)
  } else {
    detailLines.push(`$${fmtAmount(basePrice)}`)
  }

  detailLines.push('')
  detailLines.push('- - - 詳細資訊 - - -')
  detailLines.push(`Ｌ三人份 ${lc.sizeL3}cm  $${fmtAmount(lc.L3)}`)
  detailLines.push(`Ｌ一人份 ${lc.sizeL1}cm  $${fmtAmount(lc.L1)}`)
  detailLines.push(`一人坐寬 ${wc.oneSeatWidth.toFixed(1)}cm`)

  detailLines.push('')
  detailLines.push('【Ｌ型 正常報價】')

  // Copy text (client-facing)
  const copyLines: string[] = []
  copyLines.push(`${product.displayName} ${product.moduleName} ${inputWidth}cm 三件式L型`)
  const grandTotal = sofaTotal + addonTotal
  copyLines.push(`${grade.materialDescription} $${fmtAmount(grandTotal)}`)
  if (reductionText) copyLines.push(reductionText)
  copyLines.push(`平台尺寸w${product.footSeatSize}cm`)
  copyLines.push(`椅腳樣式：${product.defaultFoot}`)
  copyLines.push('')
  copyLines.push(`扣除平台 - $${fmtAmount(lc.platform)}`)
  if (['BOOM', 'LEMON', 'MULE'].includes(product.displayName)) {
    copyLines.push('訂平台無置物 - $1,000')
  }
  if (['LEO', 'OBA'].includes(product.displayName)) {
    copyLines.push('扣除USB - $1,000')
  }
  if (product.displayName === 'BOOM') {
    copyLines.push('扣除滑軌 - $2,400')
  } else if (['ICE', 'LEO', 'OBA', 'AMI', 'LEMON', 'MULE'].includes(product.displayName)) {
    copyLines.push('扣除煞車滑軌 - $3,000')
  }

  if (addons && addonTotal !== 0) {
    copyLines.push('')
    copyLines.push('【進階選項】')
    if (addons.groundOption === "half") copyLines.push(`桶身落地（半落地）+${fmtAmount(PRICE_GROUND_HALF)}`)
    if (addons.groundOption === "full") copyLines.push(`桶身落地（全落地）+${fmtAmount(PRICE_GROUND_FULL)}`)
    if (addons.heightReduction) copyLines.push(`高度削減 4~6cm ${fmtAmount(PRICE_HEIGHT_REDUCTION)}`)
    if (addons.removeArmrestCount > 0) {
      const total = addons.removeArmrestCount * Math.abs(PRICE_ARMREST_REMOVAL);
      copyLines.push(`移除扶手 ×${addons.removeArmrestCount} -${fmtAmount(total)}`)
    }
    if (addons.usbCount > 0) {
      const total = addons.usbCount * PRICE_USB;
      copyLines.push(`加裝 USB 充電 ×${addons.usbCount} +${fmtAmount(total)}`)
    }
    if (addons.removeStandardUsb) copyLines.push(`扣除標配 USB ${fmtAmount(PRICE_REMOVE_STANDARD_USB)}`)
    if (addons.wirelessChargeCount > 0) {
      const total = addons.wirelessChargeCount * PRICE_WIRELESS;
      copyLines.push(`加裝無線充電 ×${addons.wirelessChargeCount} +${fmtAmount(total)}`)
    }
    if (addons.slideRailCount > 0) {
      const total = addons.slideRailCount * addons.slideRailRatePerSeat;
      copyLines.push(`加裝滑軌 ×${addons.slideRailCount}座 +${fmtAmount(total)}`)
    }
    if (addons.platformNoStorage) copyLines.push(`平台無置物 ${fmtAmount(PRICE_PLATFORM_NO_STORAGE)}`)
  }

  const copyText = copyLines.join('\n')
  detailLines.push(copyText)

  return { detailText: detailLines.join('\n'), copyText }
}

