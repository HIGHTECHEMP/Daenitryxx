

import { supabase } from "./supabase-client.js";
import {
  $,
  escapeHtml,
  formatDate,
  formMessage,
  toast
} from "./utils.js";

let supportRequests = [];
let selectedRequest = null;
let selectedMessages = [];
let activeFilter = "open";
let searchTerm = "";

function statusLabel(status) {
  return {
    open: "Open",
    in_progress: "In progress",
    resolved: "Resolved",
    closed: "Closed"
  }[status] || "Open";
}

function statusClass(status) {
  return String(status || "open").replace(/[^a-z_]/g, "");
}

function isClosed(request) {
  return request?.status === "closed";
}

async function loadConversationMessages(requestId) {
  const { data, error } = await supabase
    .from("support_messages")
    .select("id,sender_id,sender_role,message,created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadMessagePreviews() {
  if (!supportRequests.length) return {};

  const { data, error } = await supabase
    .from("support_messages")
    .select("request_id,message,created_at,sender_role")
    .in("request_id", supportRequests.map(item => item.id))
    .order("created_at", { ascending: false });

  if (error) throw error;

  const previews = {};

  for (const message of data || []) {
    if (!previews[message.request_id]) previews[message.request_id] = message;
  }

  return previews;
}

function filteredRequests() {
  const query = searchTerm.trim().toLowerCase();

  return supportRequests.filter(request => {
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "closed"
        ? request.status === "closed"
        : request.status !== "closed");

    const haystack = [
      request.subject,
      request.name,
      request.email
    ].join(" ").toLowerCase();

    return matchesFilter && (!query || haystack.includes(query));
  });
}

async function renderChatList() {
  const list = $("#admin-support-list");
  if (!list) return;

  $("#support-chat-count").textContent = String(
    supportRequests.filter(request => request.status !== "closed").length
  );

  if (!supportRequests.length) {
    list.innerHTML = `<div class="empty">No support conversations.</div>`;
    return;
  }

  let previews = {};

  try {
    previews = await loadMessagePreviews();
  } catch {
    previews = {};
  }

  const items = filteredRequests();

  if (!items.length) {
    list.innerHTML = `<div class="empty">No conversations match this filter.</div>`;
    return;
  }

  list.innerHTML = items.map(request => {
    const preview = previews[request.id];
    const selected = selectedRequest?.id === request.id;

    return `
      <button
        class="support-chat-item ${selected ? "active" : ""}"
        data-id="${escapeHtml(request.id)}"
        type="button"
      >
        <span class="support-chat-item-top">
          <strong>${escapeHtml(request.name || "Customer")}</strong>
          <time>${formatDate(request.updated_at || request.created_at)}</time>
        </span>

        <span class="support-chat-subject">
          ${escapeHtml(request.subject || "Support request")}
        </span>

        <span class="support-chat-preview">
          ${escapeHtml(preview?.message || request.message || "No messages yet.")}
        </span>

        <span class="support-chat-item-bottom">
          <span class="support-status-badge status-${statusClass(request.status)}">
            ${escapeHtml(statusLabel(request.status))}
          </span>
          <span>${preview?.sender_role === "customer" ? "Customer" : "Support"}</span>
        </span>
      </button>
    `;
  }).join("");

  list.querySelectorAll(".support-chat-item").forEach(button => {
    button.addEventListener("click", () => openConversation(button.dataset.id));
  });
}

function renderMessages() {
  const history = $("#support-conversation-history");
  if (!history) return;

  if (!selectedMessages.length) {
    history.innerHTML = `<div class="empty">No messages in this conversation.</div>`;
    return;
  }

  history.innerHTML = selectedMessages.map(message => {
    const isAdmin = message.sender_role === "admin";

    return `
      <article class="support-message-row ${isAdmin ? "is-admin" : "is-customer"}">
        <div class="support-message-bubble">
          <span class="support-message-label">
            ${isAdmin ? "DAENITRYXX SUPPORT" : "CUSTOMER"}
          </span>

          <p>${escapeHtml(message.message)}</p>
          <time>${formatDate(message.created_at)}</time>
        </div>
      </article>
    `;
  }).join("");

  history.scrollTop = history.scrollHeight;
}

function updateConversationHeader() {
  if (!selectedRequest) return;

  $("#support-detail-subject").textContent =
    selectedRequest.subject || "Support conversation";

  $("#support-detail-customer").textContent =
    `${selectedRequest.name || "Customer"} • ${selectedRequest.email || ""}`;

  $("#support-detail-created").textContent =
    `Started ${formatDate(selectedRequest.created_at)}`;

  $("#support-status-select").value = selectedRequest.status || "open";

  const badge = $("#support-detail-status");
  badge.textContent = statusLabel(selectedRequest.status);
  badge.className =
    `support-status-badge status-${statusClass(selectedRequest.status)}`;

  const closed = isClosed(selectedRequest);

  $("#support-closed-notice").hidden = !closed;
  $("#support-reply-form").hidden = closed;
}

