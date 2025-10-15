import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Ensure directory exists (no-op if it already does).
 * @param {string} dirPath
 */
export async function ensureDir(dirPath) {
  if (!dirPath) return;
  await fs.mkdir(dirPath, { recursive: true }).catch(() => {});
}

/**
 * Read a JSON file, returning parsed object or null on error.
 * @param {string} filePath
 * @returns {Promise<any|null>}
 */
export async function readJSON(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write JSON to a file, ensuring the directory exists.
 * @param {string} filePath
 * @param {any} data
 * @param {number} [spaces=2]
 */
export async function writeJSON(filePath, data, spaces = 2) {
  await ensureDir(path.dirname(filePath));
  const raw = JSON.stringify(data, null, spaces);
  await fs.writeFile(filePath, raw, "utf8");
}

/**
 * Returns true if date is missing/invalid or older than N days.
 * @param {string|number|Date} dateLike
 * @param {number} days
 */
export function isOlderThanDays(dateLike, days) {
  if (!dateLike) return true;
  const thenMs = new Date(dateLike).getTime();
  if (!Number.isFinite(thenMs)) return true;
  const diff = Date.now() - thenMs;
  const ms = days * 24 * 60 * 60 * 1000;
  return diff >= ms;
}

// export function mergeProducts(products, yandexProducts, yandexQuantity) {
//   // Normalize quantity: accept
//   // - flat array of offers [{ offerId, stocks: [...] }]
//   // - array of warehouses [{ offers: [...] }]
//   // - wrapped response { result: { warehouses: [...] } }
//   const extractQuantityOffers = (input) => {
//     if (!input) return [];
//     if (Array.isArray(input)) {
//       // warehouses style
//       if (input.length && Array.isArray(input[0]?.offers)) {
//         const out = [];
//         for (const wh of input)
//           if (Array.isArray(wh?.offers)) out.push(...wh.offers);
//         return out;
//       }
//       // flat offers style
//       if (
//         input.length &&
//         (input[0]?.offerId !== undefined || input[0]?.sku !== undefined)
//       ) {
//         return input;
//       }
//     }
//     const warehouses = input?.result?.warehouses;
//     if (Array.isArray(warehouses)) return extractQuantityOffers(warehouses);
//     const offers = input?.result?.offers; // fallback if API variant
//     if (Array.isArray(offers)) return offers;
//     return [];
//   };

//   // Extract Yandex mapping info: offerId, name, barcodes, price (basicPrice.value)
//   const extractYandexMappings = (input) => {
//     const out = [];
//     if (!input) return out;
//     const items = Array.isArray(input)
//       ? input
//       : Array.isArray(input?.result?.offerMappings)
//       ? input.result.offerMappings
//       : Array.isArray(input?.result?.offers)
//       ? input.result.offers
//       : Array.isArray(input?.result?.items)
//       ? input.result.items
//       : [];

//     for (const m of items) {
//       const offer = m?.offer ?? m; // some variants may place fields at root
//       const offerId = offer?.offerId ?? offer?.sku ?? offer?.id;
//       if (offerId == null) continue;
//       const barcodes = Array.isArray(offer?.barcodes) ? offer.barcodes : [];
//       const name = offer?.name;
//       const priceValue = Number(offer?.basicPrice?.value ?? 0);
//       out.push({ offerId: String(offerId), name, barcodes, priceValue });
//     }
//     return out;
//   };

//   const qtyOffers = extractQuantityOffers(yandexQuantity);
//   const yandexMappings = extractYandexMappings(yandexProducts);

//   // Build maps
//   const quantityMap = new Map();
//   for (const offer of qtyOffers) {
//     const availableStock = offer?.stocks?.find((s) => s?.type === "AVAILABLE");
//     const count = Number(availableStock?.count ?? 0);
//     const key = offer?.offerId ?? offer?.sku ?? offer?.id;
//     if (key != null) quantityMap.set(String(key), count);
//   }

//   // Build barcode -> yandex mapping
//   const barcodeToYandex = new Map();
//   for (const m of yandexMappings) {
//     for (const bc of m.barcodes) {
//       if (bc) barcodeToYandex.set(String(bc), m);
//     }
//   }

//   // Merge only if Billz barcode exists in Yandex; skip otherwise
//   const merged = [];
//   for (const p of Array.isArray(products) ? products : []) {
//     const sku = p?.sku ?? p?.offerId ?? p?.id;
//     const billzBarcode = p?.barcode ? String(p.barcode).trim() : undefined;
//     if (!billzBarcode) continue;

//     const yandexInfo = barcodeToYandex.get(billzBarcode);
//     if (!yandexInfo?.offerId) continue; // skip if not found in Yandex by barcode

//     const offerId = String(yandexInfo.offerId);
//     const count = quantityMap.get(offerId) ?? 0;
//     // barcode: prefer Billz, else first Yandex barcode
//     const outBarcode = billzBarcode || yandexInfo.barcodes?.[0] || undefined;
//     const name = yandexInfo.name ?? p?.name;
//     const price = yandexInfo.priceValue ?? 0;

//     // Billz-specific fields
//     // Use only values for the TOPAR.UZ shop
//     const TARGET_SHOP = "TOPAR.UZ";
//     const billzCount = Array.isArray(p?.shop_measurement_values)
//       ? p.shop_measurement_values
//           .filter((v) => (v?.shop_name || "").trim() === TARGET_SHOP)
//           .reduce((sum, v) => sum + Number(v?.active_measurement_value ?? 0), 0)
//       : 0;
//     const billzPrice = (() => {
//       const arr = Array.isArray(p?.shop_prices) ? p.shop_prices : [];
//       const toparOnly = arr.filter((x) => (x?.shop_name || "").trim() === TARGET_SHOP);
//       const pick = toparOnly.find((x) => x && x.retail_price != null) ?? toparOnly[0];
//       return Number(pick?.retail_price ?? 0);
//     })();

//     merged.push({
//       offerId,
//       barcode: outBarcode,
//       name,
//       count,
//       price,
//       billzCount,
//       billzPrice,
//     });
//   }

//   return merged;
// }

export function mergeProducts(billzProducts, yandexProducts, yandexQuantity) {
  // ---------- Yandex quantity (ombor) ma'lumotlarini ajratib olish
  const extractQuantityOffers = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) {
      if (input.length && Array.isArray(input[0]?.offers)) {
        const out = [];
        for (const wh of input) if (Array.isArray(wh?.offers)) out.push(...(wh.offers));
        return out;
      }
      if (input.length && (input[0]?.offerId != null || input[0]?.sku != null || input[0]?.id != null)) {
        return input;
      }
    }
    const warehouses = input?.result?.warehouses;
    if (Array.isArray(warehouses)) return extractQuantityOffers(warehouses);
    const offers = input?.result?.offers;
    if (Array.isArray(offers)) return offers;
    return [];
  };

  // ---------- Yandex mapping (offerId, name, barcodes, price) ni ajratib olish
  const extractYandexMappings = (input) => {
    const out = [];
    if (!input) return out;
    const items = Array.isArray(input)
      ? input
      : Array.isArray(input?.result?.offerMappings)
      ? input.result.offerMappings
      : Array.isArray(input?.result?.offers)
      ? input.result.offers
      : Array.isArray(input?.result?.items)
      ? input.result.items
      : [];

    for (const m of items) {
      const offer = m?.offer ?? m;
      const offerId = offer?.offerId ?? offer?.sku ?? offer?.id;
      if (offerId == null) continue;
      out.push({
        offerId: String(offerId),
        name: offer?.name,
        barcodes: Array.isArray(offer?.barcodes) ? offer.barcodes : [],
        priceValue: Number(offer?.basicPrice?.value ?? 0),
      });
    }
    return out;
  };

  // ---------- Yandex’ning quantity xaritasi: offerId -> AVAILABLE count
  const qtyOffers = extractQuantityOffers(yandexQuantity);
  const quantityMap = new Map();
  for (const offer of qtyOffers) {
    const key = String(offer?.offerId ?? offer?.sku ?? offer?.id ?? "");
    const availableStock = offer?.stocks?.find((s) => s?.type === "AVAILABLE");
    const count = Number(availableStock?.count ?? 0);
    if (key) quantityMap.set(key, count);
  }

  // ---------- Billz ni barcode -> BillzProduct xaritasi (filtrlashsiz)
  const billzByBarcode = new Map();
  for (const p of Array.isArray(billzProducts) ? billzProducts : []) {
    const bc = (p?.barcode ?? "").toString().trim();
    if (!bc) continue;
    if (!billzByBarcode.has(bc)) billzByBarcode.set(bc, p);
  }

  // ---------- Yandex → Billz moslash
  const yMappings = extractYandexMappings(yandexProducts);
  const TARGET_SHOP = "topar.uz";
  const isTargetShop = (name) =>
    (name ?? "").toString().toLowerCase().includes(TARGET_SHOP);
  const merged = [];

  for (const y of yMappings) {
    const offerId = y.offerId;
    const yCount = quantityMap.get(offerId) ?? 0;      // Yandex quantity
    const yPrice = Number(y.priceValue ?? 0);          // Yandex price
    const yBarcodes = Array.isArray(y.barcodes) ? y.barcodes.filter(Boolean) : [];

    // Billz bilan barcode bo'yicha moslashtirish
    let matchedBillz = null;
    let chosenBarcode = yBarcodes[0] ?? undefined;
    for (const bc of yBarcodes) {
      if (billzByBarcode.has(String(bc))) {
        matchedBillz = billzByBarcode.get(String(bc));
        chosenBarcode = bc;
        break;
      }
    }

    // Billz count/price (faqat TARGET_SHOP bo'yicha)
    let billzCount = 0;
    let billzPrice = 0;

    if (matchedBillz) {
      if (Array.isArray(matchedBillz.shop_measurement_values)) {
        billzCount = matchedBillz.shop_measurement_values
          .filter((v) => isTargetShop(v?.shop_name))
          .reduce((sum, v) => {
            const value = Number(
              v?.active_measurement_value ?? v?.activeMeasurementValue ?? 0
            );
            return Number.isFinite(value) ? sum + value : sum;
          }, 0);
      }
      if (Array.isArray(matchedBillz.shop_prices)) {
        const toparOnly = matchedBillz.shop_prices.filter((x) =>
          isTargetShop(x?.shop_name)
        );
        const pick = toparOnly.find((x) => x?.retail_price != null) ?? toparOnly[0];
        billzPrice = Number(pick?.retail_price ?? 0);
      }
    } else {
      // Billzda topilmagan — default 0
      billzCount = 0;
      billzPrice = 0;
    }

    // ❗️Talabga binoan: billzPrice <= 0 bo'lsa, bu obyektni ro'yxatga KIRITMAYMIZ
    if (!Number.isFinite(billzPrice) || billzPrice <= 0) {
      continue;
    }

    // Izohlar:
    // count  -> Yandex’dan (AVAILABLE)
    // price  -> Yandex’dan (basicPrice.value)
    // billzCount -> Billz’dan (TOPAR.UZ)
    // billzPrice -> Billz’dan (TOPAR.UZ). Agar 0 bo'lsa push qilinmaydi.

    merged.push({
      offerId,
      barcode: chosenBarcode,
      name: y.name,
      count: yCount,
      price: yPrice,
      billzCount,
      billzPrice,
    });
  }

  return merged;
}

