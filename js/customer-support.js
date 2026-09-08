import { supabase } from "./supabase-client.js";
import { initCustomerDashboard } from "./customer-shared.js";
import { $, escapeHtml, formatDate, formMessage, toast } from "./utils.js";

let ctx = null;
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

async function loadRequests() {
  const { data, error } = await supabase
    .from("support_requests")
    .select("id,subject,status,created_at,updated_at")
    .eq("user_id", ctx.session.user.id)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  supportRequests = data || [];
  renderChatList();

  if (!selectedRequest && supportRequests.length) {
    await openConversation(supportRequests[0].id);
  } else if (selectedRequest) {
    const fresh = supportRequests.find(item => item.id === selectedRequest.id);

    if (fresh) {
      selectedRequest = fresh;
      updateConversationHeader();
    } else {
      clearConversation();
    }
  }
}

async function loadMessagePreviews() {
  if (!supportRequests.length) return {};

  const ids = supportRequests.map(item => item.id);

  const { data, error } = await supabase
    .from("support_messages")
    .select("request_id,message,created_at,sender_role")
    .in("request_id", ids)
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

    const matchesSearch =
      !query ||
      String(request.subject || "").toLowerCase().includes(query);

    return matchesFilter && matchesSearch;
  });
}

async function renderChatList() {
  const list = $("#customer-support-list");
  if (!list) return;

  if (!supportRequests.length) {
    list.innerHTML = `<div class="empty">No support conversations yet.</div>`;
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
    const isSelected = selectedRequest?.id === request.id;
    const previewText = preview?.message || "No messages yet.";

    return `
      <button
        class="support-chat-item ${isSelected ? "active" : ""}"
        data-id="${escapeHtml(request.id)}"
        type="button"
      >
        <span class="support-chat-item-top">
          <strong>${escapeHtml(request.subject || "Support request")}</strong>
          <time>${formatDate(request.updated_at || request.created_at)}</time>
        </span>

        <span class="support-chat-preview">
          ${escapeHtml(previewText)}
        </span>

        <span class="support-chat-item-bottom">
          <span class="support-status-badge status-${statusClass(request.status)}">
            ${escapeHtml(statusLabel(request.status))}
          </span>
          <span>${preview?.sender_role === "admin" ? "Support replied" : ""}</span>
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
    const isCustomer = message.sender_role === "customer";

    return `
      <article class="support-message-row ${isCustomer ? "is-customer" : "is-admin"}">
        <div class="support-message-bubble">
          <span class="support-message-label">
            ${isCustomer ? "YOU" : "DAENITRYXX SUPPORT"}
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

  $("#conversation-subject").textContent =
    selectedRequest.subject || "Support conversation";

  const badge = $("#conversation-status");
  badge.textContent = statusLabel(selectedRequest.status);
  badge.className = `support-status-badge status-${statusClass(selectedRequest.status)}`;

  $("#conversation-meta").textContent =
    `Started ${formatDate(selectedRequest.created_at)}`;

  const closed = isClosed(selectedRequest);

  $("#support-closed-notice").hidden = !closed;
  $("#customer-support-reply-form").hidden = closed;
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

async function refreshSupport() {
  const list = $("#customer-support-list");

  if (list) list.innerHTML = `<div class="empty">Loading support conversations…</div>`;

  try {
    await loadRequests();

    if (selectedRequest) {
      await openConversation(selectedRequest.id);
    }
  } catch (error) {
    if (list) {
      list.innerHTML = `<div class="empty">Unable to load support conversations.</div>`;
    }

    toast(error.message || "Unable to refresh support.", "error");
  }
}

function showNewRequest() {
  const panel = $("#new-support-request-panel");
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  $("#support-subject")?.focus();
}

function hideNewRequest() {
  $("#new-support-request-panel").hidden = true;
}

async function sendNewRequest(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const subject = String($("#support-subject")?.value || "").trim();
  const message = String($("#support-message")?.value || "").trim();
  const button = $("#send-support-message");

  if (!subject || !message) {
    formMessage(form, "Please enter both a subject and message.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "Starting…";
  formMessage(form, "");

  try {
    const { data: requestId, error } = await supabase.rpc(
      "customer_create_support_conversation",
      {
        p_subject: subject,
        p_message: message
      }
    );

    if (error) throw error;

    form.reset();
    hideNewRequest();

    await loadRequests();

    if (requestId) {
      await openConversation(requestId);
    }

    toast("Support conversation started.", "success");
  } catch (error) {
    formMessage(
      form,
      error.message || "Unable to start the support conversation.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Start conversation";
  }
}

async function sendReply(event) {
  event.preventDefault();

  if (!selectedRequest) return;

  if (isClosed(selectedRequest)) {
    toast("This conversation is closed and cannot receive replies.", "error");
    return;
  }

  const form = event.currentTarget;
  const input = $("#customer-support-reply");
  const button = $("#customer-send-support-reply");
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
      "customer_reply_support",
      {
        p_request_id: selectedRequest.id,
        p_message: message
      }
    );

    if (error) throw error;

    input.value = "";
    selectedMessages = await loadConversationMessages(selectedRequest.id);
    renderMessages();

    await loadRequests();

    toast("Reply sent.", "success");
  } catch (error) {
    formMessage(
      form,
      error.message || "Unable to send your reply.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Send reply";
  }
}

function bindKeyboardSend() {
  const textarea = $("#customer-support-reply");

  textarea?.addEventListener("keydown", event => {
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      $("#customer-support-reply-form")?.requestSubmit();
    }
  });
}

async function init() {
  const dashboard = await initCustomerDashboard();
  if (!dashboard) return;

  ctx = dashboard.ctx;

  $("#new-support-request")
    ?.addEventListener("click", showNewRequest);

  $("#new-support-request-icon")
    ?.addEventListener("click", showNewRequest);

  $("#empty-state-new-request")
    ?.addEventListener("click", showNewRequest);

  $("#cancel-new-support-request")
    ?.addEventListener("click", hideNewRequest);

  $("#customer-support-form")
    ?.addEventListener("submit", sendNewRequest);

  $("#customer-support-reply-form")
    ?.addEventListener("submit", sendReply);

  $("#refresh-support")
    ?.addEventListener("click", refreshSupport);

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
  await refreshSupport();
}

init();