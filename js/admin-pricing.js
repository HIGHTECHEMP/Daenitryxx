import { supabase } from "./supabase-client.js";
import {
  $,
  escapeHtml,
  money,
  toast,
  formMessage
} from "./utils.js";

let pricingState = {
  settings: {},
  distance_bands: [],
  weight_bands: []
};

function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bandRow(kind, row = {}) {
  const distance = kind === "distance";
  const id = row.id || crypto.randomUUID();

  return `
    <div class="pricing-band-row" data-band-kind="${distance ? "distance" : "weight"}" data-id="${escapeHtml(id)}">
      <label>
        <span>${distance ? "Minimum km" : "Minimum kg"}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          class="pricing-band-min"
          value="${escapeHtml(String(distance ? (row.min_km ?? "") : (row.min_kg ?? "")))}"
        />
      </label>

      <label>
        <span>${distance ? "Maximum km" : "Maximum kg"}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          class="pricing-band-max"
          placeholder="Unlimited"
          value="${escapeHtml(String(distance ? (row.max_km ?? "") : (row.max_kg ?? "")))}"
        />
      </label>

      <label>
        <span>${distance ? "Price / km" : "Price / kg"}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          class="pricing-band-rate"
          value="${escapeHtml(String(distance ? (row.price_per_km ?? 0) : (row.price_per_kg ?? 0)))}"
        />
      </label>

      <label class="pricing-band-active">
        <span>Active</span>
        <input type="checkbox" class="pricing-band-enabled" ${row.active === false ? "" : "checked"} />
      </label>

      <button class="link-button pricing-band-remove" type="button">Remove</button>
    </div>
  `;
}

function renderBands() {
  const distanceBody = $("#distance-bands");
  const weightBody = $("#weight-bands");

  if (distanceBody) {
    distanceBody.innerHTML =
      pricingState.distance_bands.length
        ? pricingState.distance_bands.map(row => bandRow("distance", row)).join("")
        : `<div class="empty pricing-empty">No kilometre bands yet. Add one below.</div>`;
  }

  if (weightBody) {
    weightBody.innerHTML =
      pricingState.weight_bands.length
        ? pricingState.weight_bands.map(row => bandRow("weight", row)).join("")
        : `<div class="empty pricing-empty">No weight bands yet. Add one below.</div>`;
  }

  document.querySelectorAll(".pricing-band-remove").forEach(button => {
    button.addEventListener("click", () => {
      button.closest(".pricing-band-row")?.remove();
    });
  });
}

function readBandRows(containerId, kind) {
  const container = document.querySelector(containerId);
  if (!container) return [];

  return [...container.querySelectorAll(".pricing-band-row")].map(row => {
    const min = numberValue(row.querySelector(".pricing-band-min")?.value);
    const maxRaw = String(row.querySelector(".pricing-band-max")?.value || "").trim();
    const max = maxRaw === "" ? null : numberValue(maxRaw);
    const rate = numberValue(row.querySelector(".pricing-band-rate")?.value);

    return kind === "distance"
      ? { min_km: min, max_km: max, price_per_km: rate, active: row.querySelector(".pricing-band-enabled")?.checked !== false }
      : { min_kg: min, max_kg: max, price_per_kg: rate, active: row.querySelector(".pricing-band-enabled")?.checked !== false };
  });
}

async function loadPricing() {
  const { data, error } = await supabase.rpc("admin_get_delivery_pricing");

  if (error) {
    toast(error.message || "Unable to load pricing.", "error");
    return;
  }

  pricingState = {
    settings: data?.settings || {},
    distance_bands: data?.distance_bands || [],
    weight_bands: data?.weight_bands || []
  };

  const form = $("#pricing-form");

  if (form) {
    form.base_fee.value = pricingState.settings.base_fee ?? 0;
    form.minimum_fee.value = pricingState.settings.minimum_fee ?? 0;
    form.maximum_distance_km.value = pricingState.settings.maximum_distance_km ?? "";
    form.distance_rounding_km.value = pricingState.settings.distance_rounding_km ?? 1;
    form.weight_rounding_kg.value = pricingState.settings.weight_rounding_kg ?? 1;
    form.currency.value = pricingState.settings.currency || "NGN";
    form.active.checked = pricingState.settings.active !== false;
  }

  renderBands();
}

