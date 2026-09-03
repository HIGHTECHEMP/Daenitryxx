import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl =
  Deno.env.get("SUPABASE_URL")!;

const serviceRoleKey =
  Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY"
  )!;

const db = createClient(
  supabaseUrl,
  serviceRoleKey
);

const corsHeaders = {
  "Content-Type":
    "application/json",

  "Access-Control-Allow-Origin":
    "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type"
};

function json(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: corsHeaders
    }
  );
}

Deno.serve(
  async request => {
    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders
        }
      );
    }

    if (
      request.method !==
      "POST"
    ) {
      return json(
        {
          error:
            "Method not allowed"
        },
        405
      );
    }

    try {
      const body =
        await request.json();

      const provider =
        String(
          body.provider ||
            ""
        )
          .trim()
          .toLowerCase();

      let reference =
        String(
          body.reference ||
            ""
        ).trim();

      const stripeSessionId =
        body.session_id
          ? String(body.session_id).trim()
          : null;

      const transactionId =
        body.transaction_id
          ? String(
              body.transaction_id
            ).trim()
          : null;

      if (
        !provider ||
        (!reference && !(provider === "stripe" && stripeSessionId))
      ) {
        return json(
          {
            error:
              "provider and reference are required"
          },
          400
        );
      }

      let verified =
        false;

      let verifiedAmount:
        | number
        | null = null;

      let verifiedCurrency:
        | string
        | null = null;

      let providerData:
        | unknown = null;

      /*
       * ----------------------------------------------------
       * PAYSTACK
       * ----------------------------------------------------
       */

      if (
        provider ===
        "paystack"
      ) {
        const secretKey =
          Deno.env.get(
            "PAYSTACK_SECRET_KEY"
          );

        if (!secretKey) {
          return json(
            {
              error:
                "Paystack is not configured on the server."
            },
            503
          );
        }

        const response =
          await fetch(
            `https://api.paystack.co/transaction/verify/${encodeURIComponent(
              reference
            )}`,
            {
              method:
                "GET",

              headers: {
                Authorization:
                  `Bearer ${secretKey}`
              }
            }
          );

        if (
          !response.ok
        ) {
          return json(
            {
              error:
                "Unable to verify the Paystack transaction."
            },
            502
          );
        }

        const payload =
          await response.json();

        providerData =
          payload.data;

        verified =
          payload.status ===
            true &&
          payload.data
            ?.status ===
            "success";

        if (
          payload.data
            ?.amount != null
        ) {
          verifiedAmount =
            Number(
              payload.data
                .amount
            ) / 100;
        }

        verifiedCurrency =
          payload.data
            ?.currency ||
          null;

        /*
         * Make sure the provider reference
         * really belongs to this transaction.
         */

        const providerReference =
          String(
            payload.data
              ?.reference ||
              ""
          );

        if (
          providerReference !==
          reference
        ) {
          verified = false;
        }
      }

      /*
       * ----------------------------------------------------
       * FLUTTERWAVE
       * ----------------------------------------------------
       */

      else if (
        provider ===
        "flutterwave"
      ) {
        const secretKey =
          Deno.env.get(
            "FLW_SECRET_KEY"
          );

        if (!secretKey) {
          return json(
            {
              error:
                "Flutterwave is not configured on the server."
            },
            503
          );
        }

        if (
          !transactionId
        ) {
          return json(
            {
              error:
                "Flutterwave transaction id is required."
            },
            400
          );
        }

        const response =
          await fetch(
            `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(
              transactionId
            )}/verify`,
            {
              method:
                "GET",

              headers: {
                Authorization:
                  `Bearer ${secretKey}`
              }
            }
          );

        if (
          !response.ok
        ) {
          return json(
            {
              error:
                "Unable to verify the Flutterwave transaction."
            },
            502
          );
        }

        const payload =
          await response.json();

        providerData =
          payload.data;

        verified =
          payload.status ===
            "success" &&
          payload.data
            ?.status ===
            "successful" &&
          String(
            payload.data
              ?.tx_ref ||
              ""
          ) ===
            reference;

        if (
          payload.data
            ?.amount != null
        ) {
          verifiedAmount =
            Number(
              payload.data
                .amount
            );
        }

        verifiedCurrency =
          payload.data
            ?.currency ||
          null;
      }

      /*
       * ----------------------------------------------------
       * STRIPE
       * ----------------------------------------------------
       */

      else if (provider === "stripe") {
        const secretKey = Deno.env.get("STRIPE_SECRET_KEY");

        if (!secretKey) {
          return json({
            error: "Stripe is not configured on the server."
          }, 503);
        }

        if (!stripeSessionId) {
          return json({
            error: "Stripe checkout session id is required."
          }, 400);
        }

        const response = await fetch(
          `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(stripeSessionId)}?expand[]=payment_intent`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${secretKey}`
            }
          }
        );

        const payload = await response.json();

        if (!response.ok || !payload?.id) {
          return json({
            error:
              payload?.error?.message ||
              "Unable to verify the Stripe payment."
          }, 502);
        }

        providerData = payload;

        const stripeReference =
          String(
            payload.metadata?.provider_reference ||
            payload.client_reference_id ||
            ""
          ).trim();

        if (!stripeReference) {
          return json({
            error: "Stripe payment reference is missing."
          }, 400);
        }

        reference = stripeReference;

        verified =
          payload.status === "complete" &&
          payload.payment_status === "paid";

        if (payload.amount_total != null) {
          verifiedAmount = Number(payload.amount_total) / 100;
        }

        verifiedCurrency =
          payload.currency
            ? String(payload.currency).toUpperCase()
            : null;
      }

      /*
       * ----------------------------------------------------
       * UNSUPPORTED PROVIDER
       * ----------------------------------------------------
       */

      else {
        return json(
          {
            error:
              "Unsupported payment provider."
          },
          400
        );
      }

      /*
       * ----------------------------------------------------
       * FIND THE EXISTING CHECKOUT PAYMENT
       * ----------------------------------------------------
       *
       * This payment was created before the customer
       * was sent to the payment provider.
       *
       * The shipment does NOT need to exist yet.
       */

      const {
        data: payment,
        error: paymentError
      } = await db
        .from("payments")
        .select(`
          id,
          shipment_id,
          customer_id,
          amount,
          currency,
          status
        `)
        .eq(
          "provider_reference",
          reference
        )
        .single();

      if (
        paymentError ||
        !payment
      ) {
        return json(
          {
            error:
              "Payment record not found."
          },
          404
        );
      }

      /*
       * ----------------------------------------------------
       * IDEMPOTENCY
       * ----------------------------------------------------
       *
       * If the webhook/return page calls this function
       * more than once, don't create another shipment.
       */

      if (
        payment.status ===
          "successful" &&
        payment.shipment_id
      ) {
        const {
          data: shipment
        } = await db
          .from("shipments")
          .select(
            "id,tracking_number"
          )
          .eq(
            "id",
            payment.shipment_id
          )
          .single();

        return json({
          verified: true,

          payment_id:
            payment.id,

          shipment_id:
            shipment?.id,

          tracking_number:
            shipment?.tracking_number
        });
      }

      /*
       * ----------------------------------------------------
       * PAYMENT MUST ACTUALLY BE VERIFIED
       * ----------------------------------------------------
       */

      if (!verified) {
        await db
          .from("payments")
          .update({
            status:
              "failed",

            metadata: {
              provider,
              provider_response:
                providerData
            }
          })
          .eq(
            "id",
            payment.id
          )
          .eq(
            "status",
            "pending"
          );

        return json({
          verified: false,

          message:
            "Payment was not verified."
        });
      }

      /*
       * ----------------------------------------------------
       * AMOUNT CHECK
       * ----------------------------------------------------
       *
       * This is critical.
       *
       * We don't trust the amount sent by the browser.
       * We compare the amount from the provider against
       * the amount stored in our database checkout record.
       */

      const expectedAmount =
        Number(
          payment.amount
        );

      const actualAmount =
        Number(
          verifiedAmount
        );

      if (
        !Number.isFinite(
          actualAmount
        ) ||
        actualAmount !==
          expectedAmount
      ) {
        await db
          .from("payments")
          .update({
            status:
              "failed",

            metadata: {
              provider,
              reason:
                "amount_mismatch",

              expected_amount:
                expectedAmount,

              verified_amount:
                actualAmount,

              provider_response:
                providerData
            }
          })
          .eq(
            "id",
            payment.id
          )
          .eq(
            "status",
            "pending"
          );

        return json(
          {
            error:
              "Verified payment amount does not match the checkout amount."
          },
          409
        );
      }

      /*
       * ----------------------------------------------------
       * CURRENCY CHECK
       * ----------------------------------------------------
       */

      if (
        !verifiedCurrency ||
        payment.currency !==
          verifiedCurrency
      ) {
        await db
          .from("payments")
          .update({
            status:
              "failed",

            metadata: {
              provider,
              reason:
                "currency_mismatch",

              expected_currency:
                payment.currency,

              verified_currency:
                verifiedCurrency,

              provider_response:
                providerData
            }
          })
          .eq(
            "id",
            payment.id
          )
          .eq(
            "status",
            "pending"
          );

        return json(
          {
            error:
              "Verified payment currency does not match the checkout currency."
          },
          409
        );
      }

      /*
       * ----------------------------------------------------
       * FINALIZE
       * ----------------------------------------------------
       *
       * This database function should:
       *
       * 1. Mark payment successful
       * 2. Create the shipment
       * 3. Generate tracking number
       * 4. Create initial shipment history
       * 5. Create customer notification
       * 6. Record audit activity
       *
       * It should do all of this atomically.
       */

      const {
        data: finalized,
        error:
          finalizeError
      } = await db.rpc(
        "finalize_paid_checkout",
        {
          p_payment_id:
            payment.id,

          p_provider_data:
            providerData || {}
        }
      );

      if (
        finalizeError
      ) {
        return json(
          {
            error:
              finalizeError.message ||
              "Payment was verified, but shipment finalization failed."
          },
          500
        );
      }

      const result =
        Array.isArray(
          finalized
        )
          ? finalized[0]
          : finalized;

      return json({
        verified: true,

        payment_id:
          payment.id,

        shipment_id:
          result?.shipment_id,

        tracking_number:
          result?.tracking_number
      });
    } catch (error) {
      return json(
        {
          error:
            error instanceof
            Error
              ? error.message
              : "Unexpected payment verification error."
        },
        500
      );
    }
  }
);