export function mergeWithUzumProducts(billzProducts, syncProducts) {
  const result = [];
  const TARGET_SHOP = "topar.uz";

  const billzByBarcode = new Map();
  for (const product of Array.isArray(billzProducts) ? billzProducts : []) {
    const barcodeRaw = product?.barcode ?? product?.barcode_billz ?? null;
    if (barcodeRaw == null) continue;
    const barcode = String(barcodeRaw).trim();
    if (!barcode) continue;

    const measurementValues = Array.isArray(product?.shop_measurement_values)
      ? product.shop_measurement_values
      : [];
    const toparMeasurements = measurementValues.filter((entry) => {
      const name = (entry?.shop_name ?? "").toString().toLowerCase();
      return name.includes(TARGET_SHOP);
    });
    const needAmount = toparMeasurements.reduce((total, entry) => {
      const value = Number(entry?.active_measurement_value ?? entry?.activeMeasurementValue ?? 0);
      return Number.isFinite(value) ? total + value : total;
    }, 0);

    const priceEntries = Array.isArray(product?.shop_prices) ? product.shop_prices : [];
    const needPrice = (() => {
      for (const entry of priceEntries) {
        const name = (entry?.shop_name ?? "").toString().toLowerCase();
        if (!name.includes(TARGET_SHOP)) continue;
        const retailPrice = Number(entry?.retail_price ?? entry?.retailPrice ?? 0);
        if (Number.isFinite(retailPrice) && retailPrice > 0) {
          return retailPrice;
        }
      }
      return null;
    })();

    billzByBarcode.set(barcode, { needAmount, needPrice });
  }

  for (const syncItem of Array.isArray(syncProducts) ? syncProducts : []) {
    const barcodeRaw =
      syncItem?.barcode_uzum
    const barcode = barcodeRaw != null ? String(barcodeRaw).trim() : "";
    const matched = barcode ? billzByBarcode.get(barcode) : undefined;

    
    if (matched) {
      result.push({
        ...syncItem,
        needAmount: matched.needAmount ?? 0,
        needPrice: matched.needPrice,
      });
    } else {
      result.push({
        ...syncItem,
        needAmount: 0,
        needPrice: null,
      });
    }
  }

  return result;
}

