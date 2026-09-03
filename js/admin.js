import { supabase } from "./supabase-client.js";
import { $ } from "./utils.js";
import { initAdminDashboard } from "./admin-shared.js";


async function loadStats(ctx) {
    if (!ctx?.session?.user?.id) {
        return;
    }

    const [
        customersResult,
        driversResult,
        shipmentsResult,
        pendingResult
    ] = await Promise.all([

        supabase
            .from("profiles")
            .select("id", {
                count: "exact",
                head: true
            })
            .eq("role", "customer"),

        supabase
            .from("profiles")
            .select("id", {
                count: "exact",
                head: true
            })
            .eq("role", "driver"),

        supabase
            .from("shipments")
            .select("id", {
                count: "exact",
                head: true
            }),

        supabase
            .from("shipments")
            .select("id", {
                count: "exact",
                head: true
            })
            .eq("status", "pending")
    ]);


    const customerStat = $("#stat-customers");
    const driverStat = $("#stat-drivers");
    const shipmentStat = $("#stat-shipments");
    const pendingStat = $("#stat-pending");


    if (customerStat) {
        customerStat.textContent =
            customersResult.error
                ? "—"
                : String(customersResult.count ?? 0);
    }


    if (driverStat) {
        driverStat.textContent =
            driversResult.error
                ? "—"
                : String(driversResult.count ?? 0);
    }


    if (shipmentStat) {
        shipmentStat.textContent =
            shipmentsResult.error
                ? "—"
                : String(shipmentsResult.count ?? 0);
    }


    if (pendingStat) {
        pendingStat.textContent =
            pendingResult.error
                ? "—"
                : String(pendingResult.count ?? 0);
    }
}


async function init() {

    try {

        const result = await initAdminDashboard();

        if (!result?.ctx) {
            return;
        }

        await loadStats(result.ctx);


        $("#refresh")?.addEventListener(
            "click",
            () => loadStats(result.ctx)
        );

    } catch (error) {

        console.error(
            "Admin dashboard initialization failed:",
            error
        );

    }
}


init();