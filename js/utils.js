export const $ = (s,root=document)=>root.querySelector(s);
export const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
export function escapeHtml(value=""){return String(value).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
export function formatDate(value){if(!value)return "—"; return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));}
export function money(value,currency="NGN"){return new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}).format(Number(value)||0);}
export function toast(message,type=""){const region=$("#toast-region")||(()=>{const r=document.createElement("div");r.id="toast-region";r.className="toast-region";document.body.append(r);return r})();const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=message;region.append(el);setTimeout(()=>el.remove(),4500);}
export function formMessage(form,message,type=""){const el=$(".form-message",form);if(el){el.textContent=message;el.className=`form-message ${type}`;}}
export function query(name){return new URLSearchParams(location.search).get(name);}
export function safeTracking(value){return /^[A-Za-z0-9-]{6,40}$/.test(value);}
/* =========================================================
   COPY TO CLIPBOARD
   ========================================================= */

export async function copyToClipboard(
  value,
  successMessage = "Copied to clipboard."
) {

  const text =
    String(value ?? "").trim();

  if (!text) {
    toast(
      "Nothing to copy.",
      "error"
    );

    return false;
  }

  try {

    await navigator.clipboard.writeText(
      text
    );

    toast(
      successMessage,
      "success"
    );

    return true;

  } catch (error) {

    /*
     * Fallback for browsers/environments
     * where Clipboard API is unavailable.
     */
    try {

      const textarea =
        document.createElement("textarea");

      textarea.value = text;

      textarea.style.position =
        "fixed";

      textarea.style.opacity =
        "0";

      document.body.appendChild(
        textarea
      );

      textarea.select();

      const copied =
        document.execCommand("copy");

      textarea.remove();

      if (copied) {

        toast(
          successMessage,
          "success"
        );

        return true;
      }

    } catch (_) {
      /* Ignore fallback failure. */
    }

    toast(
      "Unable to copy tracking number.",
      "error"
    );

    return false;
  }
}


/*
 * Attach copy behaviour to buttons generated
 * dynamically inside dashboards.
 */
export function bindCopyButtons(
  root = document
) {

  root
    .querySelectorAll(
      "[data-copy-value]"
    )
    .forEach((button) => {

      if (
        button.dataset.copyBound === "true"
      ) {
        return;
      }

      button.dataset.copyBound =
        "true";

      button.addEventListener(
        "click",
        async (event) => {

          event.preventDefault();
          event.stopPropagation();

          const value =
            button.dataset.copyValue;

          await copyToClipboard(
            value,
            "Tracking number copied."
          );

        }
      );

    });

}