import { supabase } from "./supabase-client.js";
import {
  $,
  $$,
  escapeHtml,
  formatDate,
  toast
} from "./utils.js";

let currentUserId = null;

export async function loadNotifications() {
  const list = $("#admin-notifications-list");

  if (!list || !currentUserId) return;

  const { data, error } = await supabase
    .from("notifications")
    .select(`
      id,
      title,
      body,
      read_at,
      created_at
    `)
    .eq(
      "user_id",
      currentUserId
    )
    .order("created_at", {
      ascending: false
    })
    .limit(100);

  if (error) {
    list.innerHTML = `
      <div class="notification-empty">
        ${escapeHtml(error.message)}
      </div>
    `;
    return;
  }

  list.innerHTML =
    data?.length
      ? data
          .map(
            (notification) => `
              <article
                class="notification-item ${
                  notification.read_at
                    ? ""
                    : "notification-unread"
                }"
              >

                <div class="notification-item-content">

                  <strong>
                    ${escapeHtml(
                      notification.title ||
                      "Notification"
                    )}
                  </strong>

                  <p>
                    ${escapeHtml(
                      notification.body || ""
                    )}
                  </p>

                  <small>
                    ${formatDate(
                      notification.created_at
                    )}
                  </small>

                </div>

                ${
                  notification.read_at
                    ? ""
                    : `
                      <button
                        type="button"
                        class="notification-read"
                        data-read-id="${escapeHtml(
                          notification.id
                        )}"
                      >
                        Mark read
                      </button>
                    `
                }

              </article>
            `
          )
          .join("")
      : `
        <div class="notification-empty">
          No notifications yet.
        </div>
      `;

  $$(".notification-read").forEach(
    (button) => {

      button.onclick = async () => {

        const { error } =
          await supabase
            .from("notifications")
            .update({
              read_at:
                new Date().toISOString()
            })
            .eq(
              "id",
              button.dataset.readId
            )
            .eq(
              "user_id",
              currentUserId
            );

        if (error) {
          toast(
            error.message,
            "error"
          );
          return;
        }

        await loadNotifications();
      };
    }
  );
}

async function markAllRead() {
  const { error } =
    await supabase
      .from("notifications")
      .update({
        read_at:
          new Date().toISOString()
      })
      .eq(
        "user_id",
        currentUserId
      )
      .is(
        "read_at",
        null
      );

  if (error) {
    toast(error.message, "error");
    return;
  }

  await loadNotifications();
}

export function initNotificationsPage(ctx) {
  currentUserId =
    ctx.session.user.id;

  $("#mark-all-admin")
    ?.addEventListener(
      "click",
      markAllRead
    );

  $("#refresh-admin-notifications")
    ?.addEventListener(
      "click",
      loadNotifications
    );

  loadNotifications();
}