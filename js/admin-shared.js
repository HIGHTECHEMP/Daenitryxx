import { supabase } from "./supabase-client.js";
import { requireRole } from "./auth.js";
import {
    $,
    $$,
    escapeHtml,
    formatDate,
    toast
} from "./utils.js";


export async function getAdminContext() {

    const ctx = await requireRole(["admin"]);

    if (!ctx) {
        return null;
    }

    ctx.user = ctx.session.user;

    return ctx;
}


/* ---------------------------------------
   SIDEBAR
--------------------------------------- */

export function bindAdminSidebar() {

    const sidebar = $(".sidebar");
    const toggle = $("#sidebar-toggle");

    if (!sidebar || !toggle) {
        return;
    }


    const setSidebar = (open) => {

        sidebar.classList.toggle(
            "open",
            open
        );

        toggle.setAttribute(
            "aria-expanded",
            String(open)
        );
    };


    toggle.addEventListener(
        "click",
        (event) => {

            event.stopPropagation();

            setSidebar(
                !sidebar.classList.contains("open")
            );

        }
    );


    $$(".sidebar a").forEach(
        (link) => {

            link.addEventListener(
                "click",
                () => {

                    if (window.innerWidth <= 900) {
                        setSidebar(false);
                    }

                }
            );

        }
    );


    document.addEventListener(
        "click",
        (event) => {

            if (window.innerWidth > 900) {
                return;
            }

            if (
                sidebar.classList.contains("open") &&
                !sidebar.contains(event.target) &&
                !toggle.contains(event.target)
            ) {
                setSidebar(false);
            }

        }
    );


    document.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Escape") {
                setSidebar(false);
            }

        }
    );


    window.addEventListener(
        "resize",
        () => {

            if (window.innerWidth > 900) {
                setSidebar(false);
            }

        }
    );
}


/* ---------------------------------------
   ADMIN NAME
--------------------------------------- */

export function setAdminName(ctx) {

    const name =
        ctx?.profile?.full_name ||
        ctx?.user?.user_metadata?.full_name ||
        "Administrator";


    const elements = [
        $("#user-name"),
        $("#admin-name"),
        $("#profile-name")
    ].filter(Boolean);


    elements.forEach(
        (element) => {

            element.textContent = name;

        }
    );
}


/* ---------------------------------------
   SIGN OUT
--------------------------------------- */

export function bindAdminSignOut() {
  const buttons = $$("[data-signout], #signout");

  buttons.forEach((button) => {
    button.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();

        button.disabled = true;

        const { error } =
          await supabase.auth.signOut();

        if (error) {
          button.disabled = false;

          toast(
            error.message ||
            "Unable to sign out.",
            "error"
          );

          return;
        }

        location.href =
          new URL(
            "../index.html",
            import.meta.url
          ).href;
      }
    );
  });
}


/* ---------------------------------------
   NOTIFICATIONS
--------------------------------------- */

