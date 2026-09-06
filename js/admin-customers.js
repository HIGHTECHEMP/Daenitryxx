import { supabase } from "./supabase-client.js";
import {
  $,
  $$,
  escapeHtml,
  formatDate,
  toast
} from "./utils.js";

let customerRows = [];

export async function loadCustomers() {
  const body = $("#customers-body");

  if (!body) return;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id,full_name,phone,created_at"
    )
    .eq("role", "customer")
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

  customerRows = data || [];

  renderCustomers();
}

function renderCustomers() {
  const body = $("#customers-body");

  if (!body) return;

  const search = (
    $("#customer-search")?.value || ""
  )
    .toLowerCase()
    .trim();

  const filtered = customerRows.filter(
    (customer) => {

      const text =
        `${customer.full_name || ""} ${
          customer.phone || ""
        }`.toLowerCase();

      return !search ||
        text.includes(search);
    }
  );

  body.innerHTML =
    filtered
      .map(
        (customer) => `
          <tr>

            <td>
              ${escapeHtml(
                customer.full_name || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                customer.phone || "—"
              )}
            </td>

            <td>
              ${formatDate(
                customer.created_at
              )}
            </td>

            <td>
              ${escapeHtml(customer.id)}
            </td>

            <td>
              <button
                class="link-button edit-customer"
                data-id="${escapeHtml(customer.id)}"
                type="button"
              >
                Edit
              </button>
            </td>

          </tr>
        `
      )
      .join("") ||
    `
      <tr>
        <td colspan="5">
          <div class="empty">
            No customers found.
          </div>
        </td>
      </tr>
    `;

  $$(".edit-customer").forEach(
    (button) => {
      button.onclick = () =>
        editCustomer(
          button.dataset.id
        );
    }
  );
}

async function editCustomer(id) {
  const customer =
    customerRows.find(
      (row) => row.id === id
    );

  if (!customer) return;

  const box = $("#customer-modal");

  if (!box) return;

  box.innerHTML = `
    <div class="dash-panel modal-panel">

      <div class="panel-head">
        <h2>Edit customer</h2>

        <button
          class="link-button"
          id="close-customer"
          type="button"
        >
          Close
        </button>
      </div>

      <label>
        Full name

        <input
          id="customer-name"
          value="${escapeHtml(
            customer.full_name || ""
          )}"
        >
      </label>

      <label>
        Phone

        <input
          id="customer-phone"
          value="${escapeHtml(
            customer.phone || ""
          )}"
        >
      </label>

      <button
        class="btn btn-primary"
        id="save-customer"
        type="button"
      >
        Save
      </button>

    </div>
  `;

  box.hidden = false;

  $("#close-customer").onclick = () => {
    box.hidden = true;
  };

  $("#save-customer").onclick = async () => {

    const { error } =
      await supabase.rpc(
        "admin_update_customer",
        {
          p_customer_id: id,
          p_full_name:
            $("#customer-name").value.trim(),
          p_phone:
            $("#customer-phone").value.trim()
        }
      );

    if (error) {
      toast(error.message, "error");
      return;
    }

    box.hidden = true;

    toast(
      "Customer updated.",
      "success"
    );

    await loadCustomers();
  };
}

export function initCustomersPage() {
  $("#customer-search")
    ?.addEventListener(
      "input",
      renderCustomers
    );

  $("#refresh-customers")
    ?.addEventListener(
      "click",
      loadCustomers
    );

  loadCustomers();
}