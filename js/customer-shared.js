import { supabase } from "./supabase-client.js";
import { requireRole } from "./auth.js";
import {
  $,
  $$,
  escapeHtml,
  formatDate,
  toast
} from "./utils.js";

let customerContext = null;


/* =========================================================
   GET CUSTOMER CONTEXT
========================================================= */

export async function getCustomerContext() {
  if (customerContext) {
    return customerContext;
  }

  customerContext = await requireRole(["customer"]);

  return customerContext;
}


/* =========================================================
   SIDEBAR
========================================================= */

export function bindCustomerSidebar() {
  const button = $("#side-toggle");
  const sidebar = document.querySelector(".sidebar");

  if (!button || !sidebar) return;

  const closeSidebar = () => {
    sidebar.classList.remove("open");
    button.setAttribute("aria-expanded", "false");
  };

  const openSidebar = () => {
    sidebar.classList.add("open");
    button.setAttribute("aria-expanded", "true");
  };

  button.addEventListener("click", event => {
    event.stopPropagation();

    const isOpen =
      sidebar.classList.contains("open");

    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });


  /* -------------------------------------------------------
     CLOSE AFTER CLICKING A SIDEBAR LINK
  ------------------------------------------------------- */

  $$(".side-nav a").forEach(link => {

    link.addEventListener("click", () => {

      if (
        window.matchMedia("(max-width: 900px)").matches
      ) {
        closeSidebar();
      }

    });

  });


  /* -------------------------------------------------------
     CLOSE WHEN CLICKING OUTSIDE
  ------------------------------------------------------- */

  document.addEventListener("click", event => {

    if (
      !window.matchMedia("(max-width: 900px)").matches
    ) {
      return;
    }

    if (
      !sidebar.contains(event.target) &&
      !button.contains(event.target)
    ) {
      closeSidebar();
    }

  });


  /* -------------------------------------------------------
     ESCAPE KEY
  ------------------------------------------------------- */

  document.addEventListener("keydown", event => {

    if (event.key === "Escape") {
      closeSidebar();
    }

  });


  /* -------------------------------------------------------
     RESIZE SAFETY
  ------------------------------------------------------- */

  window.addEventListener("resize", () => {

    if (
      !window.matchMedia("(max-width: 900px)").matches
    ) {
      closeSidebar();
    }

  });

}


/* =========================================================
   USER NAME
========================================================= */

export function setCustomerName(ctx) {

  const element = $("#user-name");

  if (!element || !ctx) return;

  element.textContent =
    ctx.profile?.full_name ||
    ctx.session?.user?.email ||
    "Customer";

}


/* =========================================================
   SIGN OUT
========================================================= */

export function bindCustomerSignOut(ctx) {

  const button = $("#signout");

  if (!button) return;

  button.addEventListener("click", async () => {

    button.disabled = true;
    button.textContent = "Signing out…";

    const { error } =
      await supabase.auth.signOut();

    if (error) {

      button.disabled = false;
      button.textContent = "Sign out";

      toast(
        error.message ||
        "Unable to sign out.",
        "error"
      );

      return;
    }

    location.href = "../index.html";

  });

}


/* =========================================================
   NOTIFICATION BELL
========================================================= */