export function bindAdminNotifications(ctx) {

    const bell =
        $("#notification-bell");

    const panel =
        $("#notification-panel");

    const list =
        $("#notification-list");

    const badge =
        $("#notification-badge");

    const markAll =
        $("#mark-all-notifications");


    if (!bell || !panel || !list) {

        return {
            refresh: async () => {}
        };

    }


    const loadNotifications = async () => {

        if (!ctx?.session?.user?.id) {
            return;
        }


        const { data, error } =
            await supabase
                .from("notifications")
                .select(
                    "id,title,body,read_at,created_at"
                )
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
                <div class="notification-empty">
                    Unable to load notifications.
                </div>
            `;

            return;
        }


        const notifications =
            data || [];


        const unread =
            notifications.filter(
                notification =>
                    !notification.read_at
            ).length;


        if (badge) {

            badge.textContent =
                unread > 99
                    ? "99+"
                    : String(unread);

            badge.hidden =
                unread === 0;

        }


        if (!notifications.length) {

            list.innerHTML = `
                <div class="notification-empty">
                    No notifications yet.
                </div>
            `;

            return;
        }


        list.innerHTML =
            notifications
                .map(
                    notification => `

                        <div
                            class="notification-item ${
                                notification.read_at
                                    ? ""
                                    : "notification-unread"
                            }"
                            data-notification-id="${escapeHtml(
                                notification.id
                            )}"
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
                                        notification.body ||
                                        ""
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
                                            data-read-notification="${escapeHtml(
                                                notification.id
                                            )}"
                                        >
                                            Mark read
                                        </button>
                                    `
                            }

                        </div>

                    `
                )
                .join("");


        $$(
            "[data-read-notification]",
            list
        ).forEach(
            (button) => {

                button.addEventListener(
                    "click",
                    async (event) => {

                        event.stopPropagation();


                        const id =
                            button.dataset
                                .readNotification;


                        const { error } =
                            await supabase
                                .from("notifications")
                                .update({
                                    read_at:
                                        new Date()
                                            .toISOString()
                                })
                                .eq(
                                    "id",
                                    id
                                )
                                .eq(
                                    "user_id",
                                    ctx.session.user.id
                                );


                        if (error) {

                            toast(
                                error.message ||
                                "Unable to update notification.",
                                "error"
                            );

                            return;
                        }


                        await loadNotifications();

                    }
                );

            }
        );

    };


    // Start closed and synchronize the drawer state.
    panel.classList.remove("open");
    panel.hidden = true;
    bell.setAttribute("aria-expanded", "false");
    panel.setAttribute("aria-hidden", "true");

    let notificationCloseTimer = null;

    const closePanel = () => {
        if (notificationCloseTimer) {
            clearTimeout(notificationCloseTimer);
            notificationCloseTimer = null;
        }

        panel.classList.remove("open");
        bell.setAttribute("aria-expanded", "false");
        panel.setAttribute("aria-hidden", "true");

        // Keep the drawer mounted while the closing animation plays.
        notificationCloseTimer = setTimeout(() => {
            if (!panel.classList.contains("open")) panel.hidden = true;
            notificationCloseTimer = null;
        }, 500);
    };

    bell.addEventListener(
        "click",
        async (event) => {
            event.stopPropagation();

            const open = !panel.classList.contains("open");

            if (open) {
                if (notificationCloseTimer) {
                    clearTimeout(notificationCloseTimer);
                    notificationCloseTimer = null;
                }
                panel.hidden = false;
                requestAnimationFrame(() => panel.classList.add("open"));
                bell.setAttribute("aria-expanded", "true");
                panel.setAttribute("aria-hidden", "false");
                await loadNotifications();
            } else {
                closePanel();
            }
        }
    );


    panel.addEventListener(
        "click",
        (event) => {
            event.stopPropagation();
        }
    );


    document.addEventListener(
        "click",
        () => {

            closePanel();

        }
    );


    if (markAll) {

        markAll.addEventListener(
            "click",
            async (event) => {

                event.stopPropagation();


                const { error } =
                    await supabase
                        .from("notifications")
                        .update({
                            read_at:
                                new Date()
                                    .toISOString()
                        })
                        .eq(
                            "user_id",
                            ctx.session.user.id
                        )
                        .is(
                            "read_at",
                            null
                        );


                if (error) {

                    toast(
                        error.message ||
                        "Unable to mark notifications.",
                        "error"
                    );

                    return;
                }


                await loadNotifications();

            }
        );

    }


    loadNotifications();


    return {
        refresh: loadNotifications
    };
}


/* ---------------------------------------
   INITIALIZE ADMIN SHELL
--------------------------------------- */

export async function initAdminDashboard() {

    const ctx =
        await getAdminContext();


    if (!ctx) {

        return {
            ctx: null,
            notifications: {
                refresh: async () => {}
            }
        };

    }


    bindAdminSidebar();

    setAdminName(ctx);

    bindAdminSignOut();

    const notifications =
        bindAdminNotifications(ctx);


    return {
        ctx,
        notifications
    };
}