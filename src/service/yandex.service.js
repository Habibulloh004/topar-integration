import { config as dotenvConfig } from "dotenv";
import axios from "axios";

dotenvConfig();

const YANDEX_CAMPAIGN_URL = (
  process.env.YANDEX_CAMPAIGN_URL ||
  "https://api.partner.market.yandex.ru/campaigns/140716134"
).replace(/\/$/, "");

const YANDEX_BUSINESS_URL = (
  process.env.YANDEX_BUSINESS_URL ||
  "https://api.partner.market.yandex.ru/businesses/193476962"
).replace(/\/$/, "");

export async function getYandexProducts(params) {
  try {
    const items = [];
    let nextPageToken = undefined;

    do {
      const response = await axios.post(
        `${YANDEX_BUSINESS_URL}/offer-mappings`,
        {},
        {
          headers: {
            "Api-Key":
              process.env.YANDEX_SECRET_KEY ||
              "ACMA:9en1ymfIMQf1NcAuCTYwCCdhWtb54qwiDDj0Cwvt:ae9bc307",
            "Content-Type": "application/json",
          },
          params: {
            limit: 200,
            ...(nextPageToken ? { page_token: nextPageToken } : {}),
            ...params,
          },
          timeout: 30_000,
        }
      );

      const result = response?.data?.result ?? {};
      const pageItems = Array.isArray(result?.offerMappings)
        ? result.offerMappings
        : Array.isArray(result?.offers)
        ? result.offers
        : Array.isArray(result?.items)
        ? result.items
        : [];
      items.push(...pageItems);

      nextPageToken = result?.paging?.nextPageToken;
    } while (nextPageToken);

    console.log(`Yandex mappings: fetched ${items.length} items in total.`);
    return items;
  } catch (error) {
    console.error("Error fetching products:", error);
    throw error;
  }
}

export async function getYandexProductsQuantity(params) {
  try {
    const offers = [];
    let nextPageToken = undefined;

    do {
      const response = await axios.post(
        `${YANDEX_CAMPAIGN_URL}/offers/stocks`,
        {},
        {
          headers: {
            "Api-Key":
              process.env.YANDEX_SECRET_KEY ||
              "ACMA:9en1ymfIMQf1NcAuCTYwCCdhWtb54qwiDDj0Cwvt:ae9bc307",
            "Content-Type": "application/json",
          },
          params: {
            limit: 200,
            ...(nextPageToken ? { page_token: nextPageToken } : {}),
            ...params,
          },
          timeout: 30_000,
        }
      );

      const warehouses = response?.data?.result?.warehouses || [];
      // warehouses is an array, each with an offers array; flatten
      // Normalize: if an offer has empty/missing stocks, ensure AVAILABLE:0
      for (const wh of warehouses) {
        if (!Array.isArray(wh?.offers)) continue;
        for (const offer of wh.offers) {
          const stocks = Array.isArray(offer?.stocks) ? offer.stocks : [];
          const normalizedStocks = stocks.length > 0 ? stocks : [{ type: "AVAILABLE", count: 0 }];
          offers.push({ ...offer, stocks: normalizedStocks });
        }
      }

      nextPageToken = response?.data?.result?.paging?.nextPageToken;
    } while (nextPageToken);

    console.log(`Yandex stocks: fetched ${offers.length} offers in total.`);
    return offers;
  } catch (error) {
    console.error("Error fetching products quantity:", error);
    throw error;
  }
}

export async function getYandexProductsPrice(params) {
  try {
    const offers = [];
    let nextPageToken = undefined;

    do {
      const response = await axios.post(
        `${YANDEX_CAMPAIGN_URL}/offer-prices`,
        {},
        {
          headers: {
            "Api-Key":
              process.env.YANDEX_SECRET_KEY ||
              "ACMA:9en1ymfIMQf1NcAuCTYwCCdhWtb54qwiDDj0Cwvt:ae9bc307",
            "Content-Type": "application/json",
          },
          params: {
            limit: 200,
            ...(nextPageToken ? { page_token: nextPageToken } : {}),
            ...params,
          },
          timeout: 30_000,
        }
      );

      const pageOffers = response?.data?.result?.offers || [];
      offers.push(...pageOffers);
      nextPageToken = response?.data?.result?.paging?.nextPageToken;
    } while (nextPageToken);

    console.log(`Yandex prices: fetched ${offers.length} offers in total.`);
    return offers;
  } catch (error) {
    console.error("Error fetching products price:", error);
    throw error;
  }
}

