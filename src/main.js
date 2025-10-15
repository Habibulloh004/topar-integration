import { deleteDuplicates } from "./service/billz.service.js";
import { createApp } from "./server/simpleApp.js";
import { registerProductTableRoutes } from "./routes/productTable.routes.js";
import {
  changeYandexProductCount,
  changeYandexProductPrice,
  getYandexProducts,
  getYandexProductsQuantity,
} from "./service/yandex.service.js";
import {
  mergeProducts,
  mergeWithUzumProducts,
  splitDifferences,
  splitDifferencesUzum,
} from "./utils/helper.js";
import {
  getUzumProducts,
  getUzumStocks,
  combineUzumSkuAndStock,
  compareCollectWithBillz,
  syncUzumOnlyProducts,
  changeUzumProductCount,
  changeUzumProductPrices,
} from "./service/uzum.service.js";
import db, { getDB } from "./service/db.service.js";

const app = createApp();
let billzProducts = [];
let billzFetchPromise = null;

registerProductTableRoutes(app, {
  getBillzProducts: () => billzProducts,
});

async function loadBillzProducts() {
  if (billzFetchPromise) {
    return billzFetchPromise;
  }

  const currentFetch = (async () => {
    try {
      const { uniqueProducts } = await deleteDuplicates();
      if (Array.isArray(uniqueProducts) && uniqueProducts.length > 0) {
        console.log(`Billz products fetched: ${uniqueProducts.length}`);
        return uniqueProducts;
      }
      console.warn(
        "Billz products API returned no records, reusing previous cache."
      );
    } catch (error) {
      console.error("Failed to load Billz products:", error?.message || error);
    }

    return Array.isArray(billzProducts) ? [...billzProducts] : [];
  })();

  billzFetchPromise = currentFetch;

  currentFetch
    .catch(() => {})
    .finally(() => {
      if (billzFetchPromise === currentFetch) {
        billzFetchPromise = null;
      }
    });

  return currentFetch;
}

async function runBillzAndUzum(database, sourceBillzProducts) {
  const billzList = Array.isArray(sourceBillzProducts)
    ? sourceBillzProducts
    : [];

  const [stock, uzumProductsResponse] = await Promise.all([
    getUzumStocks(),
    getUzumProducts(),
  ]);

  const uzumProducts = uzumProductsResponse?.uzumProducts ?? [];
  const filteredUzumProducts = uzumProducts.flatMap((product) => {
    if (!Array.isArray(product?.skuList)) return [];
    return product.skuList.map((skuItem) => ({
      ...skuItem,
      product_id:
        skuItem?.productId ?? product?.productId ?? skuItem?.product_id ?? null,
    }));
  });

  const collectData = combineUzumSkuAndStock(filteredUzumProducts, stock);
  const collectComparison = compareCollectWithBillz(collectData, billzList);

  const syncResult = await syncUzumOnlyProducts(
    database,
    collectComparison.onlyUzum
  );

  const existingBillzLinked = await database
    .collection("products")
    .find({ barcode_billz: { $exists: true, $ne: null } })
    .toArray();

  const syncProduct = [...collectComparison.both, ...existingBillzLinked];
  const mergeProds = mergeWithUzumProducts(billzList, syncProduct);
  const divideForTopic = splitDifferencesUzum(mergeProds);

  const syncUzumCount = await changeUzumProductCount(
    divideForTopic.quantityDiffs
  );
  const syncUzumPrice = await changeUzumProductPrices(
    divideForTopic.priceDiffs
  );

  console.log(
    `Uzum sync → merged:${mergeProds.length}, quantityDiffs:${divideForTopic.quantityDiffs.length}, priceDiffs:${divideForTopic.priceDiffs.length}, inserted:${syncResult.inserted}, updated:${syncResult.updated}`
  );

  return {
    mergeTotal: mergeProds.length,
    quantityDiffs: divideForTopic.quantityDiffs.length,
    priceDiffs: divideForTopic.priceDiffs.length,
    syncResult,
    syncUzumCount,
    syncUzumPrice,
  };
}

async function runBillzAndYandex(sourceBillzProducts) {
  const billzList = Array.isArray(sourceBillzProducts)
    ? sourceBillzProducts
    : [];

  const [productsQuantity, yandexProducts] = await Promise.all([
    getYandexProductsQuantity(),
    getYandexProducts(),
  ]);

  const mergedProducts = mergeProducts(
    billzList,
    yandexProducts,
    productsQuantity
  );
  const separate = splitDifferences(mergedProducts);

  const [countSync, priceSync] = await Promise.all([
    changeYandexProductCount(separate),
    changeYandexProductPrice(separate),
  ]);

  console.log(
    `Yandex sync → merged:${mergedProducts.length}, countDiffs:${separate.countDiffs.length}, priceDiffs:${separate.priceDiffs.length}`
  );

  return {
    mergedTotal: mergedProducts.length,
    countDiffs: separate.countDiffs.length,
    priceDiffs: separate.priceDiffs.length,
    countSync,
    priceSync,
  };
}

// Run both sync flows independently, retrying 10 minutes after each completion.
const RETRY_DELAY_MS = 10 * 60 * 1000;

let yandexTimerId = null;
let isYandexRunning = false;
function scheduleYandexLoop(delay = RETRY_DELAY_MS) {
  if (yandexTimerId) {
    clearTimeout(yandexTimerId);
  }
  yandexTimerId = setTimeout(runYandexLoop, delay);
}
async function runYandexLoop() {
  if (isYandexRunning) {
    console.warn("Billz ↔ Yandex sync already running; skipping new start.");
    scheduleYandexLoop(RETRY_DELAY_MS);
    return;
  }
  isYandexRunning = true;
  try {
    const billzList = await loadBillzProducts();
    billzProducts = [...billzList];
    const result = await runBillzAndYandex(billzList);
    console.log("Billz ↔ Yandex sync completed.", result);
  } catch (err) {
    console.error("Billz ↔ Yandex sync failed:", err);
  } finally {
    isYandexRunning = false;
    scheduleYandexLoop(RETRY_DELAY_MS);
  }
}

let uzumTimerId = null;
let isUzumRunning = false;
function scheduleUzumLoop(delay = RETRY_DELAY_MS) {
  if (uzumTimerId) {
    clearTimeout(uzumTimerId);
  }
  uzumTimerId = setTimeout(runUzumLoop, delay);
}
async function runUzumLoop() {
  if (isUzumRunning) {
    console.warn("Billz ↔ Uzum sync already running; skipping new start.");
    scheduleUzumLoop(RETRY_DELAY_MS);
    return;
  }
  isUzumRunning = true;
  try {
    const [database, billzList] = await Promise.all([
      getDB(),
      loadBillzProducts(),
    ]);
    billzProducts = [...billzList];
    const result = await runBillzAndUzum(database, billzList);
    console.log("Billz ↔ Uzum sync completed.", result);
  } catch (err) {
    console.error("Billz ↔ Uzum sync failed:", err);
  } finally {
    isUzumRunning = false;
    scheduleUzumLoop(RETRY_DELAY_MS);
  }
}

// scheduleYandexLoop(0);
scheduleUzumLoop(0);

const PORT = Number(process.env.PORT || 3000);
app.listen(3001, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing database...");
  await db.closePool();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing database...");
  await db.closePool();
  process.exit(0);
});