export async function bindCustomerNotifications(ctx) {

  const button =
    $("#notification-button");

  const panel =
    $("#notification-panel");

  const wrap =
    $("#notification-wrap");

  const list =
    $("#notifications-list");

  const badge =
    $("#notification-badge");

  const markAll =
    $("#mark-all-read");


  if (
    !button ||
    !panel ||
    !wrap ||
    !list
  ) {
    return;
  }


  /* -------------------------------------------------------
     LOAD NOTIFICATIONS
  ------------------------------------------------------- */

  async function loadNotifications() {

    const {
      data,
      error
    } = await supabase
      .from("notifications")
      .select(`
        id,
        title,
        body,
        created_at,
        read_at
      `)
      .eq(
        "user_id",
        ctx.session.user.id
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(30);


    if (error) {

      list.innerHTML = `
        <div class="empty">
          ${escapeHtml(error.message)}
        </div>
      `;

      if (badge) {
        badge.hidden = true;
      }

      return;
    }


    const notifications =
      data || [];


    const unread =
      notifications.filter(
        notification =>
          !notification.read_at
      );


    /* -----------------------------------------------------
       BADGE
    ----------------------------------------------------- */

    if (badge) {

      if (unread.length) {

        badge.hidden = false;

        badge.textContent =
          unread.length > 99
            ? "99+"
            : String(unread.length);

      } else {

        badge.hidden = true;

      }

    }


    /* -----------------------------------------------------
       EMPTY
    ----------------------------------------------------- */

    if (!notifications.length) {

      list.innerHTML = `
        <div class="empty">
          No notifications yet.
        </div>
      `;

      return;
    }


    /* -----------------------------------------------------
       RENDER
    ----------------------------------------------------- */

    list.innerHTML =
      notifications
        .map(notification => `

          <article
            class="
              notification-item
              ${notification.read_at ? "" : "unread"}
            "
            data-notification-id="${escapeHtml(
              notification.id
            )}"
          >

            <div class="notification-item-head">

              <strong>
                ${escapeHtml(
                  notification.title ||
                  "Notification"
                )}
              </strong>

              ${
                !notification.read_at
                  ? `
                    <span
                      class="notification-unread-dot"
                      aria-label="Unread"
                    ></span>
                  `
                  : ""
              }

            </div>


            <p>
              ${escapeHtml(
                notification.body || ""
              )}
            </p>


            <div class="notification-item-footer">

              <small>
                ${escapeHtml(
                  formatDate(
                    notification.created_at
                  )
                )}
              </small>


              ${
                !notification.read_at
                  ? `
                    <button
                      type="button"
                      class="link-button mark-notification-read"
                      data-id="${escapeHtml(
                        notification.id
                      )}"
                    >
                      Mark read
                    </button>
                  `
                  : ""
              }

            </div>

          </article>

        `)
        .join("");


    /* -----------------------------------------------------
       MARK INDIVIDUAL READ
    ----------------------------------------------------- */

    $$(".mark-notification-read").forEach(
      readButton => {

        readButton.addEventListener(
          "click",
          async event => {

            event.stopPropagation();

            readButton.disabled = true;

            const {
              error: updateError
            } = await supabase
              .from("notifications")
              .update({
                read_at:
                  new Date().toISOString()
              })
              .eq(
                "id",
                readButton.dataset.id
              )
              .eq(
                "user_id",
                ctx.session.user.id
              );


            if (updateError) {

              readButton.disabled = false;

              toast(
                updateError.message,
                "error"
              );

              return;
            }

            await loadNotifications();

          }
        );

      }
    );

  }


  /* -------------------------------------------------------
     TOGGLE NOTIFICATION PANEL
  ------------------------------------------------------- */

  // Start closed and keep native hidden state, drawer class, and ARIA synchronized.
  panel.classList.remove("open");
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  button.setAttribute("aria-expanded", "false");

  // Keep the drawer outside the dashboard stacking context so it always
  // renders above the page content and slides in from the right.
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }

  panel.addEventListener("click", event => {
    event.stopPropagation();
  });

  let notificationCloseTimer = null;

  const closePanel = () => {
    if (notificationCloseTimer) {
      clearTimeout(notificationCloseTimer);
      notificationCloseTimer = null;
    }

    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    button.setAttribute("aria-expanded", "false");

    // Keep the drawer mounted while the closing animation plays.
    notificationCloseTimer = setTimeout(() => {
      if (!panel.classList.contains("open")) panel.hidden = true;
      notificationCloseTimer = null;
    }, 500);
  };

  /* -------------------------------------------------------
   NOTIFICATION CLOSE BUTTON
------------------------------------------------------- */

const notificationCloseButton = document.createElement("button");

notificationCloseButton.type = "button";
notificationCloseButton.className = "notification-close";
notificationCloseButton.setAttribute(
  "aria-label",
  "Close notifications"
);
notificationCloseButton.setAttribute(
  "title",
  "Close notifications"
);

notificationCloseButton.innerHTML = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6L18 18"></path>
    <path d="M18 6L6 18"></path>
  </svg>
`;

const notificationHead = panel.querySelector(
  ".notification-panel-head"
);

if (
  notificationHead &&
  !notificationHead.querySelector(".notification-close")
) {
  notificationHead.appendChild(notificationCloseButton);
}

notificationCloseButton.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  closePanel();
});

  button.addEventListener(
    "click",
    async event => {

      event.stopPropagation();

      const open = !panel.classList.contains("open");

      if (open) {
        if (notificationCloseTimer) {
          clearTimeout(notificationCloseTimer);
          notificationCloseTimer = null;
        }
        panel.hidden = false;
        requestAnimationFrame(() => panel.classList.add("open"));
        panel.setAttribute("aria-hidden", "false");
        button.setAttribute("aria-expanded", "true");
        await loadNotifications();
      } else {
        closePanel();
      }

    }
  );


  /* -------------------------------------------------------
     CLOSE WHEN CLICKING OUTSIDE
  ------------------------------------------------------- */

  document.addEventListener(
    "click",
    event => {

      if (
        panel.hidden ||
        wrap.contains(event.target)
      ) {
        return;
      }

      closePanel();

    }
  );


  /* -------------------------------------------------------
     MARK ALL READ
  ------------------------------------------------------- */

  markAll?.addEventListener(
    "click",
    async event => {

      event.stopPropagation();

      markAll.disabled = true;
      markAll.textContent = "Updating…";

      const {
        error
      } = await supabase
        .from("notifications")
        .update({
          read_at:
            new Date().toISOString()
        })
        .eq(
          "user_id",
          ctx.session.user.id
        )
        .is(
          "read_at",
          null
        );


      markAll.disabled = false;
      markAll.textContent = "Mark all read";


      if (error) {

        toast(
          error.message,
          "error"
        );

        return;
      }

      await loadNotifications();

    }
  );


  await loadNotifications();

  return {
    refresh: loadNotifications
  };

}


/* =========================================================
   INITIALIZE COMMON CUSTOMER DASHBOARD
========================================================= */

export async function initCustomerDashboard() {

  bindCustomerSidebar();

  const ctx =
    await getCustomerContext();

  if (!ctx) {
    return null;
  }

  setCustomerName(ctx);

  bindCustomerSignOut(ctx);

  const notifications =
    await bindCustomerNotifications(ctx);

  return {
    ctx,
    notifications
  };

}