export async function changeYandexProductCount(products) {
  // Accept either an array of items or an object { countDiffs }
  const source = Array.isArray(products) ? products : products?.countDiffs || [];
  // Batch size for quantity updates (default 2000)
  const BATCH_SIZE = Number(process.env.YANDEX_STOCKS_BATCH_SIZE || 2000);

  const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  try {
    // simple retry helper with backoff
    const sendWithRetries = async (payload, attempt = 1) => {
      try {
        const response = await axios.put(
          `${YANDEX_CAMPAIGN_URL}/offers/stocks`,
          payload,
          {
            headers: {
              "Api-Key":
                process.env.YANDEX_SECRET_KEY ||
                "ACMA:9en1ymfIMQf1NcAuCTYwCCdhWtb54qwiDDj0Cwvt:ae9bc307",
              "Content-Type": "application/json",
            },
          }
        );
        return { ok: true, data: response.data };
      } catch (err) {
        const status = err?.response?.status;
        const isRetryable = status === 429 || (status >= 500 && status < 600);
        if (isRetryable && attempt < 3) {
          const delayMs = 500 * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, delayMs));
          return sendWithRetries(payload, attempt + 1);
        }
        return { ok: false, error: err, data: err?.response?.data };
      }
    };
    // Build payload items upfront and filter invalids
    const skus = source
      .map((element) => {
        const offerId = element?.offerId ?? element?.sku ?? element?.id;
        const count = Number(element?.billzCount);
        if (!offerId || !Number.isFinite(count)) return null;
        return {
          sku: String(offerId),
          items: [{ count }],
        };
      })
      .filter(Boolean);

    // Deduplicate by `sku`; last occurrence wins
    const bySku = new Map();
    for (const s of skus) bySku.set(s.sku, s);
    const uniqueSkus = Array.from(bySku.values());

    const chunks = chunk(uniqueSkus, BATCH_SIZE);
    const results = [];
    const failed = [];
    for (let idx = 0; idx < chunks.length; idx++) {
      const sendingObj = { skus: chunks[idx] };
      const res = await sendWithRetries(sendingObj);
      if (res.ok) {
        console.log(
          `Yandex stocks batch ${idx + 1}/${chunks.length} updated successfully.`
        );
        results.push(res.data);
      } else {
        console.error(
          `Yandex stocks batch ${idx + 1}/${chunks.length} failed:`,
          res.error?.message || res.data || res.error
        );
        failed.push({ batch: idx + 1, payloadCount: sendingObj.skus.length, error: res.data || res.error?.message || String(res.error) });
      }
      // tiny pause to avoid bursts
      if (idx < chunks.length - 1) await new Promise((r) => setTimeout(r, 100));
    }

    return { batches: chunks.length, results, failed };
  } catch (error) {
    console.error("Error updating Yandex product count:", error);
    throw error;
  }
}

