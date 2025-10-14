import { config as dotenvConfig } from "dotenv";
import axios from "axios";

dotenvConfig();

const UZUM_URL = (
  process.env.UZUM_URL || "https://api-seller.uzum.uz/api/seller-openapi"
).replace(/\/$/, "");

const uzumSecretKey = process.env.UZUM_SECRET_KEY;

export async function getUzumProducts() {
  try {
    let uzumProducts = [];
    let page = 0;
    const size = 200;

    // birinchi request
    const firstRes = await axios.get(`${UZUM_URL}/v1/product/shop/254`, {
      headers: {
        Authorization: uzumSecretKey, // agar kerak bo‘lsa "Bearer " qo‘shiladi
        "Content-Type": "application/json",
      },
      params: {
        size,
        page,
      },
    });

    const totalProductsAmount = firstRes.data.totalProductsAmount;
    const totalPages = Math.ceil(totalProductsAmount / size);

    console.log("Total products:", totalProductsAmount);
    console.log("Total pages:", totalPages);

    // birinchi sahifadagi productlarni qo‘shib qo‘yish
    uzumProducts.push(...(firstRes.data.productList || []));

    // qolgan sahifalarni olish
    // for (page = 1; page <= totalPages; page++) {
    //   const res = await axios.get(`${UZUM_URL}/v1/product/shop/254`, {
    //     headers: {
    //       Authorization: uzumSecretKey,
    //       "Content-Type": "application/json",
    //     },
    //     params: {
    //       size,
    //       page,
    //     },
    //   });

    //   console.log(`Fetched page ${page}, items: ${res.data.productList?.length || 0}`);
    //   uzumProducts.push(...(res.data.productList || []));
    // }

    console.log(`Uzum mappings: fetched ${uzumProducts.length} items in total.`);
    if (uzumProducts.length !== totalProductsAmount) {
      console.warn("Warning: fetched products count does not match totalProductsAmount!");
      return { uzumProducts, warning: "Fetched count mismatch" };
    } else {
      return { uzumProducts };
    }
  } catch (error) {
    console.error("Error fetching products:", error.response?.data || error);
    throw error;
  }
}

export async function getUzumStocks() {
  try {
    const stockrResponse = await axios.get(`${UZUM_URL}/v2/fbs/sku/stocks`, {
      headers: {
        Authorization: uzumSecretKey, // agar kerak bo‘lsa "Bearer " qo‘shiladi
        "Content-Type": "application/json",
      },
    });
    return stockrResponse.data?.payload?.skuAmountList || [];
  } catch (error) {
    console.error("Error fetching stocks:", error.response?.data || error);
    throw error;
  }
}

export function combineUzumSkuAndStock(skuItems = [], stock = []) {
  const stockBySkuId = new Map();
  const stockByBarcode = new Map();

  for (const stockItem of stock) {
    if (stockItem?.skuId != null) {
      stockBySkuId.set(Number(stockItem.skuId), stockItem);
    }
    if (stockItem?.barcode != null) {
      stockByBarcode.set(String(stockItem.barcode), stockItem);
    }
  }

  return skuItems.reduce((acc, skuItem) => {
    const skuId = skuItem?.skuId ?? skuItem?.id ?? null;
    const barcodeRaw =
      skuItem?.barcode ?? skuItem?.skuBarcode ?? skuItem?.ean ?? null;
    const barcode = barcodeRaw != null ? String(barcodeRaw) : null;

    const matchedStock =
      (skuId != null && stockBySkuId.get(Number(skuId))) ||
      (barcode != null && stockByBarcode.get(barcode));

    if (!matchedStock) {
      return acc;
    }

    const priceValue =
      skuItem?.price != null ? Number(skuItem.price) : null;

    acc.push({
      skuId,
      barcode: barcode ?? String(matchedStock.barcode ?? ""),
      productTitle:
        skuItem?.productTitle ??
        skuItem?.skuFullTitle ??
        matchedStock?.productTitle ??
        "",
      amount: Number(matchedStock.amount ?? 0),
      price: priceValue,
      sku_title:
        skuItem?.sku_title ??
        skuItem?.skuFullTitle ??
        skuItem?.skuTitle ??
        null,
      product_id:
        skuItem?.product_id ??
        skuItem?.productId ??
        matchedStock?.productId ??
        null,
    });

    return acc;
  }, []);
}