/**
 * Separate products where Billz and Yandex values differ.
 * - Compares `count` vs `billzCount` and `price` vs `billzPrice`.
 * - Returns categorized buckets and a compact summary.
 * @param {Array<{count?:number,billzCount?:number,price?:number,billzPrice?:number}>} items
 * @param {{ epsilonCount?: number, epsilonPrice?: number }} [opts]
 */
export function separateBillzDifferences(items, opts = {}) {
  const epsilonCount = Number(opts.epsilonCount ?? 0);
  const epsilonPrice = Number(opts.epsilonPrice ?? 0);

  const normalize = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const differs = (a, b, eps) => Math.abs(normalize(a) - normalize(b)) > eps;

  const result = {
    bothMismatches: [],
    onlyCountMismatches: [],
    onlyPriceMismatches: [],
    matches: [],
    summary: { total: 0, both: 0, countOnly: 0, priceOnly: 0, matches: 0 },
  };

  for (const item of Array.isArray(items) ? items : []) {
    const countDiff = differs(item?.count, item?.billzCount, epsilonCount);
    const priceDiff = differs(item?.price, item?.billzPrice, epsilonPrice);

    if (countDiff && priceDiff) {
      result.bothMismatches.push(item);
    } else if (countDiff) {
      result.onlyCountMismatches.push(item);
    } else if (priceDiff) {
      result.onlyPriceMismatches.push(item);
    } else {
      result.matches.push(item);
    }
  }

  result.summary.total =
    result.bothMismatches.length +
    result.onlyCountMismatches.length +
    result.onlyPriceMismatches.length +
    result.matches.length;
  result.summary.both = result.bothMismatches.length;
  result.summary.countOnly = result.onlyCountMismatches.length;
  result.summary.priceOnly = result.onlyPriceMismatches.length;
  result.summary.matches = result.matches.length;

  return result;
}

