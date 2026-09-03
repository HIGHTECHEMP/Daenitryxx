import { supabase } from "./supabase-client.js";
import {
  $,
  formMessage,
  toast
} from "./utils.js";
import { initDriverDashboard } from "./driver-shared.js";


let ctx = null;


async function loadProfile() {

  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", ctx.user.id)
    .maybeSingle();


  if (error) {
    toast(
      error.message ||
      "Unable to load profile.",
      "error"
    );
    return;
  }


  if ($("#profile-full-name")) {
    $("#profile-full-name").value =
      data?.full_name || "";
  }


  if ($("#profile-phone")) {
    $("#profile-phone").value =
      data?.phone || "";
  }


  if ($("#profile-email")) {
    $("#profile-email").value =
      ctx.user.email || "";
  }

}


function bindProfileForm() {

  const form =
    $("#driver-profile-form");

  if (!form) return;


  form.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();


      const fullName =
        $("#profile-full-name")
          ?.value
          .trim() || "";

      const phone =
        $("#profile-phone")
          ?.value
          .trim() || null;


      if (!fullName) {

        formMessage(
          form,
          "Full name is required.",
          "error"
        );

        return;
      }


      const button =
        form.querySelector(
          "button[type='submit']"
        );


      if (button) {
        button.disabled = true;
        button.textContent = "Saving...";
      }


      const { error } =
        await supabase
          .from("profiles")
          .update({
            full_name: fullName,
            phone
          })
          .eq("id", ctx.user.id);


      if (button) {
        button.disabled = false;
        button.textContent = "Save changes";
      }


      if (error) {

        formMessage(
          form,
          error.message ||
          "Unable to update profile.",
          "error"
        );

        return;
      }


      formMessage(
        form,
        "Profile updated successfully.",
        "success"
      );


      const name =
        $("#user-name");

      if (name) {
        name.textContent = fullName;
      }


      toast(
        "Profile updated.",
        "success"
      );

    }
  );

}


async function init() {

  try {

    const result =
      await initDriverDashboard();

    ctx = result.ctx;

    await loadProfile();

    bindProfileForm();

  } catch (error) {

    toast(
      error?.message ||
      "Unable to load profile.",
      "error"
    );

  }

}


init();