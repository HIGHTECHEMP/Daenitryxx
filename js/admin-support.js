import {

  supabase

} from "./supabase-client.js";


import {

  $,

  $$,

  escapeHtml,

  formatDate,

  formMessage,

  toast

} from "./utils.js";


let supportRequests = [];

let selectedRequest = null;

let selectedMessages = [];


/*
|--------------------------------------------------------------------------
| STATUS LABEL
|--------------------------------------------------------------------------
*/

function statusLabel(
  status
) {

  const labels = {

    open:
      "Open",

    in_progress:
      "In progress",

    resolved:
      "Resolved",

    closed:
      "Closed"

  };


  return (

    labels[status] ||

    "Open"

  );

}


/*
|--------------------------------------------------------------------------
| STATUS CLASS
|--------------------------------------------------------------------------
*/

function getStatusClass(
  status
) {

  return String(

    status || "open"

  )

    .replace(

      /[^a-z_]/g,

      ""

    );

}


/*
|--------------------------------------------------------------------------
| LOAD CONVERSATION MESSAGES
|--------------------------------------------------------------------------
*/

async function loadConversationMessages(
  requestId
) {


  const {

    data,

    error

  } =

    await supabase

      .from(
        "support_messages"
      )

      .select(`

        id,

        sender_id,

        sender_role,

        message,

        created_at

      `)

      .eq(

        "request_id",

        requestId

      )

      .order(

        "created_at",

        {

          ascending:
            true

        }

      );


  if (error) {

    throw error;

  }


  return data || [];

}


/*
|--------------------------------------------------------------------------
| RENDER ADMIN CONVERSATION
|--------------------------------------------------------------------------
*/

function renderConversation(
  messages
) {


  const container =
    $("#support-conversation-history");


  if (!container) {

    return;

  }


  if (!messages.length) {


    container.innerHTML = `

      <div class="empty">

        No conversation messages found.

      </div>

    `;


    return;

  }


  container.innerHTML =

    messages

      .map(

        message => {


          const isAdmin =

            message.sender_role ===
            "admin";


          const messageClass =

            isAdmin

              ? "admin-message"

              : "customer-message";


          const label =

            isAdmin

              ? "DAENITRYXX SUPPORT"

              : "CUSTOMER";


          return `


<div
  class="support-conversation-message ${messageClass}"
>


<span class="support-message-label">

${label}

</span>


<p>

${escapeHtml(
  message.message
)}

</p>


<small>

${formatDate(
  message.created_at
)}

</small>


</div>


          `;

        }

      )

      .join("");


}


/*
|--------------------------------------------------------------------------
| SHOW SUPPORT DETAIL
|--------------------------------------------------------------------------
*/

async function showSupportDetail(
  request
) {


  selectedRequest =
    request;


  selectedMessages =
    [];


  const panel =
    $("#support-detail-panel");


  if (!panel) {

    return;

  }


  $("#support-detail-subject")
    .textContent =

    request.subject ||

    "Support request";


  $("#support-detail-customer")
    .textContent =

    `${request.name || "Customer"} • ${request.email || ""}`;


  $("#support-detail-created")
    .textContent =

    `Started ${formatDate(
      request.created_at
    )}`;


  $("#support-status-select")
    .value =

    request.status ||

    "open";


  const history =
    $("#support-conversation-history");


  if (history) {


    history.innerHTML = `

      <div class="empty">

        Loading conversation…

      </div>

    `;

  }


  $("#support-reply")
    .value =
    "";


  const message =
    panel.querySelector(
      ".form-message"
    );


  if (message) {


    message.textContent =
      "";


    message.className =
      "form-message";

  }


  panel.hidden =
    false;


  try {


    selectedMessages =

      await loadConversationMessages(
        request.id
      );


    renderConversation(
      selectedMessages
    );


  } catch (error) {


    if (history) {


      history.innerHTML = `

        <div class="empty">

          Unable to load this conversation.

        </div>

      `;

    }


  }


  panel.scrollIntoView({

    behavior:
      "smooth",

    block:
      "start"

  });


}


/*
|--------------------------------------------------------------------------
| UPDATE SUPPORT STATUS
|--------------------------------------------------------------------------
*/

async function updateSupportStatus(
  requestId,
  status
) {


  const {

    error

  } =

    await supabase.rpc(

      "admin_update_support",

      {

        p_request_id:
          requestId,

        p_status:
          status

      }

    );


  if (error) {

    throw error;

  }

}


/*
|--------------------------------------------------------------------------
| LOAD SUPPORT REQUESTS
|--------------------------------------------------------------------------
*/

