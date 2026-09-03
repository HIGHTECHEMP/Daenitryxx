import { supabase } from "./supabase-client.js";
import {
  $,
  $$,
  escapeHtml,
  money,
  toast,
  formMessage
} from "./utils.js";

let pricingRows = [];

export async function loadPricing() {
  const body = $("#pricing-body");

  if (!body) return;

  const { data, error } = await supabase
    .from("delivery_pricing_rules")
    .select(`
      id,
      pickup_city,
      delivery_city,
      min_weight_kg,
      max_weight_kg,
      base_fee,
      per_kg_fee,
      active,
      priority,
      created_at,
      updated_at
    `)
    .order("priority", {
      ascending: false
    })
    .order("created_at", {
      ascending: false
    });

  if (error) {
    body.innerHTML = `
      <tr>
        <td colspan="7">
          ${escapeHtml(error.message)}
        </td>
      </tr>
    `;
    return;
  }

  pricingRows = data || [];

  body.innerHTML =
    pricingRows.length
      ? pricingRows
          .map(
            (rule) => `
              <tr>

                <td>
                  ${escapeHtml(
                    rule.pickup_city
                  )}
                  →
                  ${escapeHtml(
                    rule.delivery_city
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    String(
                      rule.min_weight_kg
                    )
                  )}
                  kg –
                  ${
                    rule.max_weight_kg == null
                      ? "∞"
                      : `${escapeHtml(
                          String(
                            rule.max_weight_kg
                          )
                        )} kg`
                  }
                </td>

                <td>
                  ${money(rule.base_fee)}
                </td>

                <td>
                  ${money(rule.per_kg_fee)}
                </td>

                <td>
                  ${escapeHtml(
                    String(rule.priority)
                  )}
                </td>

                <td>
                  ${rule.active
                    ? "Active"
                    : "Inactive"}
                </td>

                <td>

                  <button
                    class="link-button edit-pricing"
                    data-id="${escapeHtml(rule.id)}"
                    type="button"
                  >
                    Edit
                  </button>

                  <button
                    class="link-button delete-pricing"
                    data-id="${escapeHtml(rule.id)}"
                    type="button"
                  >
                    Delete
                  </button>

                </td>

              </tr>
            `
          )
          .join("")
      : `
        <tr>
          <td colspan="7">
            <div class="empty">
              No delivery pricing rules configured yet.
            </div>
          </td>
        </tr>
      `;

  $$(".edit-pricing").forEach(
    (button) => {
      button.onclick = () =>
        editPricing(
          button.dataset.id
        );
    }
  );

  $$(".delete-pricing").forEach(
    (button) => {
      button.onclick = () =>
        deletePricing(
          button.dataset.id
        );
    }
  );
}

function editPricing(id) {
  const row =
    pricingRows.find(
      (item) => item.id === id
    );

  const form = $("#pricing-form");

  if (!row || !form) return;

  form.elements.id.value =
    row.id;

  form.pickup_city.value =
    row.pickup_city;

  form.delivery_city.value =
    row.delivery_city;

  form.min_weight_kg.value =
    row.min_weight_kg;

  form.max_weight_kg.value =
    row.max_weight_kg ?? "";

  form.base_fee.value =
    row.base_fee;

  form.per_kg_fee.value =
    row.per_kg_fee;

  form.priority.value =
    row.priority;

  form.active.checked =
    row.active;

  $("#pricing-save").textContent =
    "Save pricing rule";

  $("#pricing-cancel").hidden =
    false;

  form.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function resetPricingForm() {
  const form = $("#pricing-form");

  if (!form) return;

  form.reset();

  form.elements.id.value = "";

  form.per_kg_fee.value = "0";

  form.priority.value = "100";

  form.active.checked = true;

  $("#pricing-save").textContent =
    "Add pricing rule";

  $("#pricing-cancel").hidden =
    true;

  formMessage(form, "");
}

async function savePricing(event) {
  event.preventDefault();

  const form =
    event.currentTarget;

  const formData =
    new FormData(form);

  const max =
    String(
      formData.get("max_weight_kg") ||
      ""
    ).trim();

  const payload = {
    p_rate_id:
      String(
        formData.get("id") || ""
      ).trim() || null,

    p_pickup_city:
      String(
        formData.get("pickup_city") ||
        ""
      ).trim(),

    p_delivery_city:
      String(
        formData.get("delivery_city") ||
        ""
      ).trim(),

    p_min_weight_kg:
      Number(
        formData.get("min_weight_kg")
      ),

    p_max_weight_kg:
      max ? Number(max) : null,

    p_base_fee:
      Number(
        formData.get("base_fee")
      ),

    p_per_kg_fee:
      Number(
        formData.get("per_kg_fee")
      ),

    p_active:
      formData.get("active") === "on",

    p_priority:
      Number(
        formData.get("priority")
      )
  };

  if (
    !payload.p_pickup_city ||
    !payload.p_delivery_city
  ) {
    formMessage(
      form,
      "Pickup and delivery cities are required.",
      "error"
    );
    return;
  }

  if (
    !Number.isFinite(
      payload.p_min_weight_kg
    ) ||
    payload.p_min_weight_kg < 0
  ) {
    formMessage(
      form,
      "Minimum weight is invalid.",
      "error"
    );
    return;
  }

  if (
    payload.p_max_weight_kg !== null &&
    (
      !Number.isFinite(
        payload.p_max_weight_kg
      ) ||
      payload.p_max_weight_kg <
        payload.p_min_weight_kg
    )
  ) {
    formMessage(
      form,
      "Maximum weight must be greater than or equal to minimum weight.",
      "error"
    );
    return;
  }

  if (
    !Number.isFinite(
      payload.p_base_fee
    ) ||
    payload.p_base_fee < 0
  ) {
    formMessage(
      form,
      "Base fee is invalid.",
      "error"
    );
    return;
  }

  if (
    !Number.isFinite(
      payload.p_per_kg_fee
    ) ||
    payload.p_per_kg_fee < 0
  ) {
    formMessage(
      form,
      "Per-kg fee is invalid.",
      "error"
    );
    return;
  }

  formMessage(
    form,
    "Saving pricing rule…"
  );

  const { error } =
    await supabase.rpc(
      "admin_upsert_delivery_rate",
      payload
    );

  if (error) {
    formMessage(
      form,
      error.message,
      "error"
    );
    return;
  }

  resetPricingForm();

  toast(
    "Delivery pricing saved.",
    "success"
  );

  await loadPricing();
}

async function deletePricing(id) {
  if (
    !confirm(
      "Delete this delivery pricing rule? Customers will no longer receive quotes from it."
    )
  ) {
    return;
  }

  const { error } =
    await supabase.rpc(
      "admin_delete_delivery_rate",
      {
        p_rate_id: id
      }
    );

  if (error) {
    toast(error.message, "error");
    return;
  }

  toast(
    "Pricing rule deleted.",
    "success"
  );

  await loadPricing();
}

export function initPricingPage() {
  $("#pricing-form")
    ?.addEventListener(
      "submit",
      savePricing
    );

  $("#pricing-cancel")
    ?.addEventListener(
      "click",
      resetPricingForm
    );

  $("#refresh-pricing")
    ?.addEventListener(
      "click",
      loadPricing
    );

  resetPricingForm();

  loadPricing();
}