import { supabase } from "./supabase-client.js";
import {
  $,
  $$,
  escapeHtml,
  formatDate,
  toast
} from "./utils.js";

export async function loadApplications() {
  const body = $("#applications-body");

  if (!body) return;

  const { data, error } = await supabase
    .from("driver_applications")
    .select(`
      id,
      full_name,
      phone,
      vehicle_type,
      license_reference,
      status,
      created_at,
      user_id,
      review_reason
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
    (data || [])
      .map(
        (application) => `
          <tr>

            <td>
              ${escapeHtml(
                application.full_name || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                application.phone || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                application.vehicle_type || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                application.license_reference || "—"
              )}
            </td>

            <td>
              <span class="status-pill">
                ${escapeHtml(
                  application.status || "—"
                )}
              </span>
            </td>

            <td>

              ${
                application.status === "pending"
                  ? `
                    <button
                      class="link-button approve-driver"
                      data-id="${escapeHtml(application.id)}"
                      type="button"
                    >
                      Approve
                    </button>

                    <button
                      class="link-button reject-driver"
                      data-id="${escapeHtml(application.id)}"
                      type="button"
                    >
                      Reject
                    </button>
                  `
                  : `
                    <button
                      class="link-button repair-driver"
                      data-id="${escapeHtml(application.id)}"
                      type="button"
                    >
                      Ensure driver
                    </button>
                  `
              }

            </td>

          </tr>
        `
      )
      .join("") ||
    `
      <tr>
        <td colspan="6">
          <div class="empty">
            No applications.
          </div>
        </td>
      </tr>
    `;

  $$(".approve-driver").forEach((button) => {
    button.onclick = () =>
      reviewApplication(
        button.dataset.id,
        "approved"
      );
  });

  $$(".reject-driver").forEach((button) => {
    button.onclick = () =>
      reviewApplication(
        button.dataset.id,
        "rejected"
      );
  });

  $$(".repair-driver").forEach((button) => {
    button.onclick = () =>
      repairDriver(button.dataset.id);
  });
}

async function reviewApplication(
  id,
  decision
) {
  const reason =
    decision === "rejected"
      ? prompt(
          "Reason for rejection (optional):"
        )
      : null;

  const { error } = await supabase.rpc(
    "review_driver_application",
    {
      p_application_id: id,
      p_decision: decision,
      p_reason: reason || null
    }
  );

  if (error) {
    toast(error.message, "error");
    return;
  }

  toast(
    `Application ${decision}`,
    "success"
  );

  await loadApplications();
}

async function repairDriver(id) {
  const { error } = await supabase.rpc(
    "repair_approved_driver",
    {
      p_application_id: id
    }
  );

  if (error) {
    toast(error.message, "error");
    return;
  }

  toast(
    "Approved driver record synchronized.",
    "success"
  );

  await loadApplications();
}

export function initApplicationsPage() {
  $("#refresh-applications")
    ?.addEventListener(
      "click",
      loadApplications
    );

  loadApplications();
}