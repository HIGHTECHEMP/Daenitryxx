import { supabase } from "./supabase-client.js";
import {
  $,
  $$,
  escapeHtml,
  formatDate,
  money,
  toast
} from "./utils.js";

let shipmentRows = [];

export async function loadShipments() {
  const body = $("#shipments-body");

  if (!body) return;

  const { data, error } = await supabase
    .from("shipments")
    .select(`
      id,
      tracking_number,
      status,
      delivery_fee,
      driver_id,
      created_at,
      updated_at,
      customer:profiles!shipments_customer_id_fkey(
        full_name
      ),
      driver:profiles!shipments_driver_id_fkey(
        full_name
      )
    `)
    .order("created_at", {
      ascending: false
    })
    .limit(250);

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

  shipmentRows = data || [];
  renderShipments();
}

function renderShipments() {
  const body = $("#shipments-body");

  if (!body) return;

  const term = ($("#shipment-search")?.value || "")
    .trim()
    .toLowerCase();

  const status = $("#shipment-status-filter")?.value || "";

  const rows = shipmentRows.filter((shipment) => {
    const searchable = [
      shipment.tracking_number,
      shipment.customer?.full_name,
      shipment.driver?.full_name
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!term || searchable.includes(term)) &&
      (!status || shipment.status === status)
    );
  });

  body.innerHTML =
    rows
      .map(
        (shipment) => `
          <tr>
            <td>
              <b>${escapeHtml(
                shipment.tracking_number || "—"
              )}</b>
            </td>

            <td>
              ${escapeHtml(
                shipment.customer?.full_name || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                shipment.driver?.full_name ||
                "Unassigned"
              )}
            </td>

            <td>
              <span class="status-pill">
                ${escapeHtml(
                  String(shipment.status || "")
                    .replaceAll("_", " ")
                )}
              </span>
            </td>

            <td>
              ${money(shipment.delivery_fee)}
            </td>

            <td>
              ${formatDate(shipment.created_at)}
            </td>

            <td>
              <button
                class="link-button manage-shipment"
                data-id="${escapeHtml(shipment.id)}"
                type="button"
              >
                Manage
              </button>
            </td>
          </tr>
        `
      )
      .join("") ||
    `
      <tr>
        <td colspan="7">
          <div class="empty">
            No shipments match your filters.
          </div>
        </td>
      </tr>
    `;

  $$(".manage-shipment").forEach((button) => {
    button.addEventListener("click", () => {
      manageShipment(button.dataset.id);
    });
  });
}

