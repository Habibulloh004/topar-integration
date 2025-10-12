import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";
import { login } from "../auth/billz.auth.js";
import { isOlderThanDays, writeJSON, readJSON } from "../utils/helper.js";
import axios from "axios";

dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BILLZ_URL = (
  process.env.BILLZ_URL || "https://api-admin.billz.ai/v2"
).replace(/\/$/, "");
// Resolve to project src directory (one level up from service/)
const SRC_DIR = path.resolve(__dirname, "..");
const AUTH_STATE_FILE = path.join(SRC_DIR, "auth", "billz.auth.state.json");

export async function ensureBillzLoginIfStale() {
  const state = (await readJSON(AUTH_STATE_FILE)) || {};
  const lastLoginAt = state.lastLoginAt;
  if (isOlderThanDays(lastLoginAt, 5)) {
    try {
      const auth = await login();
      const nextState = {
        lastLoginAt: new Date().toISOString(),
        auth,
      };
      await writeJSON(AUTH_STATE_FILE, nextState);
      console.log("Billz login performed and state updated.");

      return auth.data.access_token;
    } catch (err) {
      console.error("Billz login attempt failed:", err.message || err);
    }
  } else {
    console.log("Billz auth is fresh; no login needed.");
    return state.auth.data.access_token;
  }
}

export async function getProducts(props) {
  let countOfData = 0;

  const request = await axios.get(`${BILLZ_URL}/products`, {
    headers: {
      Authorization: `Bearer ${props.token}`,
      "Content-Type": "application/json",
    },
  });
  console.log("First page fetched, total products:", request.data.count);
  countOfData = request.data.count;

  const product = await axios.get(`${BILLZ_URL}/products`, {
    headers: {
      Authorization: `Bearer ${props.token}`,
      "Content-Type": "application/json",
    },
    params: {
      limit: request.data.count,
    },
  });

  console.log(`Total products fetched: ${product.data.products.length}`);
  return product.data.products;
}

export async function deleteDuplicates() {
  const token = await ensureBillzLoginIfStale();
  const products = await getProducts({ token });
  const barcodeMap = new Map();

  // Barcode bo'yicha guruhlash
  for (const prod of products) {
    if (prod.barcode) {
      if (!barcodeMap.has(prod.barcode)) {
        barcodeMap.set(prod.barcode, []);
      }
      barcodeMap.get(prod.barcode).push(prod);
    } else {
      // Barcode yo'q bo'lsa unique
      barcodeMap.set(Symbol(), [prod]);
    }
  }

  const uniqueProducts = [];
  const duplicates = [];

  for (const group of barcodeMap.values()) {
    if (group.length === 1) {
      uniqueProducts.push(group[0]);
      continue;
    }
    // Eng katta active_measurement_value ni topamiz
    let maxIdx = 0;
    let maxValue = -Infinity;
    for (let i = 0; i < group.length; i++) {
      const prod = group[i];
      let val = 0;
      if (Array.isArray(prod.shop_measurement_values)) {
        val = Math.max(
          ...prod.shop_measurement_values.map(smv => smv.active_measurement_value || 0)
        );
      }
      if (val > maxValue) {
        maxValue = val;
        maxIdx = i;
      }
    }
    uniqueProducts.push(group[maxIdx]);
    // Qolganlarini duplicates ga
    group.forEach((prod, idx) => {
      if (idx !== maxIdx) duplicates.push(prod);
    });
  }

  console.log(`Unique products: ${uniqueProducts.length}, duplicates: ${duplicates.length}`);
  return { uniqueProducts, duplicates };
}