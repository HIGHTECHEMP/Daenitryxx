export const $ = (s,root=document)=>root.querySelector(s);
export const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
export function escapeHtml(value=""){return String(value).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
export function formatDate(value){if(!value)return "—"; return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));}
export function money(value,currency="NGN"){return new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}).format(Number(value)||0);}
export function toast(message,type=""){const region=$("#toast-region")||(()=>{const r=document.createElement("div");r.id="toast-region";r.className="toast-region";document.body.append(r);return r})();const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=message;region.append(el);setTimeout(()=>el.remove(),4500);}
export function formMessage(form,message,type=""){const el=$(".form-message",form);if(el){el.textContent=message;el.className=`form-message ${type}`;}}
export function query(name){return new URLSearchParams(location.search).get(name);}
export function safeTracking(value){return /^[A-Za-z0-9-]{6,40}$/.test(value);}
