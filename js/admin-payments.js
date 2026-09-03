import { supabase } from "./supabase-client.js";
import {
  $,
  escapeHtml,
  formatDate,
  money
} from "./utils.js";

export async function loadPayments() {
  const body = $("#payments-body");

  if (!body) return;

  const { data, error } = await supabase
    .from("payments")
    .select(`
      id,
      provider_reference,
      amount,
      currency,
      status,
      created_at,
      customer:profiles!payments_customer_id_fkey(
        full_name
      ),
      shipment:shipments(
        tracking_number
      )
    `)
    .order("created_at", {
      ascending: false
    })
    .limit(250);

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

  body.innerHTML =
    data?.length
      ? data
          .map(
            (payment) => `
              <tr>

                <td>
                  ${escapeHtml(
                    payment.provider_reference ||
                    "—"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    payment.customer?.full_name ||
                    "—"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    payment.shipment
                      ?.tracking_number ||
                    "Not linked"
                  )}
                </td>

                <td>
                  ${money(
                    payment.amount,
                    payment.currency
                  )}
                </td>

                <td>
                  <span class="status-pill">
                    ${escapeHtml(
                      payment.status || "—"
                    )}
                  </span>
                </td>

                <td>
                  ${formatDate(
                    payment.created_at
                  )}
                </td>

              </tr>
            `
          )
          .join("")
      : `
        <tr>
          <td colspan="6">
            <div class="empty">
              No payment transactions.
            </div>
          </td>
        </tr>
      `;
}

export function initPaymentsPage() {
  $("#refresh-payments")
    ?.addEventListener(
      "click",
      loadPayments
    );

  loadPayments();
}