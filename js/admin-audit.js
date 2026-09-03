import { supabase } from "./supabase-client.js";
import {
  $,
  escapeHtml,
  formatDate
} from "./utils.js";

export async function loadAudit() {
  const body = $("#audit-body");

  if (!body) return;

  const { data, error } = await supabase
    .from("audit_logs")
    .select(`
      action,
      entity_type,
      actor_id,
      created_at,
      details
    `)
    .order("created_at", {
      ascending: false
    })
    .limit(250);

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

  body.innerHTML =
    data?.length
      ? data
          .map(
            (row) => `
              <tr>

                <td>
                  ${escapeHtml(
                    row.action || "—"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    row.entity_type || "—"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    row.actor_id || "—"
                  )}
                </td>

                <td>
                  ${formatDate(
                    row.created_at
                  )}
                </td>

                <td>
                  <details>
                    <summary>Details</summary>
                    <pre>${escapeHtml(
                      JSON.stringify(
                        row.details || {},
                        null,
                        2
                      )
                    )}</pre>
                  </details>
                </td>

              </tr>
            `
          )
          .join("")
      : `
        <tr>
          <td colspan="5">
            <div class="empty">
              No audit activity.
            </div>
          </td>
        </tr>
      `;
}

export function initAuditPage() {
  $("#refresh-audit")
    ?.addEventListener(
      "click",
      loadAudit
    );

  loadAudit();
}