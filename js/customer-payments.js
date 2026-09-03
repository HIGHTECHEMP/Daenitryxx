import { supabase } from "./supabase-client.js";
import {
  $,
  escapeHtml,
  formatDate,
  money,
  toast
} from "./utils.js";

import {
  initCustomerDashboard
} from "./customer-shared.js";


let ctx;


/* =========================================================
   LOAD PAYMENT HISTORY
========================================================= */

async function loadPayments() {

  const body =
    $("#payments-body");

  if (!body) return;


  const {
    data,
    error
  } = await supabase
    .from("payments")
    .select(`
      provider_reference,
      amount,
      currency,
      status,
      created_at,
      shipment:shipments(
        tracking_number
      )
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
    .limit(100);


  if (error) {

    body.innerHTML = `
      <tr>
        <td colspan="6">
          ${escapeHtml(error.message)}
        </td>
      </tr>
    `;

    return;
  }


  if (!data?.length) {

    body.innerHTML = `
      <tr>

        <td colspan="6">

          <div class="empty">
            No payment records yet.
          </div>

        </td>

      </tr>
    `;

    return;
  }


  body.innerHTML =
    data.map(payment => `

      <tr>

        <td>
          ${escapeHtml(
            payment.provider_reference ||
            "—"
          )}
        </td>


        <td>
          ${escapeHtml(
            payment.shipment
              ?.tracking_number ||
            "Not created"
          )}
        </td>


        <td>
          ${escapeHtml(
            money(
              payment.amount,
              payment.currency
            )
          )}
        </td>


        <td>
          ${escapeHtml(
            payment.currency ||
            "—"
          )}
        </td>


        <td>

          <span class="status-pill">

            ${escapeHtml(
              payment.status ||
              "—"
            )}

          </span>

        </td>


        <td>
          ${escapeHtml(
            formatDate(
              payment.created_at
            )
          )}
        </td>

      </tr>

    `).join("");

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


  await loadPayments();


  $("#refresh")?.addEventListener(
    "click",
    async () => {

      await loadPayments();

      await dashboard.notifications?.refresh();

      toast(
        "Payments refreshed.",
        "success"
      );

    }
  );

}


init();