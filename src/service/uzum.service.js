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
    });

    return acc;
  }, []);
}
