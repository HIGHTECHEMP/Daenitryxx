import { supabase } from "./supabase-client.js";

import {
  $,
  escapeHtml,
  formatDate,
  money,
  toast,
  bindCopyButtons
} from "./utils.js";

import { initDriverDashboard } from "./driver-shared.js";


async function loadOverview(ctx) {

  if (!ctx?.session?.user?.id) {
    return;
  }

  const driverId = ctx.session.user.id;


  const [
    assignedResult,
    activeResult,
    completedResult,
    balanceResult,
    recentResult
  ] = await Promise.all([

    /*
     * CURRENT ASSIGNMENTS
     */
    supabase
      .from("delivery_assignments")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq("driver_id", driverId)
      .in("status", [
        "offered",
        "accepted"
      ]),


    /*
     * ACTIVE DELIVERIES
     */
    supabase
      .from("shipments")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq("driver_id", driverId)
      .in("status", [
        "driver_assigned",
        "picked_up",
        "in_transit",
        "out_for_delivery"
      ]),


    /*
     * COMPLETED DELIVERIES
     */
    supabase
      .from("shipments")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq("driver_id", driverId)
      .eq("status", "delivered"),


    /*
     * AVAILABLE BALANCE
     */
    supabase.rpc(
      "get_driver_available_balance"
    ),


    /*
     * RECENT DELIVERIES
     */
    supabase
      .from("shipments")
      .select(`
        id,
        tracking_number,
        pickup_city,
        delivery_city,
        status,
        updated_at
      `)
      .eq("driver_id", driverId)
      .order("updated_at", {
        ascending: false
      })
      .limit(5)

  ]);


  /*
   * ASSIGNED COUNT
   */

  if ($("#stat-assigned")) {

    $("#stat-assigned").textContent =
      assignedResult.error
        ? "0"
        : String(
            assignedResult.count ?? 0
          );

  }


  /*
   * ACTIVE COUNT
   */

  if ($("#stat-active")) {

    $("#stat-active").textContent =
      activeResult.error
        ? "0"
        : String(
            activeResult.count ?? 0
          );

  }


  /*
   * COMPLETED COUNT
   */

  if ($("#stat-completed")) {

    $("#stat-completed").textContent =
      completedResult.error
        ? "0"
        : String(
            completedResult.count ?? 0
          );

  }


  /*
   * AVAILABLE BALANCE
   */

  if ($("#stat-balance")) {

    if (balanceResult.error) {

      $("#stat-balance").textContent =
        "₦0.00";

    } else {

      $("#stat-balance").textContent =
        money(
          balanceResult.data || 0
        );

    }

  }


  /*
   * RECENT DELIVERIES
   */

  const body =
    $("#recent-assignments");

  if (!body) {
    return;
  }


  if (recentResult.error) {

    body.innerHTML = `
      <tr>
        <td colspan="5">
          Unable to load recent deliveries.
        </td>
      </tr>
    `;

    return;
  }


  const rows =
    recentResult.data || [];


  if (!rows.length) {

    body.innerHTML = `
      <tr>
        <td colspan="5">
          No deliveries found.
        </td>
      </tr>
    `;

    return;
  }


  body.innerHTML = rows
    .map((shipment) => {

      const status =
        String(
          shipment.status || "unknown"
        ).replaceAll("_", " ");


      return `
        <tr>

          <td>
            <div class="tracking-copy">
              <strong>${escapeHtml(shipment.tracking_number || "—")}</strong>
              ${
                shipment.tracking_number
                  ? `<button type="button" class="copy-tracking" data-copy-value="${escapeHtml(shipment.tracking_number)}" aria-label="Copy tracking number" title="Copy tracking number"><span class="copy-icon" aria-hidden="true"></span></button>`
                  : ""
              }
            </div>
          </td>


          <td>
            ${escapeHtml(
              shipment.pickup_city || "—"
            )}
            →
            ${escapeHtml(
              shipment.delivery_city || "—"
            )}
          </td>


          <td>
            <span class="status-badge">
              ${escapeHtml(status)}
            </span>
          </td>


          <td>
            ${formatDate(
              shipment.updated_at
            )}
          </td>


          <td>
            <a
              href="../tracking.html?tracking=${encodeURIComponent(
                shipment.tracking_number || ""
              )}"
              class="text-link"
            >
              View
            </a>
          </td>

        </tr>
      `;

    })
    .join("");

  bindCopyButtons(body);

}


async function init() {

  try {

    const result =
      await initDriverDashboard();


    if (!result?.ctx) {
      return;
    }


    await loadOverview(
      result.ctx
    );

  } catch (error) {

    toast(
      error?.message ||
      "Unable to load driver dashboard.",
      "error"
    );

  }

}


init();