export async function loadSupport() {


  const body =
    $("#support-body");


  if (!body) {

    return;

  }


  body.innerHTML = `

    <tr>

      <td colspan="5">

        Loading support requests…

      </td>

    </tr>

  `;


  const {

    data,

    error

  } =

    await supabase

      .from(
        "support_requests"
      )

      .select(`

        id,

        subject,

        status,

        created_at,

        updated_at,

        name,

        email,

        message,

        admin_reply,

        replied_at,

        replied_by

      `)

      .order(

        'updated_at',

        {

          ascending:
            false

        }

      )

      .limit(250);


  if (error) {


    body.innerHTML = `

      <tr>

        <td colspan="5">

          Unable to load support requests.

        </td>

      </tr>

    `;


    return;

  }


  supportRequests =
    data || [];


  body.innerHTML =

    supportRequests.length

      ? supportRequests

          .map(

            request => `


<tr>


<td>


<strong>

${escapeHtml(
  request.subject || "—"
)}

</strong>


${

  request.admin_reply

    ? `

      <small class="support-replied-badge">

        Active conversation

      </small>

    `

    : ""

}


</td>



<td>


${escapeHtml(
  request.name || "—"
)}


<small class="table-subtext">

${escapeHtml(
  request.email || ""
)}

</small>


</td>



<td>


<select

  class="support-status"

  data-id="${escapeHtml(
    request.id
  )}"

>


<option

  value="open"

  ${

    request.status === "open"

      ? "selected"

      : ""

  }

>

Open

</option>


<option

  value="in_progress"

  ${

    request.status === "in_progress"

      ? "selected"

      : ""

  }

>

In progress

</option>


<option

  value="resolved"

  ${

    request.status === "resolved"

      ? "selected"

      : ""

  }

>

Resolved

</option>


<option

  value="closed"

  ${

    request.status === "closed"

      ? "selected"

      : ""

  }

>

Closed

</option>


</select>


</td>



<td>

${formatDate(
  request.created_at
)}

</td>



<td>


<button

  class="link-button support-view"

  data-id="${escapeHtml(
    request.id
  )}"

  type="button"

>

View conversation

</button>


</td>


</tr>


            `

          )

          .join("")

      : `


<tr>

<td colspan="5">

<div class="empty">

No support requests.

</div>

</td>

</tr>


      `;


  bindSupportTableEvents();

}


/*
|--------------------------------------------------------------------------
| TABLE EVENTS
|--------------------------------------------------------------------------
*/

function bindSupportTableEvents() {


  $$(".support-status")

    .forEach(

      select => {


        select.onchange =

          async () => {


            select.disabled =
              true;


            try {


              await updateSupportStatus(

                select.dataset.id,

                select.value

              );


              const request =

                supportRequests.find(

                  item =>

                    item.id ===
                    select.dataset.id

                );


              if (request) {

                request.status =
                  select.value;

              }


              if (

                selectedRequest?.id ===
                select.dataset.id

              ) {


                $("#support-status-select")
                  .value =
                  select.value;

              }


              toast(

                "Support request status updated.",

                "success"

              );


            } catch (error) {


              toast(

                error.message ||

                "Unable to update the request.",

                "error"

              );


              await loadSupport();


            } finally {


              select.disabled =
                false;

            }


          };


      }

    );


  $$(".support-view")

    .forEach(

      button => {


        button.onclick =

          async () => {


            const request =

              supportRequests.find(

                item =>

                  item.id ===
                  button.dataset.id

              );


            if (!request) {

              return;

            }


            await showSupportDetail(
              request
            );


          };


      }

    );

}


/*
|--------------------------------------------------------------------------
| SEND ADMIN REPLY
|--------------------------------------------------------------------------
*/

async function sendReply(
  event
) {


  event.preventDefault();


  if (!selectedRequest) {


    toast(

      "Select a support request first.",

      "error"

    );


    return;

  }


  const form =
    event.currentTarget;


  const reply =

    String(

      $("#support-reply")
        ?.value ||

      ""

    ).trim();


  const status =

    $("#support-status-select")
      ?.value;


  if (!reply) {


    formMessage(

      form,

      "Please write a reply.",

      "error"

    );


    return;

  }


  const button =
    $("#send-support-reply");


  button.disabled =
    true;


  button.textContent =
    "Sending…";


  formMessage(
    form,
    ""
  );


  try {


    /*
     * Add a new admin message.
     */

    const {

      error: replyError

    } =

      await supabase.rpc(

        "admin_send_support_reply",

        {

          p_request_id:
            selectedRequest.id,

          p_message:
            reply

        }

      );


    if (replyError) {

      throw replyError;

    }


    /*
     * Apply selected status.
     */

    if (status) {


      await updateSupportStatus(

        selectedRequest.id,

        status

      );


    }


    formMessage(

      form,

      "Reply sent successfully.",

      "success"

    );


    toast(

      "Support reply sent.",

      "success"

    );


    $("#support-reply")
      .value =
      "";


    /*
     * Reload the conversation.
     */

    selectedMessages =

      await loadConversationMessages(

        selectedRequest.id

      );


    renderConversation(
      selectedMessages
    );


    /*
     * Refresh table.
     */

    await loadSupport();


  } catch (error) {


    formMessage(

      form,

      error.message ||

      "Unable to send the reply.",

      "error"

    );


  } finally {


    button.disabled =
      false;


    button.textContent =
      "Send reply";

  }

}


/*
|--------------------------------------------------------------------------
| INITIALIZE
|--------------------------------------------------------------------------
*/

export function initSupportPage() {


  $("#refresh-support")

    ?.addEventListener(

      "click",

      loadSupport

    );


  $("#close-support-detail")

    ?.addEventListener(

      "click",

      () => {


        $("#support-detail-panel")
          .hidden =
          true;


        selectedRequest =
          null;


        selectedMessages =
          [];


      }

    );


  $("#support-reply-form")

    ?.addEventListener(

      "submit",

      sendReply

    );


  loadSupport();

}