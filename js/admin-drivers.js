import { supabase } from "./supabase-client.js";
import {
  $,
  $$,
  escapeHtml,
  formatDate,
  toast
} from "./utils.js";

export async function loadDrivers() {
  const body = $("#drivers-body");

  if (!body) return;

  const { data, error } = await supabase
    .from("drivers")
    .select(`
      id,
      user_id,
      vehicle_type,
      availability,
      verification_status,
      created_at,
      profiles:profiles!drivers_user_id_fkey(
        full_name,
        phone
      )
    `)
    .eq(
      "verification_status",
      "approved"
    )
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
        (driver) => `
          <tr>

            <td>
              ${escapeHtml(
                driver.profiles?.full_name || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                driver.profiles?.phone || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                driver.vehicle_type || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                driver.verification_status
              )}
            </td>

            <td>

              <select
                class="driver-availability"
                data-id="${escapeHtml(driver.user_id)}"
              >
                <option
                  value="available"
                  ${
                    driver.availability ===
                    "available"
                      ? "selected"
                      : ""
                  }
                >
                  available
                </option>

                <option
                  value="busy"
                  ${
                    driver.availability ===
                    "busy"
                      ? "selected"
                      : ""
                  }
                >
                  busy
                </option>

                <option
                  value="offline"
                  ${
                    driver.availability ===
                    "offline"
                      ? "selected"
                      : ""
                  }
                >
                  offline
                </option>
              </select>

            </td>

            <td>

              <button
                class="link-button suspend-driver"
                data-id="${escapeHtml(driver.user_id)}"
                type="button"
              >
                Suspend
              </button>

            </td>

          </tr>
        `
      )
      .join("") ||
    `
      <tr>
        <td colspan="6">
          <div class="empty">
            No approved drivers.
          </div>
        </td>
      </tr>
    `;

  $$(".driver-availability").forEach(
    (select) => {
      select.onchange = async () => {

        const { error: updateError } =
          await supabase.rpc(
            "admin_set_driver_availability",
            {
              p_driver_id:
                select.dataset.id,

              p_availability:
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
          "Driver availability updated.",
          "success"
        );
      };
    }
  );

  $$(".suspend-driver").forEach(
    (button) => {
      button.onclick = async () => {

        if (
          !confirm(
            "Suspend this driver? They will no longer be available for new assignments."
          )
        ) {
          return;
        }

        const { error } =
          await supabase.rpc(
            "admin_suspend_driver",
            {
              p_driver_id:
                button.dataset.id
            }
          );

        if (error) {
          toast(error.message, "error");
          return;
        }

        toast(
          "Driver suspended.",
          "success"
        );

        await loadDrivers();
      };
    }
  );
}

export function initDriversPage() {
  $("#refresh-drivers")
    ?.addEventListener(
      "click",
      loadDrivers
    );

  loadDrivers();
}