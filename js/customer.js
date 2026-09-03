import { supabase } from "./supabase-client.js";
import { $, escapeHtml, money, toast } from "./utils.js";
import {
  initCustomerDashboard
} from "./customer-shared.js";


let ctx;


/* =========================================================
   DASHBOARD STATS
========================================================= */

async function loadStats() {

  const results =
    await Promise.all([

      supabase
        .from("shipments")
        .select(
          "id",
          {
            count: "exact",
            head: true
          }
        )
        .eq(
          "customer_id",
          ctx.session.user.id
        ),

      supabase
        .from("shipments")
        .select(
          "id",
          {
            count: "exact",
            head: true
          }
        )
        .eq(
          "customer_id",
          ctx.session.user.id
        )
        .not(
          "status",
          "in",
          "('delivered','cancelled','failed_delivery')"
        ),

      supabase
        .from("shipments")
        .select(
          "id",
          {
            count: "exact",
            head: true
          }
        )
        .eq(
          "customer_id",
          ctx.session.user.id
        )
        .eq(
          "status",
          "delivered"
        )

    ]);


  const total =
    $("#stat-total");

  const active =
    $("#stat-active");

  const delivered =
    $("#stat-delivered");


  if (total) {
    total.textContent =
      results[0].count ?? 0;
  }

  if (active) {
    active.textContent =
      results[1].count ?? 0;
  }

  if (delivered) {
    delivered.textContent =
      results[2].count ?? 0;
  }

}


/* =========================================================
   RECENT SHIPMENTS
========================================================= */

async function loadRecentShipments() {

  const body =
    $("#shipments-body");

  if (!body) {
    return;
  }


  const {
    data,
    error
  } = await supabase
    .from("shipments")
    .select(`
      id,
      tracking_number,
      pickup_city,
      delivery_city,
      package_description,
      delivery_fee,
      status,
      updated_at
    `)
    .eq(
      "customer_id",
      ctx.session.user.id
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    )
    .limit(5);


  if (error) {

    body.innerHTML = `
      <tr>
        <td colspan="5">
          ${escapeHtml(error.message)}
        </td>
      </tr>
    `;

    return;
  }


  if (!data?.length) {

    body.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty">
            No paid shipments yet.
            <a
              class="text-link"
              href="../book-delivery.html"
            >
              Book a delivery →
            </a>
          </div>
        </td>
      </tr>
    `;

    return;
  }


  body.innerHTML =
    data.map(shipment => `

      <tr>

        <td>

          <a
            href="../tracking.html?tracking=${encodeURIComponent(
              shipment.tracking_number
            )}"
          >

            <b>
              ${escapeHtml(
                shipment.tracking_number
              )}
            </b>

          </a>

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

          <span class="status-pill">

            ${escapeHtml(
              String(
                shipment.status || "—"
              ).replaceAll(
                "_",
                " "
              )
            )}

          </span>

        </td>


        <td>
          ${escapeHtml(
            money(
              shipment.delivery_fee
            )
          )}
        </td>


        <td>
          ${escapeHtml(
            new Date(
              shipment.updated_at
            ).toLocaleDateString()
          )}
        </td>

      </tr>

    `).join("");

}


/* =========================================================
   REFRESH DASHBOARD
========================================================= */

async function refreshDashboard() {

  await Promise.all([
    loadStats(),
    loadRecentShipments()
  ]);

}


/* =========================================================
   INIT
========================================================= */

async function init() {

  const dashboard =
    await initCustomerDashboard();

  if (!dashboard) {
    return;
  }

  ctx =
    dashboard.ctx;


  await refreshDashboard();


  $("#refresh")?.addEventListener(
    "click",
    async () => {

      const button =
        $("#refresh");

      if (button) {
        button.disabled = true;
        button.textContent =
          "Refreshing…";
      }

      try {

        await refreshDashboard();

        await dashboard.notifications?.refresh();

        toast(
          "Dashboard refreshed.",
          "success"
        );

      } finally {

        if (button) {
          button.disabled = false;
          button.textContent =
            "Refresh";
        }

      }

    }
  );

}


init();