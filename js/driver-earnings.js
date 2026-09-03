import { supabase } from "./supabase-client.js";
import {
  $,
  escapeHtml,
  formatDate,
  money,
  formMessage,
  toast,
  bindCopyButtons
} from "./utils.js";
import { initDriverDashboard } from "./driver-shared.js";


let ctx = null;


async function loadEarnings() {

  const body = $("#earnings-body");

  if (!body) return;


  body.innerHTML = `
    <tr>
      <td colspan="6">
        Loading earnings...
      </td>
    </tr>
  `;


  const [
    earningsResult,
    payoutsResult,
    balanceResult
  ] = await Promise.all([

    supabase
      .from("driver_earnings")
      .select(`
        id,
        shipment_id,
        amount,
        status,
        created_at,
        shipments (
          tracking_number
        )
      `)
      .eq("driver_id", ctx.user.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("driver_payouts")
      .select(`
        id,
        amount,
        status,
        provider_reference,
        notes,
        requested_at,
        processed_at,
        receipt_path,
        receipt_original_name
      `)
      .eq("driver_id", ctx.user.id)
      .order("requested_at", { ascending: false }),

    supabase.rpc("get_driver_available_balance")

  ]);


  if (balanceResult.error) {
    $("#payout-available").textContent = "₦0.00";
  } else {
    $("#payout-available").textContent =
      money(balanceResult.data || 0);
  }


  const earnings = earningsResult.data || [];
  const payouts = payoutsResult.data || [];


  const totalEarned = earnings
    .filter((item) =>
      ["approved", "paid"].includes(item.status)
    )
    .reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );


  const pendingPayouts = payouts
  .filter((item) => item.status === "pending")
  .reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );


  if ($("#total-earned")) {
    $("#total-earned").textContent =
      money(totalEarned);
  }


  if ($("#pending-payouts")) {
    $("#pending-payouts").textContent =
      money(pendingPayouts);
  }


  const history = [

    ...earnings.map((item) => ({
      type: "Earning",
      reference:
        item.shipments?.tracking_number ||
        item.shipment_id ||
        "Delivery",
      amount: Number(item.amount || 0),
      status: item.status,
      date: item.created_at,
      receipt: null,
      tracking_number: item.shipments?.tracking_number || null,
      shipments: item.shipments
    })),

    ...payouts.map((item) => ({
      type: "Payout",
      reference:
        item.provider_reference ||
        item.id,
      amount: Number(item.amount || 0),
      status: item.status,
      date:
        item.processed_at ||
        item.requested_at,
      receipt: item
    }))

  ].sort(
    (a, b) =>
      new Date(b.date) -
      new Date(a.date)
  );


  if (!history.length) {

    body.innerHTML = `
      <tr>
        <td colspan="6">
          No earnings or payout history yet.
        </td>
      </tr>
    `;

    return;
  }


  body.innerHTML = history.map((item) => {

    const receipt =
      item.receipt?.receipt_path
        ? `
          <button
            type="button"
            class="text-button"
            data-receipt="${escapeHtml(
              item.receipt.receipt_path
            )}"
          >
            View receipt
          </button>
        `
        : "—";


    return `
      <tr>

        <td>
          ${escapeHtml(item.type)}
        </td>

        <td>
          ${
            item.type === "Earning" && item.shipments?.tracking_number
              ? `<span class="tracking-copy"><b>${escapeHtml(item.reference)}</b><button type="button" class="copy-tracking" data-copy-value="${escapeHtml(item.reference)}" aria-label="Copy tracking number" title="Copy tracking number"><span class="copy-icon" aria-hidden="true"></span></button></span>`
              : escapeHtml(item.reference)
          }
        </td>

        <td>
          ${money(item.amount)}
        </td>

        <td>
          <span class="status-badge">
            ${escapeHtml(item.status)}
          </span>
        </td>

        <td>
          ${formatDate(item.date)}
        </td>

        <td>
          ${receipt}
        </td>

      </tr>
    `;

  }).join("");


  bindCopyButtons(body);

  body
    .querySelectorAll("[data-receipt]")
    .forEach((button) => {

      button.addEventListener("click", async () => {

        const path = button.dataset.receipt;

        const { data, error } =
          await supabase.storage
            .from("payout-receipts")
            .createSignedUrl(path, 300);


        if (error || !data?.signedUrl) {

          toast(
            "Unable to open receipt.",
            "error"
          );

          return;
        }


        window.open(
          data.signedUrl,
          "_blank",
          "noopener,noreferrer"
        );

      });

    });

}


function bindPayoutForm() {

  const form = $("#payout-form");

  if (!form) return;


  form.addEventListener("submit", async (event) => {

    event.preventDefault();


    const amount =
      Number(
        $("#payout-amount")?.value || 0
      );

    const bankName =
      $("#payout-bank-name")?.value.trim();

    const accountName =
      $("#payout-account-name")?.value.trim();

    const accountNumber =
      $("#payout-account-number")?.value.trim();

    const notes =
      form.elements.notes?.value.trim() || null;


    if (!amount || amount <= 0) {

      formMessage(
        form,
        "Enter a valid payout amount.",
        "error"
      );

      return;
    }


    if (!bankName || !accountName || !accountNumber) {

      formMessage(
        form,
        "Bank name, account name and account number are required.",
        "error"
      );

      return;
    }


    if (!/^\d{8,20}$/.test(accountNumber)) {

      formMessage(
        form,
        "Account number must contain 8–20 digits.",
        "error"
      );

      return;
    }


    const button =
      form.querySelector("button[type='submit']");


    if (button) {
      button.disabled = true;
      button.textContent = "Submitting...";
    }


    const { error } =
      await supabase.rpc(
        "request_driver_payout",
        {
          p_amount: amount,
          p_notes: notes,
          p_bank_name: bankName,
          p_account_name: accountName,
          p_account_number: accountNumber
        }
      );


    if (button) {
      button.disabled = false;
      button.textContent = "Request payout";
    }


    if (error) {

      formMessage(
        form,
        error.message ||
          "Unable to submit payout request.",
        "error"
      );

      return;
    }


    form.reset();


    formMessage(
      form,
      "Payout request submitted successfully.",
      "success"
    );


    toast(
      "Payout request submitted.",
      "success"
    );


    await loadEarnings();

  });

}


async function init() {

  try {

    const result =
      await initDriverDashboard();

    ctx = result.ctx;

    bindPayoutForm();

    await loadEarnings();


    $("#refresh-earnings")
      ?.addEventListener(
        "click",
        loadEarnings
      );

  } catch (error) {

    toast(
      error?.message ||
      "Unable to load earnings.",
      "error"
    );

  }

}


init();