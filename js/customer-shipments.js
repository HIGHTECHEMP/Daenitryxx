import { supabase } from "./supabase-client.js";
import {
  $,
  $$,
  escapeHtml,
  formatDate,
  money,
  toast,
  bindCopyButtons
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
      pickup_name,
      pickup_phone,
      pickup_address,
      pickup_city,
      delivery_name,
      delivery_phone,
      delivery_address,
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

          <div class="tracking-copy">
            <a
              href="../../tracking.html?tracking=${encodeURIComponent(
                shipment.tracking_number
              )}"
            >
              <b>${escapeHtml(shipment.tracking_number)}</b>
            </a>
            <button
              type="button"
              class="copy-tracking"
              data-copy-value="${escapeHtml(shipment.tracking_number)}"
              aria-label="Copy tracking number"
              title="Copy tracking number"
            ><span class="copy-icon" aria-hidden="true"></span></button>
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

  bindCopyButtons(body);


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

          <div class="tracking-copy">
            <h2>${escapeHtml(data.tracking_number)}</h2>
            <button
              type="button"
              class="copy-tracking"
              data-copy-value="${escapeHtml(data.tracking_number)}"
              aria-label="Copy tracking number"
              title="Copy tracking number"
            ><span class="copy-icon" aria-hidden="true"></span></button>
          </div>

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


      <div class="shipment-detail-grid">

        <div class="meta-box">
          <small>PICKUP</small>
          <strong>${escapeHtml(data.pickup_name || "—")}</strong>
          <p>${escapeHtml(data.pickup_phone || "—")}</p>
          <p>${escapeHtml(data.pickup_address || "—")}${data.pickup_city ? `, ${escapeHtml(data.pickup_city)}` : ""}</p>
        </div>

        <div class="meta-box">
          <small>RECEIVER</small>
          <strong>${escapeHtml(data.delivery_name || "—")}</strong>
          <p>${escapeHtml(data.delivery_phone || "—")}</p>
          <p>${escapeHtml(data.delivery_address || "—")}${data.delivery_city ? `, ${escapeHtml(data.delivery_city)}` : ""}</p>
        </div>

      </div>


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
  modal.classList.add("open");
  bindCopyButtons(modal);


  $("#close-detail")?.addEventListener(
    "click",
    () => {
      modal.classList.remove("open");
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

      modal.classList.remove("open");
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