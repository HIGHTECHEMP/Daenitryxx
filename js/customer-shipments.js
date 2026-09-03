import { supabase } from "./supabase-client.js";
import {
  $,
  $$,
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
   LOAD SHIPMENTS
========================================================= */

async function loadShipments() {

  const body =
    $("#shipments-body");

  if (!body) return;


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
      created_at,
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
    .limit(100);


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


  if (!data?.length) {

    body.innerHTML = `
      <tr>
        <td colspan="7">

          <div class="empty">

            No paid shipments yet.

            <br>

            <a
              class="text-link"
              href="../../book-delivery.html"
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
            href="../../tracking.html?tracking=${encodeURIComponent(
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
          ${escapeHtml(
            shipment.package_description || "—"
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
            formatDate(
              shipment.updated_at
            )
          )}
        </td>


        <td>

          <button
            class="link-button view-shipment"
            data-id="${escapeHtml(
              shipment.id
            )}"
            type="button"
          >
            View
          </button>

        </td>

      </tr>

    `).join("");


  $$(".view-shipment").forEach(
    button => {

      button.addEventListener(
        "click",
        () =>
          showShipment(
            button.dataset.id
          )
      );

    }
  );

}


/* =========================================================
   SHIPMENT DETAILS
========================================================= */

async function showShipment(id) {

  const modal =
    $("#detail-modal");

  if (!modal) return;


  const {
    data,
    error
  } = await supabase
    .from("shipments")
    .select(`
      *,
      shipment_status_history(
        status,
        note,
        created_at
      )
    `)
    .eq(
      "id",
      id
    )
    .eq(
      "customer_id",
      ctx.session.user.id
    )
    .single();


  if (error) {

    toast(
      error.message,
      "error"
    );

    return;
  }


  const history =
    [...(
      data.shipment_status_history || []
    )]
      .sort(
        (a, b) =>
          new Date(a.created_at) -
          new Date(b.created_at)
      );


  modal.innerHTML = `

    <div class="dash-panel modal-panel">

      <div class="panel-head">

        <div>

          <span class="eyebrow">
            SHIPMENT
          </span>

          <h2>
            ${escapeHtml(
              data.tracking_number
            )}
          </h2>

        </div>


        <button
          class="link-button"
          id="close-detail"
          type="button"
        >
          Close
        </button>

      </div>


      <p>

        <b>Status:</b>

        <span class="status-pill">

          ${escapeHtml(
            String(
              data.status || "—"
            ).replaceAll(
              "_",
              " "
            )
          )}

        </span>

      </p>


      <p>

        <b>Pickup:</b><br>

        ${escapeHtml(
          data.pickup_address || "—"
        )}

        ${
          data.pickup_city
            ? `, ${escapeHtml(
                data.pickup_city
              )}`
            : ""
        }

      </p>


      <p>

        <b>Delivery:</b><br>

        ${escapeHtml(
          data.delivery_address || "—"
        )}

        ${
          data.delivery_city
            ? `, ${escapeHtml(
                data.delivery_city
              )}`
            : ""
        }

      </p>


      <p>

        <b>Package:</b><br>

        ${escapeHtml(
          data.package_description || "—"
        )}

        ·

        ${escapeHtml(
          String(
            data.package_weight_kg ?? "—"
          )
        )}

        kg

      </p>


      <p>

        <b>Paid delivery fee:</b>

        ${escapeHtml(
          money(
            data.delivery_fee
          )
        )}

      </p>


      ${
        ["pending", "confirmed"].includes(
          data.status
        )

          ? `

            <button
              class="btn btn-ghost"
              id="cancel-shipment"
              type="button"
            >
              Cancel eligible request
            </button>

          `

          : ""
      }


      <h3>
        Shipment history
      </h3>


      <div class="shipment-history">

        ${
          history.length

            ? history.map(entry => `

                <p>

                  •

                  <b>
                    ${escapeHtml(
                      String(
                        entry.status || ""
                      ).replaceAll(
                        "_",
                        " "
                      )
                    )}
                  </b>

                  —

                  ${escapeHtml(
                    formatDate(
                      entry.created_at
                    )
                  )}

                  ${
                    entry.note
                      ? ` — ${escapeHtml(
                          entry.note
                        )}`
                      : ""
                  }

                </p>

              `).join("")

            : `
                <p class="muted">
                  No status history available.
                </p>
              `
        }

      </div>

    </div>

  `;


  modal.hidden = false;


  $("#close-detail")?.addEventListener(
    "click",
    () => {
      modal.hidden = true;
    }
  );


  $("#cancel-shipment")?.addEventListener(
    "click",
    async buttonEvent => {

      const button =
        buttonEvent.currentTarget;

      if (
        !confirm(
          "Cancel this shipment request?"
        )
      ) {
        return;
      }


      button.disabled = true;
      button.textContent =
        "Cancelling…";


      const {
        error: cancelError
      } = await supabase.rpc(
        "cancel_shipment",
        {
          p_shipment_id: id
        }
      );


      if (cancelError) {

        button.disabled = false;
        button.textContent =
          "Cancel eligible request";

        toast(
          cancelError.message,
          "error"
        );

        return;
      }


      toast(
        "Shipment cancelled.",
        "success"
      );

      modal.hidden = true;

      await loadShipments();

    }
  );

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


  await loadShipments();


  $("#refresh")?.addEventListener(
    "click",
    async () => {

      await loadShipments();

      await dashboard.notifications?.refresh();

      toast(
        "Shipments refreshed.",
        "success"
      );

    }
  );

}


init();