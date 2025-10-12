import {
  deleteDuplicates,
  ensureBillzLoginIfStale,
  getProducts,
} from "./service/billz.service.js";
import deepFilter from "./utils/deepFilter.js";
import { createApp } from "./server/simpleApp.js";
import {
  changeYandexProductCount,
  changeYandexProductPrice,
  getYandexProducts,
  getYandexProductsQuantity,
} from "./service/yandex.service.js";
import { mergeProducts, splitDifferences } from "./utils/helper.js";
import {
  getUzumProducts,
  getUzumStocks,
  combineUzumSkuAndStock,
} from "./service/uzum.service.js";

const app = createApp();

async function main() {
  const stock = await getUzumStocks();
  console.log("Uzum stocks:", stock.length);

  app.get("/stock", (req, res) => {
    res.json(stock);
  });
  const uzumProducts = await getUzumProducts();
  const filteredUzumProducts = (uzumProducts.uzumProducts || []).flatMap(
    (product) => (Array.isArray(product.skuList) ? product.skuList : [])
  );
  console.log("Filtered Uzum products with SKUs:", filteredUzumProducts.length);
  console.log("Uzum products fetched:", uzumProducts.uzumProducts.length);

  const collectData = combineUzumSkuAndStock(filteredUzumProducts, stock);
  app.get("/collectdata", (req, res) => {
    res.json(collectData);
  });

  console.log("Collected data items:", collectData.length);


  // app.get("/more", (req, res) => {
  //   const expandedSkuItems = (uzumProducts.uzumProducts || [])
  //     .filter(
  //       (product) => Array.isArray(product.skuList) && product.skuList.length > 1
  //     )
  //     // .flatMap((product) =>
  //     //   product.skuList.map((skuItem) => ({
  //     //     productId: product.productId,
  //     //     productTitle: product.title,
  //     //     skuId: skuItem.skuId ?? skuItem.id,
  //     //     skuTitle: skuItem.title ?? skuItem.skuTitle ?? product.skuTitle,
  //     //     previewImg:
  //     //       skuItem.previewImg ?? skuItem.image ?? product.previewImg ?? null,
  //     //     image: skuItem.image ?? product.image ?? null,
  //     //     price: skuItem.price ?? product.price ?? null,
  //     //     sku: skuItem,
  //     //   }))
  //     // );

  //   res.json(expandedSkuItems);
  // });

  app.get("/filteruzum", (req, res) => {
    res.json(filteredUzumProducts);
  });

  app.get("/collect", (req, res) => {
    res.json(collectData);
  });

  app.get("/uzum", (req, res) => {
    res.json(uzumProducts);
  });

  return;
  const { uniqueProducts: products, duplicates } = await deleteDuplicates();
  app.get("/duplicate", (req, res) => {
    res.json(duplicates);
  });
  app.get("/unique", (req, res) => {
    res.json(products);
  });
  app.get("/nq", (req, res) => {
    const query = req.query.q;
    const find = products.find((p) => p.barcode == query) || null;
    res.json(find);
  });

  // return;
  const [productsQuantity, yandexProducts] = await Promise.all([
    getYandexProductsQuantity(),
    getYandexProducts(),
  ]);

  app.get("/yfq", (req, res) => {
    const query = req.query.q;
    const find =
      yandexProducts.find((p) => p.offer.barcodes[0] == query) || null;
    res.json(find);
  });
  app.get("/prdqtty", (req, res) => {
    res.json(productsQuantity);
  });
  app.get("/yfquan", (req, res) => {
    const query = req.query.q;
    const find = productsQuantity.find((p) => p.offerId == query) || null;
    res.json(find);
  });

  const normalize = (s) =>
    String(s || "")
      .trim()
      .toLowerCase();

  const combineFilter = [
    ...deepFilter(products, (v) => normalize(v) === "klasstovar"), // global match
    ...deepFilter(
      products,
      "custom_fields.custom_field_value",
      (v) => normalize(v) === "klasstovar"
    ),
    ...deepFilter(
      products,
      "suppliers.name",
      (v) => normalize(v) === "klasstovar"
    ),
  ].filter(
    (product, i, arr) =>
      arr.findIndex((p) => p.barcode === product.barcode) === i
  );

  const filteredProducts = deepFilter(
    combineFilter,
    "shop_measurement_values.shop_name",
    "TOPAR.UZ"
  );

  app.get("/mq", (req, res) => {
    const query = req.query.q;
    const find = filteredProducts.find((p) => p.barcode == query) || null;
    res.json(find);
  });
  app.get("/filterProducts", (req, res) => {
    const query = req.query.limit || 20;
    const filtered = filteredProducts.slice(0, query);
    res.json(filtered);
  });

  const mergedProducts = mergeProducts(
    products,
    yandexProducts,
    productsQuantity
  );

  console.log("Merged products:", mergedProducts.length);
  const separate = splitDifferences(mergedProducts);
  app.get("/mer", (req, res) => {
    res.json(mergedProducts);
  });
  app.get("/sep", (req, res) => {
    res.json(separate);
  });

  const [countSync, priceSync] = await Promise.all([
    changeYandexProductCount(separate),
    changeYandexProductPrice(separate),
  ]);

  // app.get("/separate", (req, res) => {
  //   res.json(separate);
  // });
  // app.get("/products", (req, res) => {
  //   res.json(filteredProducts);
  // });
  app.get("/yandex-products", (req, res) => {
    res.json(yandexProducts);
  });
  // app.get("/yfq", (req, res) => {
  //   const query = req.query.q;
  //   const find = yandexProducts.find((p) => p.barcode == query) || null;
  //   res.json(find);
  // });
  console.log("Count sync result:", countSync);
  console.log("Price sync result:", priceSync);
}

// Schedule main to run first after 1 hour, then every hour.
const ONE_HOUR_MS = 10 * 60 * 1000;
let isRunning = false;
async function runMainSafely() {
  if (isRunning) {
    console.warn("Scheduled main skipped: previous run still in progress.");
    return;
  }
  isRunning = true;
  try {
    await main();
  } catch (err) {
    console.error("Scheduled main failed:", err);
  } finally {
    isRunning = false;
  }
}

main();

// setTimeout(() => {
//   runMainSafely();
//   setInterval(runMainSafely, ONE_HOUR_MS);
// }, ONE_HOUR_MS);

const PORT = Number(process.env.PORT || 3000);
app.listen(3001, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
