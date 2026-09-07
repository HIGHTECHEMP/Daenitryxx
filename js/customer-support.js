import {

  supabase

} from "./supabase-client.js";


import {

  initCustomerDashboard

} from "./customer-shared.js";


import {

  $,

  escapeHtml,

  formatDate,

  formMessage,

  toast

} from "./utils.js";


let ctx = null;


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
| LOAD MESSAGES FOR A CONVERSATION
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
| RENDER CONVERSATION
|--------------------------------------------------------------------------
*/

function renderConversation(
  request,
  messages
) {


  if (!messages.length) {

    return `

      <div class="support-awaiting-reply">

        This conversation has no messages yet.

      </div>

    `;

  }


  return messages

    .map(

      message => {


        const isCustomer =

          message.sender_role ===
          "customer";


        const roleLabel =

          isCustomer

            ? "YOU"

            : "DAENITRYXX SUPPORT";


        const messageClass =

          isCustomer

            ? "customer-message"

            : "admin-message";


        return `


<div class="support-conversation-message ${messageClass}">


<span class="support-message-label">

${roleLabel}

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
| CREATE REPLY FORM
|--------------------------------------------------------------------------
*/

function renderReplyForm(
  request
) {

  return `


<form
  class="customer-support-reply-form"
  data-request-id="${escapeHtml(
    request.id
  )}"
>


<label>


Reply to this conversation


<textarea

  class="customer-support-reply-input"

  maxlength="5000"

  placeholder="Write your reply..."

  required

></textarea>


</label>



<div class="customer-support-reply-actions">


<button

  class="btn btn-primary customer-send-support-reply"

  type="submit"

>

Send reply

</button>


</div>


<div class="form-message"></div>


</form>


  `;

}


/*
|--------------------------------------------------------------------------
| LOAD SUPPORT REQUESTS
|--------------------------------------------------------------------------
*/

async function loadSupportRequests() {


  const list =
    $("#customer-support-list");


  if (!list || !ctx) {

    return;

  }


  list.innerHTML = `

    <div class="empty">

      Loading support conversations…

    </div>

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

        updated_at

      `)

      .eq(

        "user_id",

        ctx.session.user.id

      )

      .order(

        "updated_at",

        {

          ascending:
            false

        }

      );


  if (error) {


    list.innerHTML = `

      <div class="empty">

        Unable to load support conversations.

      </div>

    `;


    return;

  }


  if (!data?.length) {


    list.innerHTML = `

      <div class="empty">

        You have not contacted support yet.

      </div>

    `;


    return;

  }


  /*
   * Load all conversations.
   */

  const conversations =

    await Promise.all(

      data.map(

        async request => {


          try {

            const messages =

              await loadConversationMessages(
                request.id
              );


            return {

              ...request,

              messages

            };


          } catch {

            return {

              ...request,

              messages: []

            };

          }


        }

      )

    );


  list.innerHTML =

    conversations

      .map(

        request => `


<article
  class="customer-support-request"
>


<div
  class="customer-support-request-head"
>


<div>


<h3>

${escapeHtml(
  request.subject
)}

</h3>


<small>

Started

${formatDate(
  request.created_at
)}

</small>


</div>



<span

  class="support-status-badge status-${escapeHtml(
    request.status || "open"
  )}"

>

${escapeHtml(
  statusLabel(
    request.status
  )
)}

</span>


</div>



<div class="support-conversation">


${

  renderConversation(

    request,

    request.messages

  )

}


</div>



${

  renderReplyForm(
    request
  )

}


