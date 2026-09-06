import { supabase } from "./supabase-client.js";
import { requireRole } from "./auth.js";
import {
  $,
  escapeHtml,
  formMessage,
  money
} from "./utils.js";

let ctx;
let checkoutSession = null;
let debounceTimer = null;
let lastQuoteKey = "";

function bindSidebar() {
  const button = $("#side-toggle");
  const sidebar =
    document.querySelector(".sidebar");

  if (!button || !sidebar) return;

  button.addEventListener(
    "click",
    () => {
      const open =
        sidebar.classList.toggle(
          "open"
        );

      button.setAttribute(
        "aria-expanded",
        String(open)
      );
    }
  );
}

function normalized(value) {
  return String(value || "").trim();
}

function collectDetails(form) {
  const formData =
    new FormData(form);

  return {
    pickup_name:
      normalized(
        formData.get(
          "pickup_name"
        )
      ),

    pickup_phone:
      normalized(
        formData.get(
          "pickup_phone"
        )
      ),

    pickup_address:
      normalized(
        formData.get(
          "pickup_address"
        )
      ),

    pickup_city:
      normalized(
        formData.get(
          "pickup_city"
        )
      ),

    delivery_name:
      normalized(
        formData.get(
          "delivery_name"
        )
      ),

    delivery_phone:
      normalized(
        formData.get(
          "delivery_phone"
        )
      ),

    delivery_address:
      normalized(
        formData.get(
          "delivery_address"
        )
      ),

    delivery_city:
      normalized(
        formData.get(
          "delivery_city"
        )
      ),

    package_description:
      normalized(
        formData.get(
          "package_description"
        )
      ),

    package_weight_kg:
      Number(
        formData.get(
          "package_weight_kg"
        )
      )
  };
}

function validateDetails(
  details
) {
  const required = [
    [
      "Pickup name",
      details.pickup_name
    ],

    [
      "Pickup phone",
      details.pickup_phone
    ],

    [
      "Pickup address",
      details.pickup_address
    ],

    [
      "Pickup city",
      details.pickup_city
    ],

    [
      "Delivery name",
      details.delivery_name
    ],

    [
      "Delivery phone",
      details.delivery_phone
    ],

    [
      "Delivery address",
      details.delivery_address
    ],

    [
      "Delivery city",
      details.delivery_city
    ],

    [
      "Package description",
      details.package_description
    ]
  ];

  const missing =
    required.find(
      ([, value]) => !value
    );

  if (missing) {
    return `${missing[0]} is required.`;
  }

  if (
    !Number.isFinite(
      details.package_weight_kg
    ) ||
    details.package_weight_kg <= 0
  ) {
    return "Package weight must be greater than 0 kg.";
  }

  if (
    details.package_weight_kg >
    100000
  ) {
    return "Package weight is too large.";
  }

  return "";
}

function setQuoteState(
  amountText,
  message,
  type = ""
) {
  const amount =
    $("#quote-amount");

  const messageElement =
    $("#quote-message");

  const preview =
    $("#quote-preview");

  if (amount) {
    amount.textContent =
      amountText;
  }

  if (messageElement) {
    messageElement.textContent =
      message;
  }

  preview?.classList.toggle(
    "quote-error",
    type === "error"
  );
}

async function calculateQuote(details) {

  const key =
    `${details.pickup_address.toLowerCase()}|` +
    `${details.pickup_city.toLowerCase()}|` +
    `${details.delivery_address.toLowerCase()}|` +
    `${details.delivery_city.toLowerCase()}|` +
    `${details.package_weight_kg}`;

  if (key === lastQuoteKey) return;

  lastQuoteKey = key;


  setQuoteState(
    "Calculating…",
    "Finding the driving route and calculating your delivery fee…"
  );


  try {

    const response =
      await supabase.functions.invoke(
        "calculate-delivery-quote",
        {
          body: {

            pickup_address:
              details.pickup_address,

            pickup_city:
              details.pickup_city,

            delivery_address:
              details.delivery_address,

            delivery_city:
              details.delivery_city,

            package_weight_kg:
              details.package_weight_kg,

            create_session:
              false

          }
        }
      );


    console.log(
      "DELIVERY QUOTE RESPONSE:",
      response
    );


    const {
      data,
      error
    } = response;


    if (error) {

      console.error(
        "DELIVERY QUOTE ERROR:",
        error
      );


      let errorMessage =
        error.message ||
        "Unable to calculate the delivery fee.";


      /*
       * Try to read the actual
       * Edge Function response.
       */

      if (error.context) {

        try {

          const errorBody =
            await error.context.json();


          console.error(
            "EDGE FUNCTION ERROR BODY:",
            errorBody
          );


          if (errorBody?.error) {

            errorMessage =
              errorBody.error;

          }

        } catch (contextError) {

          console.error(
            "Could not read Edge Function error:",
            contextError
          );

        }

      }


      setQuoteState(
        "Rate unavailable",
        errorMessage,
        "error"
      );


      return;

    }


    if (data?.error) {

      console.error(
        "EDGE FUNCTION DATA ERROR:",
        data.error
      );


      setQuoteState(
        "Rate unavailable",
        data.error,
        "error"
      );


      return;

    }


    if (
      !data ||
      !Number.isFinite(
        Number(data.delivery_fee)
      )
    ) {

      console.error(
        "INVALID QUOTE RESPONSE:",
        data
      );


      setQuoteState(
        "Rate unavailable",
        "The delivery quote response was invalid.",
        "error"
      );


      return;

    }


    setQuoteState(

      money(
        data.delivery_fee,
        data.currency || "NGN"
      ),

      `${Number(
        data.distance_km
      ).toFixed(2)} km driving distance • ` +

      `${Number(
        data.billable_distance_km
      ).toFixed(0)} billable km`

    );


  } catch (error) {

    console.error(
      "UNEXPECTED QUOTE ERROR:",
      error
    );


    setQuoteState(

      "Rate unavailable",

      error?.message ||
      "Unable to calculate the delivery fee.",

      "error"

    );

  }

}

