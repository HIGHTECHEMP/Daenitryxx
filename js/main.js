import { supabase } from "./supabase-client.js";
import { $, $$, escapeHtml, formatDate, money, toast, formMessage, safeTracking } from "./utils.js";
import { bindAuthForms, getSession } from "./auth.js";

const navLinks=[["index.html","Home"],["about.html","About"],["services.html","Services"],["shipping.html","Solutions"],["tracking.html","Track"]];
function header(){
  const h=$("#site-header");if(!h)return;
  h.innerHTML=`<header class="site-header"><div class="container nav"><a class="brand" href="index.html"><span>DX</span> DAENITRYXX</a><nav class="nav-links" aria-label="Primary">${navLinks.map(([u,t])=>`<a href="${u}" data-nav="${u}">${t}</a>`).join("")}<a href="faq.html">FAQ</a><a href="contact.html">Contact</a></nav><div class="nav-actions"><a class="btn btn-ghost" href="login.html">Sign in</a><a class="btn btn-primary" href="register.html">Get Started</a><button class="menu-toggle" aria-label="Open menu" aria-expanded="false">☰</button></div></div></header>`;
  const current=location.pathname.split("/").pop()||"index.html";$$("[data-nav]").forEach(a=>{if(a.dataset.nav===current)a.classList.add("active")});
  $(".menu-toggle")?.addEventListener("click",()=>{$(".nav-links").classList.toggle("open");$(".menu-toggle").setAttribute("aria-expanded",String($(".nav-links").classList.contains("open")))})
}
function footer(){const f=$("#site-footer");if(!f)return;f.innerHTML=`<footer class="site-footer"><div class="container footer-grid"><div><a class="brand" href="index.html"><span>DX</span> DAENITRYXX</a><p>Modern logistics and delivery operations, designed around visibility and trust.</p></div><div><b>Platform</b><p><a href="services.html">Services</a></p><p><a href="tracking.html">Track shipment</a></p><p><a href="shipping.html">Solutions</a></p></div><div><b>Accounts</b><p><a href="login.html">Customer login</a></p><p><a href="register.html">Register</a></p><p><a href="driver-register.html">Driver application</a></p></div><div><b>Support</b><p><a href="contact.html">Contact us</a></p><p><a href="faq.html">FAQ</a></p></div></div><div class="container footer-bottom">© ${new Date().getFullYear()} DAENITRYXX. All rights reserved.</div></footer>`}
async function supportForm(){const form=$("#support-form");if(!form)return;const session=await getSession().catch(()=>null);if(session){try{const {data}=await supabase.from("profiles").select("full_name,phone").eq("id",session.user.id).single();if(data){if(!form.elements.name.value)form.elements.name.value=data.full_name||"";if(!form.elements.email.value)form.elements.email.value=session.user.email||""}}catch{}}form.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(form);formMessage(form,"Sending…");const payload={user_id:session?.user?.id||null,name:String(f.get("name")||"").trim(),email:String(f.get("email")||"").trim(),subject:String(f.get("subject")||"").trim(),message:String(f.get("message")||"").trim()};const {error}=await supabase.from("support_requests").insert(payload);if(error)return formMessage(form,error.message,"error");form.reset();formMessage(form,"Your request has been received.","success");toast("Support request sent","success")})}
async function tracking(){
  const form=$("#tracking-form"),result=$("#tracking-result");if(!form)return;
  async function run(value){
    const number=String(value||"").trim().toUpperCase();
    if(!safeTracking(number)){result.innerHTML=`<div class="empty">Enter a valid tracking number.</div>`;return}
    result.innerHTML=`<div class="empty">Loading shipment…</div>`;
    const session=await getSession().catch(()=>null);
    const fn=session?"get_my_tracking":"get_public_tracking";
    const {data,error}=await supabase.rpc(fn,{p_tracking_number:number});
    if(error){console.error(error);result.innerHTML=`<div class="empty">Unable to load tracking right now. Please try again.</div>`;return}
    if(!data?.length){result.innerHTML=`<div class="empty">No shipment was found for <strong>${escapeHtml(number)}</strong>, or you are not authorized to view it.</div>`;return}
    const s=data[0],history=Array.isArray(s.history)?s.history:[];
    result.innerHTML=`<article class="tracking-card"><div><span class="status-pill"><i class="status-dot"></i>${escapeHtml(s.status.replaceAll("_"," "))}</span><h2>${escapeHtml(s.tracking_number)}</h2><div class="tracking-meta"><div class="meta-box"><small>PICKUP</small><b>${escapeHtml(s.pickup_city||"—")}</b></div><div class="meta-box"><small>DELIVERY</small><b>${escapeHtml(s.delivery_city||"—")}</b></div><div class="meta-box"><small>PACKAGE</small><b>${escapeHtml(s.package_description||"—")}</b></div><div class="meta-box"><small>UPDATED</small><b>${formatDate(s.updated_at)}</b></div></div><h3>Shipment timeline</h3><div class="timeline-list">${history.length?history.map(x=>`<div class="timeline-item"><i></i><div><h4>${escapeHtml(String(x.status).replaceAll("_"," "))}</h4><small>${formatDate(x.created_at)}${x.note?` · ${escapeHtml(x.note)}`:""}</small></div></div>`).join(""):`<div class="empty">No shipment history available yet.</div>`}</div></div><div><div class="meta-box"><small>ROUTE</small><p>${escapeHtml(s.pickup_city||"—")} → ${escapeHtml(s.delivery_city||"—")}</p></div><div class="meta-box" style="margin-top:12px"><small>TRACKING ACCESS</small><p>${session?"You are signed in and viewing a shipment you are authorized to access.":"Public tracking shows limited shipment information."}</p></div></div></article>`;
  }
  form.addEventListener("submit",e=>{e.preventDefault();run(form.elements.tracking_number.value)});
  const pre=new URLSearchParams(location.search).get("tracking");if(pre){form.elements.tracking_number.value=pre;run(pre)}
}
header();footer();bindAuthForms();supportForm();tracking();
