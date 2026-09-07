import { supabase } from "./supabase-client.js";
import { $, formMessage, toast, query } from "./utils.js";

export async function getSession(){
  const {data,error}=await supabase.auth.getSession();
  if(error) throw error;
  return data.session;
}

export async function getProfile(){
  const session=await getSession();
  if(!session) return null;
  const {data,error}=await supabase.from("profiles")
    .select("id,full_name,phone,role,avatar_path,created_at,updated_at")
    .eq("id",session.user.id).single();
  if(error) throw error;
  return data;
}

function destinationForRole(role,next){
  if(next && next.startsWith("customer/")) return next;
  if(next && next.startsWith("driver/")) return next;
  if(next && next.startsWith("admin/")) return next;
  if(role==="admin") return "admin/index.html";
  if(role==="driver") return "driver/index.html";
  return "customer/index.html";
}

export async function requireRole(roles=[]){
  const session=await getSession().catch(()=>null);
  if(!session){
    const next=location.pathname.split("/").pop()==="index.html"?"":location.pathname.replace(/^\//,"");
    location.href=`../login.html?next=${encodeURIComponent(next)}`;
    return null;
  }
  try{
    const profile=await getProfile();
    if(!profile || (roles.length && !roles.includes(profile.role))){
      location.href="../index.html";
      return null;
    }
    return {session,profile};
  }catch(error){
    console.error(error);
    toast("Unable to load your account. Please sign in again.","error");
    await supabase.auth.signOut();
    location.href="../login.html";
    return null;
  }
}

export async function signOut(){
  await supabase.auth.signOut();
  location.href="../index.html";
}

export async function bindAuthForms(){
  initPasswordToggles();
  const login=$("#login-form");
  if(login) login.addEventListener("submit",async e=>{
    e.preventDefault();
    const f=new FormData(login);
    const email=String(f.get("email")||"").trim();
    const password=String(f.get("password")||"");
    formMessage(login,"Signing in…");
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error) return formMessage(login,error.message,"error");
    try{
      const p=await getProfile();
      const next=query("next");
      location.href=destinationForRole(p?.role,next);
    }catch(error){
      await supabase.auth.signOut();
      formMessage(login,"Account profile could not be loaded. Please contact support.","error");
    }
  });

  const reg=$("#register-form");
  if(reg) reg.addEventListener("submit",async e=>{
    e.preventDefault();
    const f=new FormData(reg);
    const password=String(f.get("password")||"");
    if(password!==String(f.get("confirm_password")||"")) return formMessage(reg,"Passwords do not match.","error");
    formMessage(reg,"Creating account…");
    const {data,error}=await supabase.auth.signUp({
      email:String(f.get("email")||"").trim(),
      password,
      options:{data:{full_name:String(f.get("full_name")||"").trim(),phone:String(f.get("phone")||"").trim(),account_type:"customer"}}
    });
    if(error) return formMessage(reg,error.message,"error");
    if(data.session) location.href="customer/index.html";
    else formMessage(reg,"Account created. Check your email to confirm your account, then sign in.","success");
  });

  const driver=$("#driver-register-form");
  if(driver) driver.addEventListener("submit",async e=>{
    e.preventDefault();
    const f=new FormData(driver);
    const password=String(f.get("password")||"");
    const confirm=String(f.get("confirm_password")||"");
    if(password!==confirm) return formMessage(driver,"Passwords do not match.","error");
    if(password.length<8) return formMessage(driver,"Password must contain at least 8 characters.","error");
    formMessage(driver,"Creating account and submitting application…");
    const payload={
      full_name:String(f.get("full_name")||"").trim(),
      phone:String(f.get("phone")||"").trim(),
      account_type:"driver",
      vehicle_type:String(f.get("vehicle_type")||"").trim(),
      license_reference:String(f.get("license_reference")||"").trim(),
      notes:String(f.get("notes")||"").trim()||null
    };
    const {data,error}=await supabase.auth.signUp({
      email:String(f.get("email")||"").trim(),
      password,
      options:{data:payload}
    });
    if(error) return formMessage(driver,error.message,"error");
    if(!data.user) return formMessage(driver,"Unable to create the account.","error");
    formMessage(driver,data.session
      ? "Application submitted. An administrator must approve it before you can receive deliveries."
      : "Application submitted. Check your email to confirm your account. An administrator must approve your application before you can receive deliveries.","success");
    driver.reset();
  });

  function initPasswordToggles() {
    const passwordInputs = document.querySelectorAll('input[type="password"]');

    passwordInputs.forEach((input) => {
      if (input.dataset.passwordToggle === "true") return;

      input.dataset.passwordToggle = "true";

      const wrapper = document.createElement("div");
      wrapper.className = "password-field";
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "password-toggle";
      button.setAttribute("aria-label", "Show password");
      button.setAttribute("aria-pressed", "false");
      button.title = "Show password";
      button.innerHTML = `
        <svg class="password-eye-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
          <circle cx="12" cy="12" r="2.7"></circle>
        </svg>
      `;
      wrapper.appendChild(button);

      button.addEventListener("click", () => {
        const isVisible = input.type === "text";
        input.type = isVisible ? "password" : "text";
        button.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
        button.setAttribute("aria-pressed", String(!isVisible));
        button.title = isVisible ? "Show password" : "Hide password";
        button.classList.toggle("is-visible", !isVisible);
      });
    });
  }

  const forgot=$("#forgot-password");
  if(forgot) forgot.addEventListener("click",async()=>{
    const form=$("#login-form");
    const email=form?.querySelector('input[name="email"]')?.value.trim();
    if(!email) return formMessage(form,"Enter your email first.","error");
    const redirect=`${location.origin}${location.pathname.replace("login.html","")}reset-password.html`;
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:redirect});
    if(error) return formMessage(form,error.message,"error");
    formMessage(form,"Password reset instructions sent if the email exists.","success");
  });
}
