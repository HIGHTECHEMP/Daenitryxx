import {

  supabase

} from "./supabase-client.js";


import {

  initCustomerDashboard

} from "./customer-shared.js";


import {

  $,

  formMessage,

  toast

} from "./utils.js";


let ctx = null;



function populateAccountInformation() {


  if (!ctx) {
    return;
  }


  const fullName =

    ctx.profile.full_name ||

    ctx.session.user
      .user_metadata
      ?.full_name ||

    "Customer";


  $("#settings-full-name")
    .textContent =
    fullName;


  $("#settings-email")
    .textContent =

    ctx.session.user.email ||

    "—";

}



async function changePassword(
  event
) {


  event.preventDefault();


  const form =
    event.currentTarget;


  const password =
    String(

      $("#new-password")
        ?.value ||

      ""

    );


  const confirmPassword =
    String(

      $("#confirm-password")
        ?.value ||

      ""

    );


  if (
    password.length < 6
  ) {


    formMessage(

      form,

      "Your password must contain at least 6 characters.",

      "error"

    );


    return;

  }


  if (
    password !==
    confirmPassword
  ) {


    formMessage(

      form,

      "The passwords do not match.",

      "error"

    );


    return;

  }


  const button =
    $("#change-password-button");


  button.disabled =
    true;


  button.textContent =
    "Updating…";


  formMessage(
    form,
    ""
  );


  try {


    const {

      error

    } =

      await supabase.auth.updateUser({

        password

      });


    if (error) {

      throw error;

    }


    form.reset();


    formMessage(

      form,

      "Your password has been updated successfully.",

      "success"

    );


    toast(

      "Password updated successfully.",

      "success"

    );


  } catch (error) {


    formMessage(

      form,

      error.message ||

      "Unable to update your password.",

      "error"

    );


  } finally {


    button.disabled =
      false;


    button.textContent =
      "Update password";

  }


}



async function init() {


  const dashboard =
    await initCustomerDashboard();


  if (!dashboard) {
    return;
  }


  ctx =
    dashboard.ctx;


  populateAccountInformation();


  $("#change-password-form")
    ?.addEventListener(

      "submit",

      changePassword

    );

}


init();