</article>


        `

      )

      .join("");


  bindConversationReplyForms();

}


/*
|--------------------------------------------------------------------------
| CUSTOMER REPLY
|--------------------------------------------------------------------------
*/

async function sendConversationReply(
  event
) {


  event.preventDefault();


  if (!ctx) {

    return;

  }


  const form =
    event.currentTarget;


  const requestId =

    String(

      form.dataset.requestId ||

      ""

    ).trim();


  const input =

    form.querySelector(

      ".customer-support-reply-input"

    );


  const button =

    form.querySelector(

      ".customer-send-support-reply"

    );


  const message =

    String(

      input?.value ||

      ""

    ).trim();


  if (!requestId) {


    formMessage(

      form,

      "Support conversation not found.",

      "error"

    );


    return;

  }


  if (!message) {


    formMessage(

      form,

      "Please write a reply.",

      "error"

    );


    return;

  }


  if (

    message.length >

    5000

  ) {


    formMessage(

      form,

      "Your reply is too long.",

      "error"

    );


    return;

  }


  if (button) {

    button.disabled =
      true;


    button.textContent =
      "Sending…";

  }


  formMessage(
    form,
    ""
  );


  try {


    const {

      error

    } =

      await supabase.rpc(

        "customer_reply_support",

        {

          p_request_id:
            requestId,

          p_message:
            message

        }

      );


    if (error) {

      throw error;

    }


    if (input) {

      input.value =
        "";

    }


    toast(

      "Reply sent successfully.",

      "success"

    );


    /*
     * Reload the entire conversation
     * so the new message appears.
     */

    await loadSupportRequests();


  } catch (error) {


    formMessage(

      form,

      error.message ||

      "Unable to send your reply.",

      "error"

    );


  } finally {


    if (button) {

      button.disabled =
        false;


      button.textContent =
        "Send reply";

    }

  }


}


/*
|--------------------------------------------------------------------------
| BIND REPLY FORMS
|--------------------------------------------------------------------------
*/

function bindConversationReplyForms() {


  document

    .querySelectorAll(

      ".customer-support-reply-form"

    )

    .forEach(

      form => {


        form.addEventListener(

          "submit",

          sendConversationReply

        );


      }

    );

}


/*
|--------------------------------------------------------------------------
| SEND NEW SUPPORT REQUEST
|--------------------------------------------------------------------------
*/

async function sendSupportRequest(
  event
) {


  event.preventDefault();


  if (!ctx) {

    return;

  }


  const form =
    event.currentTarget;


  const subject =

    String(

      $("#support-subject")
        ?.value ||

      ""

    ).trim();


  const message =

    String(

      $("#support-message")
        ?.value ||

      ""

    ).trim();


  if (!subject) {


    formMessage(

      form,

      "Please enter a subject.",

      "error"

    );


    return;

  }


  if (!message) {


    formMessage(

      form,

      "Please enter your message.",

      "error"

    );


    return;

  }


  const button =
    $("#send-support-message");


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
     * Create support request.
     */

    const {

      data: request,

      error

    } =

      await supabase

        .from(
          "support_requests"
        )

        .insert({

          user_id:
            ctx.session.user.id,


          name:

            ctx.profile.full_name ||

            ctx.session.user
              .user_metadata
              ?.full_name ||

            "Customer",


          email:
            ctx.session.user.email,


          subject,

          message

        })

        .select(

          "id"

        )

        .single();


    if (error) {

      throw error;

    }


    /*
     * Add the first customer message
     * to the conversation table.
     */

    const {

      error: messageError

    } =

      await supabase

        .from(
          "support_messages"
        )

        .insert({

          request_id:
            request.id,


          sender_id:
            ctx.session.user.id,


          sender_role:
            "customer",


          message

        });


    if (messageError) {

      throw messageError;

    }


    form.reset();


    formMessage(

      form,

      "Your support request has been sent successfully.",

      "success"

    );


    toast(

      "Support request sent.",

      "success"

    );


    await loadSupportRequests();


  } catch (error) {


    formMessage(

      form,

      error.message ||

      "Unable to send your support request.",

      "error"

    );


  } finally {


    button.disabled =
      false;


    button.textContent =
      "Send message";

  }


}


/*
|--------------------------------------------------------------------------
| INITIALIZE
|--------------------------------------------------------------------------
*/

async function init() {


  const dashboard =

    await initCustomerDashboard();


  if (!dashboard) {

    return;

  }


  ctx =
    dashboard.ctx;


  $("#customer-support-form")

    ?.addEventListener(

      "submit",

      sendSupportRequest

    );


  $("#refresh-support")

    ?.addEventListener(

      "click",

      loadSupportRequests

    );


  await loadSupportRequests();

}


init();