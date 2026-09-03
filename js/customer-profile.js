import { supabase } from "./supabase-client.js";
import {
  $,
  formMessage,
  toast
} from "./utils.js";

import {
  initCustomerDashboard
} from "./customer-shared.js";


let ctx;


/* =========================================================
   LOAD PROFILE
========================================================= */

function loadProfile() {

  const form =
    $("#profile-form");

  if (!form) return;


  if (form.full_name) {

    form.full_name.value =
      ctx.profile?.full_name ||
      "";

  }


  if (form.phone) {

    form.phone.value =
      ctx.profile?.phone ||
      "";

  }

}


/* =========================================================
   SAVE PROFILE
========================================================= */

async function saveProfile(event) {

  event.preventDefault();

  const form =
    event.currentTarget;


  const fullName =
    form.full_name.value.trim();

  const phone =
    form.phone.value.trim();


  if (!fullName) {

    formMessage(
      form,
      "Full name is required.",
      "error"
    );

    return;
  }


  const {
    error
  } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone
    })
    .eq(
      "id",
      ctx.session.user.id
    );


  if (error) {

    formMessage(
      form,
      error.message,
      "error"
    );

    return;
  }


  const {
    data: profile,
    error: profileError
  } = await supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      phone,
      role,
      avatar_path,
      created_at,
      updated_at
    `)
    .eq(
      "id",
      ctx.session.user.id
    )
    .single();


  if (profileError) {

    formMessage(
      form,
      profileError.message,
      "error"
    );

    return;
  }


  ctx.profile =
    profile;


  $("#user-name").textContent =
    profile.full_name ||
    ctx.session.user.email;


  formMessage(
    form,
    "Profile saved successfully.",
    "success"
  );

}


/* =========================================================
   INIT
========================================================= */

async function init() {

  const dashboard =
    await initCustomerDashboard();

  if (!dashboard) {
    return;
  }

  ctx =
    dashboard.ctx;


  loadProfile();


  $("#profile-form")?.addEventListener(
    "submit",
    saveProfile
  );

}


init();