/**
 * Returns two arrays: [countDifferences, priceDifferences].
 * An item appears in a bucket if that field differs beyond the epsilon threshold.
 * Items with both differences appear in both arrays. Original objects are preserved.
 * @param {Array<{count?:number,billzCount?:number,price?:number,billzPrice?:number}>} items
 * @param {{ epsilonCount?: number, epsilonPrice?: number }} [opts]
 * @returns {[any[], any[]]}
 */
export function splitDifferences(items, opts = {}) {
  const epsilonCount = Number(opts.epsilonCount ?? 0);
  const epsilonPrice = Number(opts.epsilonPrice ?? 0);
  const normalize = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const differs = (a, b, eps) => Math.abs(normalize(a) - normalize(b)) > eps;

  const countDiffs = [];
  const priceDiffs = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (differs(item?.count, item?.billzCount, epsilonCount))
      countDiffs.push(item);
    if (differs(item?.price, item?.billzPrice, epsilonPrice))
      priceDiffs.push(item);
  }

  return { countDiffs, priceDiffs };
}

export function splitDifferencesUzum(items) {
  const quantityDiffs = [];
  const priceDiffs = [];

  for (const item of Array.isArray(items) ? items : []) {
    const amount = Number(item?.amount ?? 0);
    const needAmount = Number(item?.needAmount ?? 0);
    if (Number.isFinite(amount) && Number.isFinite(needAmount) && amount !== needAmount) {
      quantityDiffs.push(item);
    }

    const price = Number(item?.price ?? 0);
    const needPrice = Number(item?.needPrice ?? 0);
    if (Number.isFinite(price) && Number.isFinite(needPrice) && price !== needPrice) {
      priceDiffs.push(item);
    }
  }

  return { quantityDiffs, priceDiffs };
}

