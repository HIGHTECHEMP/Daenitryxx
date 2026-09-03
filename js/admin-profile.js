import { supabase } from "./supabase-client.js";
import {
  $,
  toast,
  formMessage
} from "./utils.js";

export function initProfilePage(ctx) {
  const form = $("#admin-profile-form");

  if (!form) return;

  const profile =
    ctx.profile || {};

  form.full_name.value =
    profile.full_name || "";

  form.phone.value =
    profile.phone || "";

  form.email.value =
    ctx.session.user.email || "";

  form.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

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

      formMessage(
        form,
        "Saving…"
      );

      const { error } =
        await supabase.rpc(
          "admin_update_profile",
          {
            p_full_name: fullName,
            p_phone: phone
          }
        );

      if (error) {
        formMessage(
          form,
          error.message,
          "error"
        );
        return;
      }

      formMessage(
        form,
        ""
      );

      toast(
        "Profile updated.",
        "success"
      );
    }
  );
}