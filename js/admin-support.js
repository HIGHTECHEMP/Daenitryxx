import { supabase } from "./supabase-client.js";
import {
  $,
  $$,
  escapeHtml,
  formatDate,
  toast
} from "./utils.js";

export async function loadSupport() {
  const body = $("#support-body");

  if (!body) return;

  const { data, error } = await supabase
    .from("support_requests")
    .select(`
      id,
      subject,
      status,
      created_at,
      name,
      email,
      message
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
            (request) => `
              <tr>

                <td>
                  ${escapeHtml(
                    request.subject || "—"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    request.name || "—"
                  )}
                </td>

                <td>

                  <select
                    class="support-status"
                    data-id="${escapeHtml(request.id)}"
                  >

                    <option
                      value="open"
                      ${
                        request.status === "open"
                          ? "selected"
                          : ""
                      }
                    >
                      open
                    </option>

                    <option
                      value="in_progress"
                      ${
                        request.status ===
                        "in_progress"
                          ? "selected"
                          : ""
                      }
                    >
                      in_progress
                    </option>

                    <option
                      value="resolved"
                      ${
                        request.status ===
                        "resolved"
                          ? "selected"
                          : ""
                      }
                    >
                      resolved
                    </option>

                    <option
                      value="closed"
                      ${
                        request.status === "closed"
                          ? "selected"
                          : ""
                      }
                    >
                      closed
                    </option>

                  </select>

                </td>

                <td>
                  ${formatDate(
                    request.created_at
                  )}
                </td>

                <td>

                  <button
                    class="link-button support-view"
                    data-id="${escapeHtml(request.id)}"
                    type="button"
                  >
                    View
                  </button>

                </td>

              </tr>
            `
          )
          .join("")
      : `
        <tr>
          <td colspan="5">
            <div class="empty">
              No support requests.
            </div>
          </td>
        </tr>
      `;

  $$(".support-status").forEach(
    (select) => {

      select.onchange = async () => {

        const { error: updateError } =
          await supabase.rpc(
            "admin_update_support",
            {
              p_request_id:
                select.dataset.id,

              p_status:
                select.value
            }
          );

        if (updateError) {
          toast(
            updateError.message,
            "error"
          );
          return;
        }

        toast(
          "Support request updated.",
          "success"
        );
      };
    }
  );

  $$(".support-view").forEach(
    (button) => {

      button.onclick = () => {

        const request =
          data.find(
            (item) =>
              item.id ===
              button.dataset.id
          );

        if (!request) return;

        alert(
          `${request.name || ""}\n${
            request.email || ""
          }\n\n${
            request.subject || ""
          }\n\n${
            request.message || ""
          }`
        );
      };
    }
  );
}

export function initSupportPage() {
  $("#refresh-support")
    ?.addEventListener(
      "click",
      loadSupport
    );

  loadSupport();
}