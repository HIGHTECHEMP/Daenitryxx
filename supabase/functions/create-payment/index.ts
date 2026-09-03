import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(supabaseUrl, serviceKey);

const cors = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Authentication required" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } }
    });

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Authentication required" }, 401);

    const { checkout_session_id, provider } = await req.json();

    if (!checkout_session_id || !["paystack", "flutterwave"].includes(provider)) {
      return json({ error: "Invalid payment request" }, 400);
    }

    const { data: checkout, error: checkoutError } = await admin
      .from("shipment_checkout_sessions")
      .select("id,customer_id,quoted_fee,currency,status,expires_at")
      .eq("id", checkout_session_id)
      .eq("customer_id", user.id)
      .single();

    if (checkoutError || !checkout) {
      return json({ error: "Checkout session not found" }, 404);
    }

    if (checkout.status !== "pending") {
      return json({ error: "This checkout session is no longer payable" }, 409);
    }

    if (new Date(checkout.expires_at).getTime() <= Date.now()) {
      await admin
        .from("shipment_checkout_sessions")
        .update({ status: "expired" })
        .eq("id", checkout.id)
        .eq("status", "pending");
      return json({ error: "This checkout session has expired. Please start again." }, 410);
    }

    const { data: existingPayment } = await admin
      .from("payments")
      .select("provider_reference,amount,currency,status")
      .eq("checkout_session_id", checkout.id)
      .eq("provider", provider)
      .eq("status", "pending")
      .maybeSingle();

    if (existingPayment?.provider_reference) {
      return json({
        reference: existingPayment.provider_reference,
        amount: checkout.quoted_fee,
        currency: checkout.currency,
        error: "A payment is already in progress for this checkout. Return to the existing payment window if it is still open."
      }, 409);
    }

    const reference = `DXPAY-${crypto.randomUUID()}`;

    const { error: paymentError } = await admin.from("payments").insert({
      shipment_id: null,
      checkout_session_id: checkout.id,
      customer_id: user.id,
      provider,
      provider_reference: reference,
      amount: checkout.quoted_fee,
      currency: checkout.currency,
      status: "pending",
      metadata: {
        checkout_session_id: checkout.id
      }
    });

    if (paymentError) throw paymentError;

    const origin = req.headers.get("origin") || Deno.env.get("PUBLIC_SITE_URL") || "";
    const redirect = `${origin.replace(/\/$/, "")}/payment-return.html?provider=${provider}`;
    let authorization_url = "";

    if (provider === "paystack") {
      const key = Deno.env.get("PAYSTACK_SECRET_KEY");
      if (!key) {
        await admin.from("payments").update({ status: "failed" }).eq("provider_reference", reference);
        return json({ error: "Paystack is not configured" }, 503);
      }

      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: user.email,
          amount: Math.round(Number(checkout.quoted_fee) * 100),
          currency: checkout.currency,
          reference,
          callback_url: redirect,
          metadata: { checkout_session_id: checkout.id }
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload.status || !payload.data?.authorization_url) {
        await admin.from("payments").update({ status: "failed" }).eq("provider_reference", reference);
        return json({ error: payload.message || "Unable to initialize Paystack payment" }, 502);
      }

      authorization_url = payload.data.authorization_url;
    } else {
      const key = Deno.env.get("FLW_SECRET_KEY");
      if (!key) {
        await admin.from("payments").update({ status: "failed" }).eq("provider_reference", reference);
        return json({ error: "Flutterwave is not configured" }, 503);
      }

      const response = await fetch("https://api.flutterwave.com/v3/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tx_ref: reference,
          amount: Number(checkout.quoted_fee),
          currency: checkout.currency,
          redirect_url: redirect,
          customer: {
            email: user.email
          },
          meta: { checkout_session_id: checkout.id }
        })
      });

      const payload = await response.json();
      if (!response.ok || payload.status !== "success" || !payload.data?.link) {
        await admin.from("payments").update({ status: "failed" }).eq("provider_reference", reference);
        return json({ error: payload.message || "Unable to initialize Flutterwave payment" }, 502);
      }

      authorization_url = payload.data.link;
    }

    return json({
      reference,
      amount: checkout.quoted_fee,
      currency: checkout.currency,
      authorization_url
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "Unexpected error"
    }, 500);
  }
});