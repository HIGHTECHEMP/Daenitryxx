import { supabase } from "./supabase-client.js";
import {
  $,
  $$,
  escapeHtml,
  formatDate,
  toast
} from "./utils.js";
import { initDriverDashboard } from "./driver-shared.js";


let ctx = null;


async function loadPageNotifications() {

  const container =
    $("#notifications-page-list");

  if (!container) return;


  container.innerHTML = `
    <div class="notification-empty">
      Loading notifications...
    </div>
  `;


  const { data, error } = await supabase
    .from("notifications")
    .select(`
      id,
      title,
      message,
      is_read,
      created_at
    `)
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(100);


  if (error) {

    container.innerHTML = `
      <div class="notification-empty">
        ${escapeHtml(error.message)}
      </div>
    `;

    return;
  }


  const notifications = data || [];


  if (!notifications.length) {

    container.innerHTML = `
      <div class="notification-empty">
        No notifications yet.
      </div>
    `;

    return;
  }


  container.innerHTML = notifications
    .map(
      (notification) => `
        <article
          class="notification-page-item ${
            notification.is_read
              ? ""
              : "notification-unread"
          }"
        >

          <div class="notification-page-content">

            <div class="notification-page-top">

              <strong>
                ${escapeHtml(
                  notification.title ||
                  "Notification"
                )}
              </strong>

              <small>
                ${formatDate(
                  notification.created_at
                )}
              </small>

            </div>

            <p>
              ${escapeHtml(
                notification.message || ""
              )}
            </p>

          </div>

          ${
            notification.is_read
              ? ""
              : `
                <button
                  type="button"
                  class="text-button"
                  data-page-read="${escapeHtml(
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
    .join("");


  $$("[data-page-read]", container)
    .forEach((button) => {

      button.addEventListener(
        "click",
        async () => {

          const id =
            button.dataset.pageRead;


          const { error } =
            await supabase
              .from("notifications")
              .update({
                is_read: true
              })
              .eq("id", id)
              .eq("user_id", ctx.user.id);


          if (error) {

            toast(
              error.message ||
              "Unable to mark notification.",
              "error"
            );

            return;
          }


          await loadPageNotifications();

        }
      );

    });

}


function bindMarkAll() {

  $("#mark-all-page")
    ?.addEventListener(
      "click",
      async () => {

        const { error } =
          await supabase
            .from("notifications")
            .update({
              is_read: true
            })
            .eq("user_id", ctx.user.id)
            .eq("is_read", false);


        if (error) {

          toast(
            error.message ||
            "Unable to mark notifications.",
            "error"
          );

          return;
        }


        await loadPageNotifications();

        toast(
          "All notifications marked as read.",
          "success"
        );

      }
    );

}


async function init() {

  try {

    const result =
      await initDriverDashboard();

    ctx = result.ctx;

    bindMarkAll();

    await loadPageNotifications();

  } catch (error) {

    toast(
      error?.message ||
      "Unable to load notifications.",
      "error"
    );

  }

}


init();