export async function changeYandexProductPrice(products) {
  // Accept either an array of items or an object { priceDiffs }
  const source = Array.isArray(products) ? products : products?.priceDiffs || [];

  // Use your campaign/business currency; default to RUR unless you override via env
  const CURRENCY = process.env.YANDEX_CURRENCY || "UZS";

  // Batch size for price updates (default 500)
  const BATCH_SIZE = Number(process.env.YANDEX_PRICES_BATCH_SIZE || 500);

  const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  // --- Build a clean, validated payload (no zero/NaN/negative) ---
  // If billzPrice <= 0, try to fallback to current Yandex price (item.price); else skip.
  const skipped = {
    missingOfferId: [],
    nonFinite: [],
    nonPositiveBoth: [],  // billzPrice<=0 and yandex price<=0 or absent
    dedupOverwritten: [],
  };

  const byOffer = new Map(); // offerId -> { offerId, price: { value, currencyId } }

  for (const el of source) {
    const offerId = el?.offerId ?? el?.sku ?? el?.id;
    if (!offerId) { skipped.missingOfferId.push(el); continue; }

    const billzPrice = Number(el?.billzPrice);
    const yandexPrice = Number(el?.price); // your mergedProducts keeps current Y price in `price`

    let chosen = Number.isFinite(billzPrice) && billzPrice > 0
      ? billzPrice
      : (Number.isFinite(yandexPrice) && yandexPrice > 0 ? yandexPrice : null);

    if (chosen == null) {
      // both are invalid/non-positive
      if (!Number.isFinite(billzPrice) || !Number.isFinite(yandexPrice)) {
        skipped.nonFinite.push({ offerId, billzPrice, yandexPrice });
      } else {
        skipped.nonPositiveBoth.push({ offerId, billzPrice, yandexPrice });
      }
      continue;
    }

    const payloadItem = {
      offerId: String(offerId),
      price: { value: chosen, currencyId: CURRENCY },
    };

    if (byOffer.has(payloadItem.offerId)) {
      skipped.dedupOverwritten.push({
        offerId: payloadItem.offerId,
        previous: byOffer.get(payloadItem.offerId),
        next: payloadItem,
      });
    }
    byOffer.set(payloadItem.offerId, payloadItem);
  }

  const uniqueOffers = Array.from(byOffer.values());

  if (uniqueOffers.length === 0) {
    console.warn(
      "[PriceSync] No valid price offers to send. Skipped summary:",
      {
        missingOfferId: skipped.missingOfferId.length,
        nonFinite: skipped.nonFinite.length,
        nonPositiveBoth: skipped.nonPositiveBoth.length,
      }
    );
    return { batches: 0, results: [], failed: [] };
  }

  const chunks = chunk(uniqueOffers, BATCH_SIZE);

  // small helper: retry with backoff for 429/5xx
  const sendWithRetries = async (payload, attempt = 1) => {
    try {
      const res = await axios.post(
        `${YANDEX_BUSINESS_URL}/offer-prices/updates`,
        payload,
        {
          headers: {
            "Api-Key": process.env.YANDEX_SECRET_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      return { ok: true, data: res.data };
    } catch (err) {
      const status = err?.response?.status;
      const isRetryable = status === 429 || (status >= 500 && status < 600);
      if (isRetryable && attempt < 3) {
        const delayMs = 500 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delayMs));
        return sendWithRetries(payload, attempt + 1);
      }
      // Log full error body so you can see exact index messages
      console.error(
        "Price update failed:",
        status,
        JSON.stringify(err?.response?.data, null, 2)
      );
      return { ok: false, error: err, data: err?.response?.data };
    }
  };

  const results = [];
  const failed = [];

  for (let idx = 0; idx < chunks.length; idx++) {
    const sendingObj = { offers: chunks[idx] };
    const res = await sendWithRetries(sendingObj);
    if (res.ok) {
      console.log(
        `Yandex prices batch ${idx + 1}/${chunks.length} updated successfully.`
      );
      results.push(res.data);
    } else {
      console.error(
        `Yandex prices batch ${idx + 1}/${chunks.length} failed:`,
        res.error?.message || res.data || res.error
      );
      failed.push({
        batch: idx + 1,
        payloadCount: sendingObj.offers.length,
        error: res.data || res.error?.message || String(res.error),
      });
    }
    if (idx < chunks.length - 1) await new Promise((r) => setTimeout(r, 100));
  }

  // Helpful diagnostics when we had to skip items
  if (
    skipped.missingOfferId.length ||
    skipped.nonFinite.length ||
    skipped.nonPositiveBoth.length
  ) {
    console.warn("[PriceSync] Skipped offers detail:", {
      missingOfferId: skipped.missingOfferId.slice(0, 20),
      nonFinite: skipped.nonFinite.slice(0, 20),
      nonPositiveBoth: skipped.nonPositiveBoth.slice(0, 20),
      dedupOverwritten: skipped.dedupOverwritten.length,
    });
  }

  return { batches: chunks.length, results, failed };
}