const normalizeSkuKey = (value) => {
  if (value == null) return null;
  const num = Number(value);
  if (Number.isFinite(num)) {
    return String(Math.trunc(num));
  }
  const str = String(value).trim();
  return str.length > 0 ? str : null;
};

/**
 * Compare Uzum collect data with Billz products.
 * @param {Array<Object>} collectData
 * @param {Array<Object>} billzProducts
 * @returns {{both: Array<{uzum: Object, billz: Object}>, onlyUzum: Array<Object>}}
 */
export function compareCollectWithBillz(collectData = [], billzProducts = []) {
  const billzByBarcode = new Map();
  const billzBySku = new Map();

  for (const product of Array.isArray(billzProducts) ? billzProducts : []) {
    const barcode = product?.barcode != null ? String(product.barcode) : null;
    if (barcode && !billzByBarcode.has(barcode)) {
      billzByBarcode.set(barcode, product);
    }

    const candidates = [
      product?.skuId,
      product?.sku_id,
      product?.sku,
      product?.id,
      product?.product_id,
      product?.productId,
      product?.external_id,
    ];
    for (const candidate of candidates) {
      const key = normalizeSkuKey(candidate);
      if (key && !billzBySku.has(key)) {
        billzBySku.set(key, product);
      }
    }
  }

  const both = [];
  const onlyUzum = [];

  for (const uzumItem of Array.isArray(collectData) ? collectData : []) {
    const barcodeValue =
      uzumItem?.barcode_uzum ??
      uzumItem?.barcode ??
      uzumItem?.skuBarcode ??
      null;
    const barcode = barcodeValue != null ? String(barcodeValue) : null;
    const skuKey = normalizeSkuKey(uzumItem?.skuId);

    const matched =
      (barcode && billzByBarcode.get(barcode)) ||
      (skuKey && billzBySku.get(skuKey));

    const normalizedItem = {
      ...uzumItem,
      barcode_uzum: barcode ?? null,
    };
    if ("barcode" in normalizedItem) {
      delete normalizedItem.barcode;
    }

    if (matched) {
      both.push(normalizedItem);
    } else {
      onlyUzum.push(normalizedItem);
    }
  }

  return { both, onlyUzum };
}

/**
 * Sync Uzum-only items into MongoDB `products` collection.
 * Inserts new SKUs and updates existing ones by skuId.
 * @param {import("mongodb").Db} database
 * @param {Array<Object>} items
 * @returns {Promise<{inserted:number, updated:number}>}
 */
export async function syncUzumOnlyProducts(database, items = []) {
  if (!database) {
    throw new Error("syncUzumOnlyProducts: database instance is required");
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const collection = database.collection("products");

  const existingDocs = await collection
    .find({}, { projection: { skuId: 1 } })
    .toArray();
  const existingSkuIds = new Set(existingDocs.map((doc) => doc.skuId));

  const toInsert = [];
  const bulkOps = [];

  for (const item of items) {
    if (!item?.skuId) continue;
    if (existingSkuIds.has(item.skuId)) {
      bulkOps.push({
        updateOne: {
          filter: { skuId: item.skuId },
          update: { $set: item },
        },
      });
    } else {
      toInsert.push(item);
    }
  }

  let inserted = 0;
  let updated = 0;

  if (toInsert.length > 0) {
    const insertResult = await collection.insertMany(toInsert);
    inserted = insertResult.insertedCount ?? toInsert.length;
  }

  if (bulkOps.length > 0) {
    const bulkResult = await collection.bulkWrite(bulkOps);
    updated = bulkResult.modifiedCount ?? 0;
  }

  return { inserted, updated };
}

export async function changeUzumProductCount(data) {
  
  try {
    const response = await axios.post(`${UZUM_URL}/v2/fbs/sku/stock`, data, {
      headers: {
        Authorization: uzumSecretKey, // agar kerak bo‘lsa "Bearer " qo‘shiladi
        "Content-Type": "application/json",
      },
    });
    return response.data; 
  } catch (error) {
    
  }
}