function validateBands(rows, label) {
  if (!rows.length) return `${label} requires at least one active or inactive band.`;

  const sorted = [...rows].sort((a, b) => {
    const aMin = Number(label === "Distance" ? a.min_km : a.min_kg);
    const bMin = Number(label === "Distance" ? b.min_km : b.min_kg);
    return aMin - bMin;
  });

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const min = Number(label === "Distance" ? row.min_km : row.min_kg);
    const max = label === "Distance" ? row.max_km : row.max_kg;
    const rate = Number(label === "Distance" ? row.price_per_km : row.price_per_kg);

    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(rate) || rate < 0) {
      return `${label} band values are invalid.`;
    }

    if (max !== null && (!Number.isFinite(Number(max)) || Number(max) < min)) {
      return `${label} band maximum must be greater than or equal to minimum.`;
    }

    if (i > 0) {
      const previousMax = label === "Distance" ? sorted[i - 1].max_km : sorted[i - 1].max_kg;
      if (previousMax === null || Number(previousMax) >= min) {
        return `${label} pricing bands overlap. Adjust the ranges so each value belongs to one band.`;
      }
    }
  }

  return "";
}

async function savePricing(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const settings = {
    base_fee: numberValue(form.base_fee.value),
    minimum_fee: numberValue(form.minimum_fee.value),
    maximum_distance_km: String(form.maximum_distance_km.value || "").trim()
      ? numberValue(form.maximum_distance_km.value)
      : null,
    distance_rounding_km: numberValue(form.distance_rounding_km.value, 1),
    weight_rounding_kg: numberValue(form.weight_rounding_kg.value, 1),
    currency: String(form.currency.value || "NGN").trim().toUpperCase(),
    active: form.active.checked
  };

  const distanceBands = readBandRows("#distance-bands", "distance");
  const weightBands = readBandRows("#weight-bands", "weight");

  if (settings.base_fee < 0 || settings.minimum_fee < 0) {
    formMessage(form, "Base and minimum fees cannot be negative.", "error");
    return;
  }

  if (settings.distance_rounding_km <= 0 || settings.weight_rounding_kg <= 0) {
    formMessage(form, "Rounding values must be greater than zero.", "error");
    return;
  }

  if (settings.maximum_distance_km !== null && settings.maximum_distance_km <= 0) {
    formMessage(form, "Maximum distance must be greater than zero.", "error");
    return;
  }

  const distanceError = validateBands(distanceBands, "Distance");
  const weightError = validateBands(weightBands, "Weight");

  if (distanceError || weightError) {
    formMessage(form, distanceError || weightError, "error");
    return;
  }

  formMessage(form, "Saving live route pricing…");

  const { error } = await supabase.rpc("admin_save_delivery_pricing", {
    p_settings: settings,
    p_distance_bands: distanceBands,
    p_weight_bands: weightBands
  });

  if (error) {
    formMessage(form, error.message, "error");
    return;
  }

  formMessage(form, "");
  toast("Live route pricing saved.", "success");
  await loadPricing();
}

function addBand(kind) {
  const container = kind === "distance"
    ? $("#distance-bands")
    : $("#weight-bands");

  if (!container) return;

  const row = document.createElement("div");
  row.innerHTML = bandRow(kind);
  const node = row.firstElementChild;

  const empty = container.querySelector(".pricing-empty");
  empty?.remove();

  container.appendChild(node);

  node.querySelector(".pricing-band-remove")?.addEventListener("click", () => node.remove());
}

export function initPricingPage() {
  $("#pricing-form")?.addEventListener("submit", savePricing);
  $("#refresh-pricing")?.addEventListener("click", loadPricing);
  $("#add-distance-band")?.addEventListener("click", () => addBand("distance"));
  $("#add-weight-band")?.addEventListener("click", () => addBand("weight"));

  loadPricing();
}
