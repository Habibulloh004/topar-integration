import { ObjectId } from "mongodb";
import { getDB } from "../service/db.service.js";

const DEFAULT_PAGE_SIZE = 20;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return "—";
  }
  return numberValue.toLocaleString("ru-RU");
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const normalizeString = (value) => {
  if (value == null) return "";
  const str = String(value).trim();
  return str.length > 0 ? str : "";
};

export function registerProductTableRoutes(app, options = {}) {
  const getBillzProducts =
    typeof options.getBillzProducts === "function"
      ? options.getBillzProducts
      : () => [];

  app.get("/table", async (req, res) => {
    try {
      const billzOptionsMap = new Map();
      const maybeBillzProducts = getBillzProducts();
      const currentBillzProducts = Array.isArray(maybeBillzProducts)
        ? maybeBillzProducts
        : [];

      for (const product of currentBillzProducts) {
        const barcodeValue =
          product?.barcode ??
          product?.barcode_billz ??
          product?.barcodeBillz ??
          product?.ean ??
          null;
        if (!barcodeValue) continue;
        const normalizedBarcode = String(barcodeValue).trim();
        if (!normalizedBarcode) continue;
        if (billzOptionsMap.has(normalizedBarcode)) continue;
        const label =
          normalizeString(product?.title) ||
          normalizeString(product?.product_title) ||
          normalizeString(product?.productName) ||
          normalizeString(product?.name) ||
          normalizeString(product?.product_title_ru) ||
          normalizedBarcode;
        billzOptionsMap.set(normalizedBarcode, label || normalizedBarcode);
      }
      const billzOptions = Array.from(billzOptionsMap.entries()).map(
        ([barcode, label]) => ({ barcode, label })
      );

      const pageParam = Number.parseInt(req.query.page, 10);
      const limitParam = Number.parseInt(req.query.limit, 10);
      const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
      const limitRaw =
        Number.isFinite(limitParam) && limitParam > 0
          ? limitParam
          : DEFAULT_PAGE_SIZE;
      const limit = Math.min(Math.max(limitRaw, 1), 100);
      const search = normalizeString(req.query.search);

      const query = {};
      if (search) {
        const searchRegex = { $regex: search, $options: "i" };
        query.$or = [
          { barcode_uzum: searchRegex },
          { barcode_billz: searchRegex },
        ];
      }

      const database = await getDB();
      const collection = database.collection("products");

      const skip = (page - 1) * limit;
      const [products, totalCount] = await Promise.all([
        collection
          .find(query)
          .sort({ updated_at: -1, sku_id: 1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        collection.countDocuments(query),
      ]);

      const totalPages = Math.max(1, Math.ceil(totalCount / limit));
      const showingFrom = totalCount === 0 ? 0 : skip + 1;
      const showingTo = skip + products.length;

      const baseParams = {
        search,
        limit: String(limit),
      };
      const buildLink = (pageNumber) => {
        const params = new URLSearchParams(baseParams);
        params.set("page", String(pageNumber));
        const queryString = params.toString();
        return `/table${queryString ? `?${queryString}` : ""}`;
      };

      const neighbors = 2;
      const paginationStart = Math.max(1, page - neighbors);
      const paginationEnd = Math.min(totalPages, page + neighbors);
      const paginationLinks = [];

      if (page > 1) {
        paginationLinks.push(
          `<a class="pager-link" href="${buildLink(page - 1)}">&laquo; Prev</a>`
        );
      }

      for (let p = paginationStart; p <= paginationEnd; p += 1) {
        if (p === page) {
          paginationLinks.push(
            `<span class="pager-link pager-current">${escapeHtml(p)}</span>`
          );
        } else {
          paginationLinks.push(
            `<a class="pager-link" href="${buildLink(p)}">${escapeHtml(
              p
            )}</a>`
          );
        }
      }

      if (page < totalPages) {
        paginationLinks.push(
          `<a class="pager-link" href="${buildLink(
            page + 1
          )}">Next &raquo;</a>`
        );
      }

      const limitOptions = [10, 20, 50, 100]
        .map(
          (size) =>
            `<option value="${size}"${
              limit === size ? " selected" : ""
            }>${escapeHtml(size)}</option>`
        )
        .join("");

      const rowsHtml = products
        .map((product) => {
          const rawSkuId =
            product.sku_id ??
            product.skuId ??
            product.skuID ??
            product.sku ??
            null;
          const skuIdDisplay = rawSkuId ?? "—";
          const productTitle =
            normalizeString(product.productTitle) ||
            normalizeString(product.product_title) ||
            "—";
          const barcodeUzumRaw = normalizeString(product.barcode_uzum);
          const barcodeBillzRaw = normalizeString(product.barcode_billz);
          const amountRaw =
            product.amount === "" || product.amount == null
              ? null
              : Number(product.amount);
          const priceRaw =
            product.price === "" || product.price == null
              ? null
              : Number(product.price);
          const amountDataset = Number.isFinite(amountRaw)
            ? String(amountRaw)
            : "";
          const priceDataset = Number.isFinite(priceRaw)
            ? String(priceRaw)
            : "";
          const updatedAtRaw =
            product.updated_at || product.updatedAt || product.updatedAtUtc;
          const updatedAt = formatDateTime(updatedAtRaw);
          const id =
            (product._id && product._id.toString && product._id.toString()) ||
            normalizeString(product._id) ||
            "";

          return `<tr>
            <td>${escapeHtml(skuIdDisplay)}</td>
            <td class="cell-title" title="${escapeHtml(
              productTitle
            )}">${escapeHtml(productTitle)}</td>
            <td>${escapeHtml(barcodeUzumRaw || "—")}</td>
            <td>${escapeHtml(barcodeBillzRaw || "—")}</td>
            <td class="cell-number">${escapeHtml(formatNumber(amountRaw))}</td>
            <td class="cell-number">${escapeHtml(formatNumber(priceRaw))}</td>
            <td>${escapeHtml(updatedAt)}</td>
            <td>
              <button
                type="button"
                class="edit-button"
                data-action="edit"
                data-id="${escapeHtml(id)}"
                data-sku="${escapeHtml(rawSkuId ?? "")}"
                data-title="${escapeHtml(
                  productTitle === "—" ? "" : productTitle
                )}"
                data-uzum="${escapeHtml(barcodeUzumRaw)}"
                data-billz="${escapeHtml(barcodeBillzRaw)}"
                data-amount="${escapeHtml(amountDataset)}"
                data-price="${escapeHtml(priceDataset)}"
              >
                Edit
              </button>
            </td>
          </tr>`;
        })
        .join("");

      const tableBodyHtml =
        rowsHtml ||
        `<tr><td class="empty-state" colspan="8">No products found for the current filters.</td></tr>`;

      const billzSelectOptions = [
        `<option value="">-- Select Billz product --</option>`,
        ...billzOptions.map(
          ({ barcode, label }) =>
            `<option value="${escapeHtml(barcode)}">${escapeHtml(
              label
            )} (${escapeHtml(barcode)})</option>`
        ),
      ].join("");

      const billzOptionsJson = JSON.stringify(billzOptions).replace(
        /</g,
        "\\u003c"
      );

      const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Products Table</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background-color: #f6f8fa;
        color: #1f2328;
      }
      body {
        margin: 0 auto;
        padding: 24px 32px 48px;
        max-width: 1200px;
        line-height: 1.45;
      }
      h1 {
        margin: 0 0 24px;
        font-size: 26px;
        letter-spacing: -0.01em;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        margin-bottom: 16px;
      }
      .toolbar label,
      .toolbar select,
      .toolbar input {
        font-size: 14px;
      }
      .toolbar label {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .toolbar input[type="text"],
      .toolbar select {
        min-width: 220px;
        padding: 6px 8px;
        border-radius: 6px;
        border: 1px solid #d0d7de;
        font-size: 14px;
        background-color: #fff;
        color: inherit;
        transition: border-color 120ms ease;
      }
      .toolbar input[type="text"]:focus,
      .toolbar select:focus {
        outline: none;
        border-color: #0969da;
        box-shadow: 0 0 0 2px rgba(9, 105, 218, 0.15);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background-color: #fff;
        border: 1px solid #d0d7de;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 12px 32px rgba(31, 35, 40, 0.08);
      }
      thead {
        background-color: #f2f4f7;
      }
      th,
      td {
        padding: 12px 14px;
        text-align: left;
        border-bottom: 1px solid #d8dee4;
        font-size: 14px;
      }
      th {
        font-weight: 600;
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0.08em;
        color: #4b5563;
        background: linear-gradient(180deg, #f8f9fb 0%, #edf1f7 100%);
      }
      tbody tr:nth-child(odd) {
        background-color: #f9fafb;
      }
      tbody tr:hover {
        background-color: #eaf2ff;
      }
      .cell-title {
        max-width: 320px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cell-number {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .empty-state {
        text-align: center;
        padding: 28px;
        font-style: italic;
        color: #6b7280;
      }
      .meta {
        margin: 16px 0;
        font-size: 13px;
        color: #57606a;
      }
      .pager {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 16px;
        font-size: 14px;
      }
      .pager-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid #d0d7de;
        background-color: #fff;
        text-decoration: none;
        color: inherit;
        transition: background-color 120ms ease, border-color 120ms ease;
      }
      .pager-link:hover {
        border-color: #0969da;
        color: #0969da;
      }
      .pager-current {
        border-color: #0969da;
        background-color: #0969da;
        color: #fff;
        font-weight: 600;
      }
      .edit-button {
        padding: 6px 12px;
        border-radius: 6px;
        border: 1px solid #2563eb;
        background-color: #2563eb;
        color: #fff;
        font-size: 13px;
        cursor: pointer;
        transition: background-color 120ms ease, border-color 120ms ease;
      }
      .edit-button:hover {
        background-color: #1d4ed8;
        border-color: #1d4ed8;
      }
      .info-bar {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: 12px;
        margin: 16px 0;
      }
      .modal-overlay[hidden] {
        display: none;
      }
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        z-index: 1000;
      }
      .modal {
        width: min(640px, 100%);
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 24px 48px rgba(15, 23, 42, 0.25);
        max-height: calc(100vh - 64px);
        overflow: auto;
      }
      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 24px 12px;
        border-bottom: 1px solid #e2e8f0;
      }
      .modal-header h2 {
        margin: 0;
        font-size: 18px;
      }
      .modal-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #94a3b8;
      }
      .modal-close:hover {
        color: #1e293b;
      }
      .modal-form {
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .form-grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .form-grid label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 13px;
        color: #1f2937;
      }
      .form-grid input,
      .form-grid select {
        padding: 8px 10px;
        border-radius: 6px;
        border: 1px solid #cbd5f5;
        font-size: 14px;
      }
      .form-grid input:focus,
      .form-grid select:focus {
        outline: none;
        border-color: #2563eb;
        box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
      }
      .form-grid input[readonly] {
        background: #f1f5f9;
        color: #475569;
        cursor: not-allowed;
      }
      .form-grid input[readonly]:focus {
        box-shadow: none;
        border-color: #cbd5f5;
      }
      .modal-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        align-items: center;
        flex-wrap: wrap;
      }
      .modal-actions button {
        padding: 8px 16px;
        border-radius: 6px;
        border: 1px solid #64748b;
        background: #fff;
        color: #0f172a;
        cursor: pointer;
        font-weight: 600;
      }
      .modal-actions button.primary {
        background: #2563eb;
        border-color: #2563eb;
        color: #fff;
      }
      .modal-actions button.primary:hover {
        background: #1d4ed8;
        border-color: #1d4ed8;
      }
      .modal-actions button:not(.primary):hover {
        border-color: #475569;
        color: #1e293b;
      }
      .modal-hint {
        margin: 0;
        font-size: 12px;
        color: #64748b;
      }
      @media (max-width: 720px) {
        body {
          padding: 16px;
        }
        table {
          font-size: 13px;
        }
        .form-grid {
          grid-template-columns: 1fr;
        }
        .toolbar input[type="text"],
        .toolbar select {
          min-width: 0;
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <h1>Products overview</h1>
    <form class="toolbar" method="get" action="/table">
      <label>
        Search
        <input type="text" name="search" value="${escapeHtml(
          search
        )}" placeholder="Billz barcode" data-filter="search" autocomplete="off" />
      </label>
      <label>
        Page size
        <select name="limit" data-filter="limit">
          ${limitOptions}
        </select>
      </label>
    </form>
    <div class="info-bar">
      <div class="meta">
        Showing ${escapeHtml(showingFrom)} to ${escapeHtml(
        showingTo
      )} of ${escapeHtml(totalCount)} products
      </div>
      <div class="meta">Page ${escapeHtml(page)} of ${escapeHtml(
        totalPages
      )}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>SKU ID</th>
          <th>Title</th>
          <th>Barcode Uzum</th>
          <th>Barcode Billz</th>
          <th>Amount</th>
          <th>Price</th>
          <th>Updated</th>
          <th style="width: 1%;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${tableBodyHtml}
      </tbody>
    </table>
    <div class="pager">
      ${paginationLinks.join("")}
    </div>
    <div class="meta">${escapeHtml(
      new Date().toLocaleString()
    )} · Filters update automatically</div>

    <script type="application/json" id="billz-products-data">${billzOptionsJson}</script>
    <div id="edit-overlay" class="modal-overlay" hidden>
      <div class="modal" role="dialog" aria-modal="true">
        <header class="modal-header">
          <h2>Edit product</h2>
          <button type="button" class="modal-close" data-action="close" aria-label="Close edit dialog">✕</button>
        </header>
        <form id="edit-form" class="modal-form">
          <input type="hidden" name="id" />
          <div class="form-grid">
            <label>
              SKU ID
              <input type="number" name="sku_id" required min="0" step="1" readonly />
            </label>
            <label>
              Title
              <input type="text" name="productTitle" required readonly />
            </label>
            <label>
              Barcode Uzum
              <input type="text" name="barcode_uzum" readonly />
            </label>
            <label>
              Billz product
              <input
                type="text"
                name="billz_filter"
                placeholder="Type barcode to filter"
                autocomplete="off"
                data-role="billz-filter"
              />
              <select name="barcode_billz" data-role="billz-select">
                ${billzSelectOptions}
              </select>
            </label>
            <label>
              Selected Billz barcode
              <input type="text" name="billz_barcode_display" data-role="billz-barcode-display" readonly />
            </label>
            <label>
              Amount
              <input type="number" name="amount" step="1" readonly />
            </label>
            <label>
              Price
              <input type="number" name="price" step="0.01" min="0" readonly />
            </label>
          </div>
          <div class="modal-actions">
            <button type="submit" class="primary">Save changes</button>
            <button type="button" data-action="close">Cancel</button>
          </div>
          <p class="modal-hint">Updates apply immediately. Reload table to confirm.</p>
        </form>
      </div>
    </div>

    <script>
      (() => {
        const form = document.querySelector('.toolbar');
        const searchInput = form?.querySelector('[data-filter="search"]');
        const limitSelect = form?.querySelector('[data-filter="limit"]');
        const billzDataElement = document.getElementById('billz-products-data');

        const normalizeText = (value) => (value ?? '').toString().trim();

        let billzOptionsList = [];
        if (billzDataElement) {
          try {
            billzOptionsList = JSON.parse(billzDataElement.textContent || '[]');
          } catch (error) {
            console.error('Failed to parse Billz options:', error);
            billzOptionsList = [];
          }
        }

        const overlay = document.getElementById('edit-overlay');
        const modalForm = document.getElementById('edit-form');
        const billzSelect = modalForm?.querySelector('[data-role="billz-select"]');
        const billzBarcodeDisplay = modalForm?.querySelector('[data-role="billz-barcode-display"]');
        const billzFilterInput = modalForm?.querySelector('[data-role="billz-filter"]');

        const renderBillzSelect = (selectedValue = "", filterValue) => {
          if (!billzSelect) return;

          const normalizedSelected = normalizeText(selectedValue);
          const filterSource =
            filterValue !== undefined
              ? filterValue
              : billzFilterInput?.value || "";
          const filter = normalizeText(filterSource);
          const filterIsActive = filter.length > 0;
          const filterLower = filter.toLowerCase();

          billzSelect.innerHTML = "";

          const placeholder = document.createElement("option");
          placeholder.value = "";
          placeholder.textContent = "-- Select Billz product --";
          billzSelect.appendChild(placeholder);

          let optionsToRender = [];

          if (filterIsActive) {
            optionsToRender = billzOptionsList
              .filter((item) =>
                item.barcode.toLowerCase().includes(filterLower)
              )
              .slice(0, 100);
          }

          if (optionsToRender.length === 0 && normalizedSelected) {
            const existing = billzOptionsList.find(
              (item) => item.barcode === normalizedSelected
            );
            if (existing) {
              optionsToRender = [existing];
            } else {
              optionsToRender = [
                { barcode: normalizedSelected, label: "Current: " + normalizedSelected },
              ];
            }
          }

          if (!filterIsActive && optionsToRender.length === 0) {
            const hint = document.createElement("option");
            hint.value = "";
            hint.textContent = "Type barcode to load options";
            hint.disabled = true;
            billzSelect.appendChild(hint);
          } else {
            for (const option of optionsToRender) {
              const optionEl = document.createElement("option");
              optionEl.value = option.barcode;
              optionEl.textContent = option.label + " (" + option.barcode + ")";
              billzSelect.appendChild(optionEl);
            }
          }

          const selectionAvailable = optionsToRender.some(
            (option) => option.barcode === normalizedSelected
          );

          if (normalizedSelected && selectionAvailable) {
            billzSelect.value = normalizedSelected;
          } else if (optionsToRender.length > 0) {
            billzSelect.value = optionsToRender[0].barcode;
          } else {
            billzSelect.value = "";
          }

          billzSelect.disabled = optionsToRender.length === 0 && !normalizedSelected;
        };

        const syncBillzDisplay = () => {
          if (billzBarcodeDisplay && billzSelect) {
            billzBarcodeDisplay.value = billzSelect.value || '';
          }
        };

        const updateLocation = (params) => {
          const query = params.toString();
          const url = window.location.pathname + (query ? '?' + query : '');
          window.location.href = url;
        };

        const initialSearchValue =
          normalizeText(searchInput?.value) ||
          normalizeText(new URLSearchParams(window.location.search).get('search'));

        if (billzFilterInput) {
          billzFilterInput.value = initialSearchValue;
        }
        renderBillzSelect('', initialSearchValue);
        syncBillzDisplay();

        if (searchInput) {
          let searchTimer;
          searchInput.addEventListener('input', () => {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(() => {
              const params = new URLSearchParams(window.location.search);
              const value = normalizeText(searchInput.value);
              if (value) {
                params.set('search', value);
              } else {
                params.delete('search');
              }
              params.delete('page');
              if (billzFilterInput) {
                billzFilterInput.value = value;
              }
              renderBillzSelect(billzSelect?.value || '', value);
              updateLocation(params);
            }, 350);
          });
        }

        if (limitSelect) {
          limitSelect.addEventListener('change', () => {
            const params = new URLSearchParams(window.location.search);
            const value = normalizeText(limitSelect.value);
            if (value) {
              params.set('limit', value);
            } else {
              params.delete('limit');
            }
            params.delete('page');
            updateLocation(params);
          });
        }

        const closeModal = () => {
          if (overlay) {
            overlay.setAttribute('hidden', '');
          }
          if (modalForm) {
            modalForm.reset();
            const resetFilter =
              normalizeText(searchInput?.value || initialSearchValue);
            if (billzFilterInput) {
              billzFilterInput.value = resetFilter;
            }
            renderBillzSelect('', resetFilter);
            syncBillzDisplay();
          }
        };

        const fillForm = (btn) => {
          if (!modalForm) return;
          modalForm.elements.id.value = btn.dataset.id || '';
          modalForm.elements.sku_id.value = btn.dataset.sku || '';
          modalForm.elements.productTitle.value = btn.dataset.title || '';
          modalForm.elements.barcode_uzum.value = btn.dataset.uzum || '';
          modalForm.elements.amount.value = btn.dataset.amount || '';
          modalForm.elements.price.value = btn.dataset.price || '';
          const selectedBillz = normalizeText(btn.dataset.billz || '');
          const fallbackFilter = normalizeText(searchInput?.value || initialSearchValue);
          const filterValue = selectedBillz || fallbackFilter;
          if (billzFilterInput) {
            billzFilterInput.value = filterValue;
          }
          renderBillzSelect(selectedBillz, filterValue);
          syncBillzDisplay();
          if (billzFilterInput) {
            billzFilterInput.focus();
          } else {
            billzSelect?.focus();
          }
        };

        billzFilterInput?.addEventListener('input', () => {
          const currentSelected = billzSelect?.value || '';
          renderBillzSelect(currentSelected, billzFilterInput.value);
          syncBillzDisplay();
        });

        billzSelect?.addEventListener('change', () => {
          syncBillzDisplay();
        });

        modalForm?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const formData = new FormData(modalForm);
          const payload = Object.fromEntries(formData.entries());
          delete payload.billz_barcode_display;
          payload.barcode_billz = normalizeText(payload.barcode_billz) || null;

          try {
            const response = await fetch('/products/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

            const result = await response.json();
            if (!response.ok || !result.ok) {
              throw new Error(result?.error || 'Update failed');
            }

            window.location.reload();
          } catch (err) {
            window.alert('Failed to update product: ' + err.message);
          }
        });

        overlay?.addEventListener('click', (event) => {
          if (event.target === overlay) {
            closeModal();
          }
        });

        document.addEventListener('click', (event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;

          if (target.matches('[data-action="edit"]')) {
            event.preventDefault();
            fillForm(target);
            overlay?.removeAttribute('hidden');
          }

          if (target.matches('[data-action="close"]')) {
            event.preventDefault();
            closeModal();
          }
        });
      })();
    </script>
  </body>
</html>`;

      res.status(200);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(html);
    } catch (error) {
      console.error("Failed to render products table:", error);
      res
        .status(500)
        .json({ ok: false, error: "Failed to render products table" });
    }
  });

  app.post("/products/update", async (req, res) => {
    try {
      const body = req.body || {};
      const id = normalizeString(body.id);

      if (!id) {
        res.status(400).json({ ok: false, error: "Product id is required" });
        return;
      }

      if (!ObjectId.isValid(id)) {
        res.status(400).json({ ok: false, error: "Invalid product id" });
        return;
      }

      const skuIdRaw = body.sku_id;
      const skuIdNumber = Number.parseInt(skuIdRaw, 10);

      if (!Number.isFinite(skuIdNumber) || skuIdNumber < 0) {
        res
          .status(400)
          .json({ ok: false, error: "SKU ID must be a positive number" });
        return;
      }

      const productTitle = normalizeString(body.productTitle);
      if (!productTitle) {
        res.status(400).json({ ok: false, error: "Product title is required" });
        return;
      }

      const barcodeUzum = normalizeString(body.barcode_uzum) || null;
      const barcodeBillz = normalizeString(body.barcode_billz) || null;

      const amountRaw = body.amount;
      const priceRaw = body.price;
      const amount =
        amountRaw === "" || amountRaw == null
          ? null
          : Number.parseInt(amountRaw, 10);
      const price =
        priceRaw === "" || priceRaw == null
          ? null
          : Number.parseFloat(priceRaw);

      if (amount != null && !Number.isFinite(amount)) {
        res.status(400).json({ ok: false, error: "Amount must be a number" });
        return;
      }

      if (price != null && !Number.isFinite(price)) {
        res.status(400).json({ ok: false, error: "Price must be a number" });
        return;
      }

      const database = await getDB();
      const collection = database.collection("products");

      const updateDoc = {
        sku_id: skuIdNumber,
        skuId: skuIdNumber,
        productTitle,
        product_title: productTitle,
        barcode_uzum: barcodeUzum,
        barcode_billz: barcodeBillz,
        updated_at: new Date(),
      };

      if (amount != null) {
        updateDoc.amount = amount;
      } else {
        updateDoc.amount = null;
      }

      if (price != null) {
        updateDoc.price = price;
      } else {
        updateDoc.price = null;
      }

      await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateDoc },
        { returnDocument: "after" }
      );

      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to update product:", error);
      res.status(500).json({ ok: false, error: "Failed to update product" });
    }
  });
}