function showConversationView() {
  $("#support-empty-state").hidden = true;
  $("#support-conversation-view").hidden = false;

  if (window.matchMedia("(max-width: 760px)").matches) {
    $("#support-conversation-panel")
      ?.classList.add("support-mobile-conversation-open");
  }
}

function clearConversation() {
  selectedRequest = null;
  selectedMessages = [];
  $("#support-empty-state").hidden = false;
  $("#support-conversation-view").hidden = true;
  $("#support-conversation-panel")
    ?.classList.remove("support-mobile-conversation-open");
}

async function openConversation(requestId) {
  const request = supportRequests.find(item => item.id === requestId);
  if (!request) return;

  selectedRequest = request;
  showConversationView();
  updateConversationHeader();

  const history = $("#support-conversation-history");
  history.innerHTML = `<div class="empty">Loading conversation…</div>`;

  try {
    selectedMessages = await loadConversationMessages(request.id);
    renderMessages();
  } catch {
    history.innerHTML = `<div class="empty">Unable to load this conversation.</div>`;
  }

  await renderChatList();
}

async function loadSupport() {
  const list = $("#admin-support-list");

  if (list) {
    list.innerHTML = `<div class="empty">Loading support conversations…</div>`;
  }

  const { data, error } = await supabase
    .from("support_requests")
    .select("id,subject,status,created_at,updated_at,name,email,message")
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) {
    if (list) {
      list.innerHTML = `<div class="empty">Unable to load support conversations.</div>`;
    }

    throw error;
  }

  supportRequests = data || [];

  if (selectedRequest) {
    selectedRequest =
      supportRequests.find(item => item.id === selectedRequest.id) || null;
  }

  await renderChatList();

  if (!selectedRequest && supportRequests.length) {
    await openConversation(supportRequests[0].id);
  } else if (selectedRequest) {
    updateConversationHeader();
  }
}

async function updateSupportStatus(requestId, status) {
  const { error } = await supabase.rpc(
    "admin_update_support",
    {
      p_request_id: requestId,
      p_status: status
    }
  );

  if (error) throw error;
}

async function saveSelectedStatus() {
  if (!selectedRequest) return;

  const button = $("#save-support-status");
  const status = $("#support-status-select").value;

  button.disabled = true;
  button.textContent = "Saving…";

  try {
    await updateSupportStatus(selectedRequest.id, status);

    selectedRequest.status = status;

    const item = supportRequests.find(
      request => request.id === selectedRequest.id
    );

    if (item) {
      item.status = status;
      item.updated_at = new Date().toISOString();
    }

    updateConversationHeader();
    await renderChatList();

    toast(
      status === "closed"
        ? "Conversation closed. The customer can no longer reply."
        : "Conversation status updated.",
      "success"
    );
  } catch (error) {
    toast(
      error.message || "Unable to update conversation status.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Save status";
  }
}

async function sendReply(event) {
  event.preventDefault();

  if (!selectedRequest) return;

  if (isClosed(selectedRequest)) {
    toast("Reopen the conversation before sending a reply.", "error");
    return;
  }

  const form = event.currentTarget;
  const input = $("#support-reply");
  const button = $("#send-support-reply");
  const message = String(input?.value || "").trim();

  if (!message) {
    formMessage(form, "Please write a reply.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "Sending…";
  formMessage(form, "");

  try {
    const { error } = await supabase.rpc(
      "admin_send_support_reply",
      {
        p_request_id: selectedRequest.id,
        p_message: message
      }
    );

    if (error) throw error;

    input.value = "";
    selectedMessages =
      await loadConversationMessages(selectedRequest.id);

    renderMessages();

    await loadSupport();

    toast("Support reply sent.", "success");
  } catch (error) {
    formMessage(
      form,
      error.message || "Unable to send the reply.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Send reply";
  }
}

function bindKeyboardSend() {
  $("#support-reply")?.addEventListener("keydown", event => {
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      $("#support-reply-form")?.requestSubmit();
    }
  });
}

export function initSupportPage() {
  $("#refresh-support")
    ?.addEventListener("click", async () => {
      try {
        await loadSupport();

        if (selectedRequest) {
          await openConversation(selectedRequest.id);
        }
      } catch (error) {
        toast(error.message || "Unable to refresh support.", "error");
      }
    });

  $("#save-support-status")
    ?.addEventListener("click", saveSelectedStatus);

  $("#support-reply-form")
    ?.addEventListener("submit", sendReply);

  $("#support-mobile-back")
    ?.addEventListener("click", () => {
      $("#support-conversation-panel")
        ?.classList.remove("support-mobile-conversation-open");
    });

  $("#support-search")
    ?.addEventListener("input", event => {
      searchTerm = event.target.value || "";
      renderChatList();
    });

  document.querySelectorAll("[data-support-filter]").forEach(button => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.supportFilter || "open";

      document.querySelectorAll("[data-support-filter]").forEach(item => {
        item.classList.toggle("active", item === button);
      });

      renderChatList();
    });
  });

  bindKeyboardSend();

  loadSupport().catch(error => {
    toast(error.message || "Unable to load support.", "error");
  });
}