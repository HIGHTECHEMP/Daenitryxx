import { supabase } from "./supabase-client.js";

import {
  $,
  $$,
  escapeHtml,
  formatDate,
  toast
} from "./utils.js";

import { initDriverDashboard } from "./driver-shared.js";


let ctx = null;


/*
 * Shipment status progression.
 */
const STATUS_FLOW = {
  driver_assigned: "picked_up",
  picked_up: "in_transit",
  in_transit: "out_for_delivery",
  out_for_delivery: "delivered"
};


/*
 * Format shipment status for display.
 */
function formatStatus(status) {
  return String(status || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}


/*
 * Get the next allowed shipment status.
 */
function nextStatus(status) {
  return STATUS_FLOW[status] || null;
}


/*
 * Load all assignments belonging to the
 * currently authenticated driver.
 */
async function loadAssignments() {

  const body = $("#assignments-body");

  if (!body) {
    return;
  }


  if (!ctx?.session?.user?.id) {

    body.innerHTML = `
      <tr>
        <td colspan="7">
          Your session has expired.
        </td>
      </tr>
    `;

    return;
  }


  body.innerHTML = `
    <tr>
      <td colspan="7">
        Loading assignments...
      </td>
    </tr>
  `;


  const driverId =
    ctx.session.user.id;


  const { data, error } = await supabase

    .from("delivery_assignments")

    .select(`
      id,
      shipment_id,
      driver_id,
      status,
      assigned_at,
      accepted_at,
      rejected_at,
      completed_at,
      shipments (
        id,
        tracking_number,
        pickup_city,
        delivery_city,
        package_description,
        status,
        updated_at
      )
    `)

    .eq("driver_id", driverId)

    .order("assigned_at", {
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


  const rows =
    data || [];


  if (!rows.length) {

    body.innerHTML = `
      <tr>
        <td colspan="7">
          No assignments found.
        </td>
      </tr>
    `;

    return;
  }


  body.innerHTML = rows
    .map((assignment) => {

      const shipment =
        assignment.shipments || {};


      const shipmentStatus =
        shipment.status || "pending";


      const assignmentStatus =
        assignment.status || "unknown";


      const next =
        nextStatus(shipmentStatus);


      let action = `
        <button
          type="button"
          class="btn btn-secondary btn-small"
          data-view-assignment="${escapeHtml(
            assignment.id
          )}"
        >
          View
        </button>
      `;


      /*
       * Only allow the next shipment status.
       */
      if (next) {

        action += `
          <button
            type="button"
            class="btn btn-primary btn-small"
            data-next-status="${escapeHtml(
              assignment.id
            )}"
            data-status="${escapeHtml(
              next
            )}"
          >
            Mark as ${escapeHtml(
              formatStatus(next)
            )}
          </button>
        `;

      }


      /*
       * If the assignment itself has been rejected
       * or cancelled, don't show a status button.
       */
      if (
        assignmentStatus === "rejected" ||
        assignmentStatus === "cancelled" ||
        shipmentStatus === "delivered" ||
        shipmentStatus === "failed_delivery"
      ) {

        action = `
          <button
            type="button"
            class="btn btn-secondary btn-small"
            data-view-assignment="${escapeHtml(
              assignment.id
            )}"
          >
            View
          </button>
        `;

      }


      return `
        <tr>

          <td>
            <strong>
              ${escapeHtml(
                shipment.tracking_number || "—"
              )}
            </strong>
          </td>


          <td>
            ${escapeHtml(
              shipment.pickup_city || "—"
            )}
          </td>


          <td>
            ${escapeHtml(
              shipment.delivery_city || "—"
            )}
          </td>


          <td>
            ${escapeHtml(
              shipment.package_description || "—"
            )}
          </td>


          <td>

            <span class="status-badge">
              ${escapeHtml(
                formatStatus(shipmentStatus)
              )}
            </span>

          </td>


          <td>
            ${formatDate(
              assignment.assigned_at
            )}
          </td>


          <td>

            <div class="table-actions">
              ${action}
            </div>

          </td>

        </tr>
      `;

    })
    .join("");


  /*
   * Status buttons.
   */
  $$("[data-next-status]", body)
    .forEach((button) => {

      button.addEventListener(
        "click",
        async () => {

          const assignmentId =
            button.dataset.nextStatus;


          const status =
            button.dataset.status;


          await updateDeliveryStatus(
            assignmentId,
            status,
            button
          );

        }
      );

    });


  /*
   * View buttons.
   */
  $$("[data-view-assignment]", body)
    .forEach((button) => {

      button.addEventListener(
        "click",
        () => {

          showAssignment(
            button.dataset.viewAssignment
          );

        }
      );

    });

}


/*
 * Update shipment status through the secure
 * database RPC.
 */
async function updateDeliveryStatus(
  assignmentId,
  status,
  button
) {

  if (!ctx?.session?.user?.id) {

    toast(
      "Your session has expired.",
      "error"
    );

    return;
  }


  const originalText =
    button.textContent;


  button.disabled = true;

  button.textContent =
    "Updating...";


  const { error } =
    await supabase.rpc(
      "driver_update_delivery_status",
      {
        p_assignment_id:
          assignmentId,

        p_status:
          status,

        p_note:
          null
      }
    );


  if (error) {

    button.disabled = false;

    button.textContent =
      originalText;


    toast(
      error.message ||
      "Unable to update delivery status.",
      "error"
    );

    return;
  }


  toast(
    `Delivery marked as ${formatStatus(status)}.`,
    "success"
  );


  await loadAssignments();

}


/*
 * Display assignment details.
 */
async function showAssignment(
  assignmentId
) {

  const modal =
    $("#assignment-modal");


  const details =
    $("#assignment-details");


  if (!modal || !details) {
    return;
  }


  details.innerHTML = `
    <div class="loading-state">
      Loading assignment...
    </div>
  `;


  modal.hidden = false;
  modal.classList.add("open");

  modal.setAttribute(
    "aria-hidden",
    "false"
  );


  if (!ctx?.session?.user?.id) {

    details.innerHTML = `
      <div class="notice">
        Your session has expired.
      </div>
    `;

    return;
  }


  const driverId =
    ctx.session.user.id;


  const { data, error } =
    await supabase

      .from("delivery_assignments")

      .select(`
        id,
        shipment_id,
        driver_id,
        status,
        assigned_at,
        accepted_at,
        rejected_at,
        completed_at,
        shipments (
          id,
          tracking_number,
          pickup_city,
          delivery_city,
          package_description,
          status,
          delivery_fee,
          updated_at
        )
      `)

      .eq("id", assignmentId)

      .eq("driver_id", driverId)

      .maybeSingle();


  if (error || !data) {

    details.innerHTML = `
      <div class="notice">
        Unable to load assignment details.
      </div>
    `;

    return;
  }


  const shipment =
    data.shipments || {};


  details.innerHTML = `

    <div class="detail-grid">

      <div>
        <span class="eyebrow">
          TRACKING
        </span>

        <strong>
          ${escapeHtml(
            shipment.tracking_number || "—"
          )}
        </strong>
      </div>


      <div>
        <span class="eyebrow">
          SHIPMENT STATUS
        </span>

        <strong>
          ${escapeHtml(
            formatStatus(
              shipment.status
            )
          )}
        </strong>
      </div>


      <div>
        <span class="eyebrow">
          ASSIGNMENT STATUS
        </span>

        <strong>
          ${escapeHtml(
            formatStatus(
              data.status
            )
          )}
        </strong>
      </div>


      <div>
        <span class="eyebrow">
          PICKUP
        </span>

        <strong>
          ${escapeHtml(
            shipment.pickup_city || "—"
          )}
        </strong>
      </div>


      <div>
        <span class="eyebrow">
          DELIVERY
        </span>

        <strong>
          ${escapeHtml(
            shipment.delivery_city || "—"
          )}
        </strong>
      </div>


      <div>
        <span class="eyebrow">
          PACKAGE
        </span>

        <strong>
          ${escapeHtml(
            shipment.package_description || "—"
          )}
        </strong>
      </div>


      <div>
        <span class="eyebrow">
          ASSIGNED
        </span>

        <strong>
          ${formatDate(
            data.assigned_at
          )}
        </strong>
      </div>


      <div>
        <span class="eyebrow">
          ACCEPTED
        </span>

        <strong>
          ${formatDate(
            data.accepted_at
          )}
        </strong>
      </div>


      <div>
        <span class="eyebrow">
          COMPLETED
        </span>

        <strong>
          ${formatDate(
            data.completed_at
          )}
        </strong>
      </div>

    </div>


    <div class="modal-actions">

      <a
        href="../../tracking.html?tracking=${encodeURIComponent(
          shipment.tracking_number || ""
        )}"
        class="btn btn-secondary"
      >
        Track shipment
      </a>

    </div>

  `;

}


/*
 * Close assignment modal.
 */
function closeModal() {

  const modal =
    $("#assignment-modal");


  if (!modal) {
    return;
  }

  modal.classList.remove("open");
  modal.hidden = true;

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

}


/*
 * Modal events.
 */
function bindModal() {

  const close =
    $("#close-assignment-modal");


  const modal =
    $("#assignment-modal");


  const backdrop =
    modal?.querySelector(
      ".modal-backdrop"
    );


  close?.addEventListener(
    "click",
    closeModal
  );


  backdrop?.addEventListener(
    "click",
    closeModal
  );


  document.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key === "Escape" &&
        modal &&
        !modal.hidden
      ) {

        closeModal();

      }

    }
  );

}


/*
 * Page initialization.
 */
async function init() {

  try {

    const result =
      await initDriverDashboard();


    if (!result?.ctx) {
      return;
    }


    ctx =
      result.ctx;


    bindModal();


    await loadAssignments();


    $("#refresh-assignments")
      ?.addEventListener(
        "click",
        loadAssignments
      );


  } catch (error) {

    toast(
      error?.message ||
      "Unable to load assignments.",
      "error"
    );

  }

}


init();