import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGIN = "https://mi-ruta-pro.vercel.app";
const headers = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

function validateTemporaryPassword(v: unknown): string | null {
  if(typeof v!=="string" || v.length<8 || v.length>72) return "La clave debe tener entre 8 y 72 caracteres.";
  if(!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return "La clave debe incluir letras y números; no necesita símbolos especiales.";
  if(/\s/.test(v)) return "La clave no debe contener espacios.";
  if(["password123","password1","contrasena123","qwerty123","admin1234","ruta1234","12345678","123456789"].includes(v.toLowerCase())) return "Elige una clave temporal menos común.";
  return null;
}
function validDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d\d-\d\d$/.test(s) &&
   !Number.isNaN(Date.parse(s+"T00:00:00Z"));
}
const todayPeru = () => {
 const parts = new Intl.DateTimeFormat("en-US", {
  timeZone:"America/Lima",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date());
 const lookup = (name: string) => parts.find(p => p.type === name)?.value || "";
 return lookup("year")+"-"+lookup("month")+"-"+lookup("day");
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return respond({ error: "Método no permitido" }, 405);
  // Only the app's production origin can send browser provisioning requests.
  if (req.headers.get("origin") !== ALLOWED_ORIGIN) return respond({ error:"Origen no autorizado" }, 403);
  const bearer = req.headers.get("Authorization") || "";
  if (!bearer.startsWith("Bearer ")) return respond({ error: "Inicia sesión" }, 401);
  const baseUrl = Deno.env.get("SUPABASE_URL") || "";
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  if (!baseUrl || !secret) return respond({ error:"La función no está configurada" }, 503);
  const admin = createClient(baseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  try {
    const { data: verified, error: authError } = await admin.auth.getUser(bearer.slice(7));
    const callerId = verified?.user?.id;
    if (authError || !callerId) return respond({ error: "Sesión inválida" }, 401);
    const { data: role, error: roleError } = await admin.from("app_admins")
      .select("user_id").eq("user_id",callerId).maybeSingle();
    if (roleError || !role?.user_id) return respond({ error: "Solo el propietario puede crear cuentas" }, 403);
    let input: Record<string,unknown>;
    try { input = await req.json(); } catch { return respond({error:"Solicitud inválida"},400); }
    const action = String(input.action||"");
    if (action === "create") {
      const email = String(input.email || "").trim().toLowerCase();
      const name = String(input.name || "").trim();
      const plan = String(input.plan || "Mensual");
      const expiry = input.expires_at;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 250 ||
       !name || name.length > 100 ||
       !["Mensual","Trimestral","Anual","Cortesía"].includes(plan) ||
       !validDate(expiry) || expiry < todayPeru())
       return respond({error:"Completa nombre, correo, plan y vencimiento futuro."},400);
      const password = String(input.password||'');
      const passwordIssue=validateTemporaryPassword(password);
      if(passwordIssue) return respond({error:passwordIssue},400);
      const {data: created, error: createError} = await admin.auth.admin.createUser({
        email,password,email_confirm:true,
        user_metadata:{ display_name:name }
      });
      if(createError || !created?.user?.id) {
        // The caller can resolve a duplicate address without seeing internal authentication data.
        return respond({error:createError?.message?.includes("already") ?
          "Ese correo ya tiene una cuenta." : "No se pudo crear la cuenta."},409);
      }
      const newId = created.user.id;
      const {data: updated,error: updateError}=await admin.from("customer_accounts")
        .update({status:"active",plan,expires_at:expiry,must_change_password:true,updated_at:new Date().toISOString()})
        .eq("user_id",newId).select("user_id").single();
      if(updateError || !updated?.user_id){
        await admin.auth.admin.deleteUser(newId);
        return respond({error:"No se pudo habilitar la licencia. No se creó la cuenta."},500);
      }
      return respond({ok:true,email,client_name:name,user_id:newId});
    }
    if(action === "reset") {
      const targetId=String(input.user_id||"");
      if(!/^[0-9a-f-]{36}$/i.test(targetId)) return respond({error:"Cliente inválido"},400);
      const {data: existing,error: findError}=await admin.from("customer_accounts")
        .select("user_id,email").eq("user_id",targetId).maybeSingle();
      const {data: otherAdmin}=await admin.from("app_admins")
        .select("user_id").eq("user_id",targetId).maybeSingle();
      if(findError || !existing?.user_id || otherAdmin?.user_id)
        return respond({error:"No se puede restablecer esa cuenta."},403);
      const password=String(input.password||'');
      const passwordIssue=validateTemporaryPassword(password);
      if(passwordIssue) return respond({error:passwordIssue},400);
      const {error: resetError}=await admin.auth.admin.updateUserById(targetId,{password});
      if(resetError) return respond({error:"No se pudo cambiar el acceso."},500);
      const {error: flagError}=await admin.from("customer_accounts")
        .update({must_change_password:true,updated_at:new Date().toISOString()}).eq("user_id",targetId);
      if(flagError) return respond({error:"Clave modificada, pero no se pudo marcar el cambio obligatorio. Consulta soporte."},500);
      return respond({ok:true,email:existing.email});
    }
    return respond({error:"Acción no válida"},400);
  } catch(_e) {
    return respond({error:"No fue posible procesar la operación."},500);
  }
});
