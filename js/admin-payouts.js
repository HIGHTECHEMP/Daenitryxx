import { supabase } from "./supabase-client.js";
import {
  $,
  $$,
  escapeHtml,
  formatDate,
  money,
  toast
} from "./utils.js";

export async function loadPayouts() {
  const body = $("#payouts-body");

  if (!body) return;

  const { data, error } = await supabase
    .from("driver_payouts")
    .select(`
      id,
      driver_id,
      amount,
      status,
      requested_at,
      processed_at,
      bank_name,
      account_name,
      account_number,
      receipt_path,
      receipt_original_name,
      receipt_uploaded_at,
      notes,
      driver:profiles!driver_payouts_driver_id_fkey(
        full_name
      )
    `)
    .order("requested_at", {
      ascending: false
    })
    .limit(250);

  if (error) {
    body.innerHTML = `
      <tr>
        <td colspan="8">
          ${escapeHtml(error.message)}
        </td>
      </tr>
    `;
    return;
  }

  if (!data?.length) {
    body.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty">
            No payout requests found.
          </div>
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = data.map((item) => {

    const driverName =
      item.driver?.full_name ||
      "Unknown driver";

    const receiptHtml =
      item.receipt_path
        ? `
          <button
            type="button"
            class="link-button payout-view-receipt"
            data-path="${escapeHtml(
              item.receipt_path
            )}"
          >
            View receipt
          </button>
        `
        : "Not uploaded";

    let actionHtml = "—";

    if (item.status === "pending") {

      actionHtml = `
        <div class="payout-actions">

          <input
            type="file"
            class="payout-receipt-input"
            data-id="${escapeHtml(item.id)}"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
          >

          <button
            type="button"
            class="btn btn-primary payout-upload"
            data-id="${escapeHtml(item.id)}"
          >
            Upload receipt
          </button>

          <button
            type="button"
            class="link-button payout-approve"
            data-id="${escapeHtml(item.id)}"
            ${item.receipt_path ? "" : "disabled"}
          >
            Approve
          </button>

          <button
            type="button"
            class="link-button payout-reject"
            data-id="${escapeHtml(item.id)}"
          >
            Reject
          </button>

          <span
            class="payout-upload-status"
            data-status-for="${escapeHtml(item.id)}"
          ></span>

        </div>
      `;
    }

    return `
      <tr>

        <td>
          ${escapeHtml(driverName)}
        </td>

        <td>
          ${escapeHtml(
            money(Number(item.amount || 0))
          )}
        </td>

        <td>
          ${escapeHtml(
            item.bank_name || "—"
          )}
        </td>

        <td>
          <strong>
            ${escapeHtml(
              item.account_name || "—"
            )}
          </strong>
          <br>
          <span class="muted">
            ${escapeHtml(
              item.account_number || "—"
            )}
          </span>
        </td>

        <td>
          ${escapeHtml(item.status)}
        </td>

        <td>
          ${formatDate(item.requested_at)}
        </td>

        <td>
          ${receiptHtml}
        </td>

        <td>
          ${actionHtml}
        </td>

      </tr>
    `;
  }).join("");

  $$(".payout-upload").forEach(
    (button) => {
      button.onclick = () => {

        const id = button.dataset.id;

        const input =
          document.querySelector(
            `.payout-receipt-input[data-id="${CSS.escape(id)}"]`
          );

        uploadPayoutReceipt(
          id,
          input
        );
      };
    }
  );

  $$(".payout-approve").forEach(
    (button) => {
      button.onclick = () =>
        processPayout(
          button.dataset.id,
          "approved"
        );
    }
  );

  $$(".payout-reject").forEach(
    (button) => {
      button.onclick = () =>
        processPayout(
          button.dataset.id,
          "rejected"
        );
    }
  );

  $$(".payout-view-receipt").forEach(
    (button) => {
      button.onclick = async () => {

        const path =
          button.dataset.path;

        if (!path) return;

        const { data, error } =
          await supabase
            .storage
            .from("payout-receipts")
            .createSignedUrl(
              path,
              3600
            );

        if (error) {
          toast(
            error.message,
            "error"
          );
          return;
        }

        if (data?.signedUrl) {
          window.open(
            data.signedUrl,
            "_blank",
            "noopener,noreferrer"
          );
        }
      };
    }
  );
}

async function uploadPayoutReceipt(
  payoutId,
  input
) {
  if (!input?.files?.length) {
    toast(
      "Select a payment receipt first.",
      "error"
    );
    return;
  }

  const file = input.files[0];

  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    toast(
      "Receipt must be a PDF, JPG, PNG, or WEBP file.",
      "error"
    );

    input.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    toast(
      "Receipt must be 5MB or smaller.",
      "error"
    );

    input.value = "";
    return;
  }

  const statusEl =
    document.querySelector(
      `[data-status-for="${CSS.escape(payoutId)}"]`
    );

  const uploadButton =
    document.querySelector(
      `.payout-upload[data-id="${CSS.escape(payoutId)}"]`
    );

  if (uploadButton) {
    uploadButton.disabled = true;
    uploadButton.textContent =
      "Uploading...";
  }

  if (statusEl) {
    statusEl.textContent =
      "Uploading receipt...";
  }

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() || "bin";

  const path =
    `${crypto.randomUUID()}/${payoutId}.${extension}`;

  const {
    error: uploadError
  } = await supabase
    .storage
    .from("payout-receipts")
    .upload(
      path,
      file,
      {
        upsert: false,
        contentType: file.type
      }
    );

  if (uploadError) {

    toast(
      uploadError.message,
      "error"
    );

    if (uploadButton) {
      uploadButton.disabled = false;
      uploadButton.textContent =
        "Upload receipt";
    }

    if (statusEl) {
      statusEl.textContent = "";
    }

    return;
  }

  const {
    error: attachError
  } = await supabase.rpc(
    "admin_attach_payout_receipt",
    {
      p_payout_id: payoutId,
      p_receipt_path: path,
      p_receipt_original_name:
        file.name
    }
  );

  if (attachError) {

    await supabase
      .storage
      .from("payout-receipts")
      .remove([path]);

    toast(
      attachError.message,
      "error"
    );

    return;
  }

  toast(
    "Payment receipt uploaded successfully.",
    "success"
  );

  await loadPayouts();
}

async function processPayout(
  id,
  status
) {
  if (status === "approved") {

    const confirmed =
      window.confirm(
        "Approve this payout? The payment receipt must already be uploaded."
      );

    if (!confirmed) return;
  }

  if (status === "rejected") {

    const confirmed =
      window.confirm(
        "Reject this payout request?"
      );

    if (!confirmed) return;
  }

  const { error } =
    await supabase.rpc(
      "admin_process_payout",
      {
        p_payout_id: id,
        p_status: status,
        p_notes: null
      }
    );

  if (error) {
    toast(error.message, "error");
    return;
  }

  toast(
    status === "approved"
      ? "Payout approved successfully."
      : "Payout rejected.",
    "success"
  );

  await loadPayouts();
}

export function initPayoutsPage() {
  $("#refresh-payouts")
    ?.addEventListener(
      "click",
      loadPayouts
    );

  loadPayouts();
}