async function manageShipment(id) {
  const shipment = shipmentRows.find(
    (item) => String(item.id) === String(id)
  );

  if (!shipment) {
    toast("Shipment could not be found.", "error");
    return;
  }

  const box = $("#shipment-modal");

  if (!box) {
    toast(
      "Shipment management panel is unavailable.",
      "error"
    );
    return;
  }

  /*
   * IMPORTANT:
   * The global CSS uses .modal { display:none }
   * and .modal.open { display:flex }.
   *
   * Therefore we MUST add the open class.
   */
  box.hidden = false;
  box.classList.add("open");

  box.innerHTML = `
    <div class="dash-panel modal-panel shipment-manage-card">

      <div class="panel-head">
        <div>
          <span class="eyebrow">
            SHIPMENT MANAGEMENT
          </span>

          <h2>
            ${escapeHtml(
              shipment.tracking_number || "Shipment"
            )}
          </h2>
        </div>

        <button
          class="link-button"
          id="close-shipment"
          type="button"
        >
          Close
        </button>
      </div>

      <div class="shipment-manage-summary">

        <p>
          <b>Customer:</b>
          ${escapeHtml(
            shipment.customer?.full_name || "—"
          )}
        </p>

        <p>
          <b>Current status:</b>
          ${escapeHtml(
            String(shipment.status || "")
              .replaceAll("_", " ")
          )}
        </p>

        <p>
          <b>Current driver:</b>
          ${escapeHtml(
            shipment.driver?.full_name ||
            "Unassigned"
          )}
        </p>

      </div>

      <div class="shipment-manage-form">

        <label>
          Status

          <select id="admin-shipment-status">

            <option value="pending">
              Pending
            </option>

            <option value="confirmed">
              Confirmed
            </option>

            <option value="driver_assigned">
              Driver assigned
            </option>

            <option value="picked_up">
              Picked up
            </option>

            <option value="in_transit">
              In transit
            </option>

            <option value="out_for_delivery">
              Out for delivery
            </option>

            <option value="delivered">
              Delivered
            </option>

            <option value="cancelled">
              Cancelled
            </option>

            <option value="failed_delivery">
              Failed delivery
            </option>

          </select>
        </label>

        <label>
          Delivery fee (NGN)

          <input
            id="admin-shipment-fee"
            type="number"
            min="0"
            step="0.01"
            value="${Number(shipment.delivery_fee) || 0}"
          >
        </label>

        <label>
          Assign approved driver

          <select id="admin-driver">
            <option value="">
              Loading approved drivers…
            </option>
          </select>
        </label>

      </div>

      <div class="shipment-manage-actions">

        <button
          class="btn btn-ghost"
          id="cancel-shipment-edit"
          type="button"
        >
          Cancel
        </button>

        <button
          class="btn btn-primary"
          id="save-shipment"
          type="button"
        >
          Save changes
        </button>

      </div>

    </div>
  `;

  const closeModal = () => {
    box.classList.remove("open");
    box.hidden = true;
    box.innerHTML = "";
  };

  const statusSelect = $("#admin-shipment-status");

  if (statusSelect) {
    statusSelect.value =
      shipment.status || "pending";
  }

  $("#close-shipment")?.addEventListener(
    "click",
    closeModal
  );

  $("#cancel-shipment-edit")?.addEventListener(
    "click",
    closeModal
  );

  box.addEventListener("click", (event) => {
    if (event.target === box) {
      closeModal();
    }
  });

  /*
   * Load approved drivers.
   */
  const {
    data: drivers,
    error: driversError
  } = await supabase
    .from("drivers")
    .select(`
      user_id,
      vehicle_type,
      availability,
      profiles:profiles!drivers_user_id_fkey(
        full_name
      )
    `)
    .eq("verification_status", "approved")
    .order("user_id");

  const driverSelect = $("#admin-driver");

  if (!driverSelect) return;

  if (driversError) {
    driverSelect.innerHTML = `
      <option value="">
        Unable to load approved drivers
      </option>
    `;

    toast(
      driversError.message ||
      "Unable to load approved drivers.",
      "error"
    );

    return;
  }

  driverSelect.innerHTML = `
    <option value="">
      Unassigned
    </option>

    ${(drivers || [])
      .map((driver) => {

        const name =
          driver.profiles?.full_name ||
          driver.user_id ||
          "Unnamed driver";

        const selected =
          shipment.driver_id === driver.user_id;

        return `
          <option
            value="${escapeHtml(driver.user_id)}"
            ${selected ? "selected" : ""}
          >
            ${escapeHtml(name)}
            —
            ${escapeHtml(
              driver.availability ||
              "availability unknown"
            )}
          </option>
        `;
      })
      .join("")}
  `;

  /*
   * SAVE CHANGES
   */
  $("#save-shipment")?.addEventListener(
    "click",
    async () => {

      const saveButton =
        $("#save-shipment");

      const status =
        $("#admin-shipment-status")?.value;

      const fee =
        Number(
          $("#admin-shipment-fee")?.value
        );

      const driver =
        $("#admin-driver")?.value || null;

      if (!status) {
        toast(
          "Please select a shipment status.",
          "error"
        );
        return;
      }

      if (!Number.isFinite(fee) || fee < 0) {
        toast(
          "Please enter a valid delivery fee.",
          "error"
        );
        return;
      }

      if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Saving…";
      }

      try {

        const { error } =
          await supabase.rpc(
            "admin_update_shipment",
            {
              p_shipment_id: id,
              p_status: status,
              p_delivery_fee: fee,
              p_driver_id: driver
            }
          );

        if (error) {
          toast(
            error.message ||
            "Unable to update shipment.",
            "error"
          );
          return;
        }

        toast(
          "Shipment updated successfully.",
          "success"
        );

        closeModal();

        /*
         * The old code called shipments()
         * and stats(), but those functions do
         * not exist in this module.
         *
         * Reload the shipment table directly.
         */
        await loadShipments();

      } finally {

        if (saveButton) {
          saveButton.disabled = false;
          saveButton.textContent =
            "Save changes";
        }

      }
    }
  );
}

export function initShipmentPage() {

  $("#shipment-search")?.addEventListener(
    "input",
    renderShipments
  );

  $("#shipment-status-filter")?.addEventListener(
    "change",
    renderShipments
  );

  $("#refresh-shipments")?.addEventListener(
    "click",
    loadShipments
  );

  loadShipments();
}