function bindLiveQuote(form) {
  const watched = [
    form.elements.pickup_address,
    form.elements.pickup_city,
    form.elements.delivery_address,
    form.elements.delivery_city,
    form.elements.package_weight_kg
  ];

  const schedule = () => {
    clearTimeout(
      debounceTimer
    );

    debounceTimer =
      setTimeout(
        () => {
          const details =
            collectDetails(form);

          if (
            !details.pickup_address ||
            !details.pickup_city ||
            !details.delivery_address ||
            !details.delivery_city ||
            !(details.package_weight_kg > 0)
          ) {
            lastQuoteKey = "";

            setQuoteState(
              "Enter route and weight",
              "Your fee will be calculated from the live driving route and active DAENITRYXX pricing rules."
            );

            return;
          }

          calculateQuote(
            details
          );
        },
        350
      );
  };

  watched.forEach(input => {
    input?.addEventListener(
      "input",
      schedule
    );

    input?.addEventListener(
      "change",
      schedule
    );
  });
}

function showPaymentStep(
  details,
  result
) {
  checkoutSession = {
    id: result.session_id,

    delivery_fee:
      Number(
        result.delivery_fee
      ),

    currency:
      result.currency ||
      "NGN",

    expires_at:
      result.expires_at,

    distance_km:
      Number(result.distance_km || 0),

    billable_distance_km:
      Number(result.billable_distance_km || 0),

    distance_charge:
      Number(result.distance_charge || 0),

    weight_charge:
      Number(result.weight_charge || 0),

    base_fee:
      Number(result.base_fee || 0),

    details
  };

  $("#details-step").hidden =
    true;

  $("#payment-step").hidden =
    false;

  $("#step-indicator-1")
    .classList.remove(
      "active"
    );

  $("#step-indicator-2")
    .classList.add(
      "active"
    );

  $("#payment-amount")
    .textContent = money(
      checkoutSession.delivery_fee,
      checkoutSession.currency
    );

  $("#checkout-summary")
    .innerHTML = `
      <div class="checkout-summary-grid">

        <div>
          <small>Pickup</small>

          <strong>
            ${escapeHtml(
              details.pickup_name
            )}
          </strong>

          <span>
            ${escapeHtml(
              details.pickup_address
            )},
            ${escapeHtml(
              details.pickup_city
            )}
          </span>
        </div>

        <div>
          <small>Delivery</small>

          <strong>
            ${escapeHtml(
              details.delivery_name
            )}
          </strong>

          <span>
            ${escapeHtml(
              details.delivery_address
            )},
            ${escapeHtml(
              details.delivery_city
            )}
          </span>
        </div>

        <div>
          <small>Package</small>

          <strong>
            ${escapeHtml(
              details.package_description
            )}
          </strong>

          <span>
            ${escapeHtml(
              String(
                details.package_weight_kg
              )
            )}
            kg
          </span>
        </div>

        <div>
          <small>Route</small>

          <strong>
            ${escapeHtml(
              details.pickup_city
            )}
            →
            ${escapeHtml(
              details.delivery_city
            )}
          </strong>

          <span>
            ${Number(result.distance_km || 0).toFixed(2)} km driving route
            • ${Number(result.billable_distance_km || 0).toFixed(0)} billable km
          </span>
        </div>

      </div>
    `;

  $("#payment-message")
    .textContent = "";

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

async function createCheckoutSession(form) {
  const details = collectDetails(form);
  const validation = validateDetails(details);

  if (validation) {
    formMessage(form, validation, "error");
    return;
  }

  const button = $("#continue-to-payment");

  button.disabled = true;
  button.textContent = "Calculating fee…";

  formMessage(
    form,
    "Calculating the live driving route and securing your quote…"
  );

  try {
    const { data, error } = await supabase.functions.invoke(
      "calculate-delivery-quote",
      {
        body: {
          ...details,
          create_session: true
        }
      }
    );

  if (error) {

  console.error(
    "CHECKOUT FUNCTION ERROR:",
    error
  );


  let errorMessage =
    error.message ||
    "Unable to calculate the delivery fee.";


  if (error.context) {

    try {

      const errorBody =
        await error.context.json();


      console.error(
        "CHECKOUT ERROR BODY:",
        errorBody
      );


      if (errorBody?.error) {

        errorMessage =
          errorBody.error;

      }

    } catch (contextError) {

      console.error(
        "Could not read checkout error:",
        contextError
      );

    }

  }


  formMessage(
    form,
    errorMessage,
    "error"
  );


  return;

}


if (data?.error) {

  formMessage(
    form,
    data.error,
    "error"
  );


  return;

}

    if (!data?.session_id) {
      formMessage(
        form,
        "Unable to create a secure checkout session.",
        "error"
      );
      return;
    }

    formMessage(form, "");

    showPaymentStep(details, data);
  } catch (error) {
    formMessage(
      form,
      error?.message || "Unable to create the checkout session.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Continue to payment →";
  }
}

async function startPayment() {
  const button =
    $("#pay-now");

  const message =
    $("#payment-message");

  if (!checkoutSession?.id) {
    message.textContent =
      "Your checkout session is missing. Please enter the shipment details again.";

    return;
  }

  if (
    new Date(
      checkoutSession.expires_at
    ).getTime() <= Date.now()
  ) {
    message.textContent =
      "This checkout session has expired. Please start again.";

    return;
  }

  const provider =
    document.querySelector(
      "#payment-provider .payment-provider-option[aria-pressed='true']"
    )?.dataset.provider;

  if (
    ![
      "paystack",
      "flutterwave",
      "stripe"
    ].includes(provider)
  ) {
    message.textContent =
      "Please select a payment gateway.";

    return;
  }

  button.disabled = true;

  button.textContent =
    "Starting secure payment…";

  message.textContent = "";

  try {
    const {
      data,
      error
    } = await supabase.functions.invoke(
      "create-payment",
      {
        body: {
          checkout_session_id:
            checkoutSession.id,

          provider
        }
      }
    );

    if (
      error ||
      data?.error
    ) {
      message.textContent =
        data?.error ||
        error?.message ||
        "Unable to start payment.";

      return;
    }

    if (
      !data?.authorization_url
    ) {
      message.textContent =
        "The payment provider did not return a checkout link.";

      return;
    }

    location.href =
      data.authorization_url;
  } finally {
    button.disabled = false;

    button.textContent =
      "Pay now";
  }
}


function bindPaymentProviders() {
  const options = document.querySelectorAll(
    "#payment-provider .payment-provider-option"
  );
  const hint = $("#payment-provider-hint");

  options.forEach((option) => {
    option.addEventListener("click", () => {
      options.forEach((item) => {
        const selected = item === option;
        item.setAttribute("aria-pressed", String(selected));
        item.classList.toggle("selected", selected);
      });

      if (hint) {
        hint.textContent =
          `${option.dataset.provider[0].toUpperCase()}${option.dataset.provider.slice(1)} selected.`;
      }
    });
  });
}

async function init() {
  bindSidebar();
  bindPaymentProviders();

  ctx =
    await requireRole([
      "customer"
    ]);

  if (!ctx) return;

  $("#user-name")
    .textContent =
    ctx.profile.full_name ||
    ctx.session.user.email;

  $("#signout")?.addEventListener(
    "click",
    async () => {
      await supabase.auth.signOut();

      location.href =
        "index.html";
    }
  );

  const form =
    $("#checkout-details-form");

  if (!form) return;

  form.addEventListener(
    "submit",
    event => {
      event.preventDefault();

      createCheckoutSession(
        form
      );
    }
  );

  bindLiveQuote(form);

  $("#back-to-details")
    ?.addEventListener(
      "click",
      () => {
        $("#payment-step").hidden =
          true;

        $("#details-step").hidden =
          false;

        $("#step-indicator-2")
          .classList.remove(
            "active"
          );

        $("#step-indicator-1")
          .classList.add(
            "active"
          );
      }
    );

  $("#pay-now")
    ?.addEventListener(
      "click",
      startPayment
    );
}

init();