// ══════════════════════════════════════════════════════════
//  AUTH — Login con Google + Email/Contraseña
// ══════════════════════════════════════════════════════════

let currentUser = null;
let currentRole = null;
let currentData = null;

const params  = new URLSearchParams(location.search);
const isScan  = params.get(“scan”) === “1”;
const cursoQR = params.get(“curso”);
const precQR  = params.get(“prec”);

function isWebView() {
const ua = navigator.userAgent || “”;
return ua.indexOf(“FBAN”) > -1 || ua.indexOf(“FBAV”) > -1 ||
ua.indexOf(“Instagram”) > -1 || ua.indexOf(“WebView”) > -1 ||
(ua.indexOf(“iPhone”) > -1 && ua.indexOf(“Safari”) === -1) ||
(ua.indexOf(“iPad”) > -1 && ua.indexOf(“Safari”) === -1);
}

window.addEventListener(“DOMContentLoaded”, () => {
if (isScan && cursoQR && precQR) {
renderVistaAlumno(cursoQR, precQR);
return;
}

const savedSession = sessionStorage.getItem(“precLogin”);
if (savedSession) {
try {
currentData = JSON.parse(savedSession);
currentRole = “preceptor”;
renderPreceptorPanel();
return;
} catch(e) {
sessionStorage.removeItem(“precLogin”);
}
}

auth.onAuthStateChanged(async user => {
if (!user) { renderLogin(); return; }
currentUser = user;
await resolveRole(user);
});
});

async function resolveRole(user) {
document.getElementById(“app”).innerHTML = ‘<div class="loading">Cargando…</div>’;

if (user.email === ADMIN_MAIL) {
currentRole = “admin”;
db.ref(“config/adminUid”).once(“value”, snap => {
if (!snap.val()) db.ref(“config/adminUid”).set(user.uid);
});
renderAdminPanel();
return;
}

const snap = await db.ref(“preceptores”).orderByChild(“email”).equalTo(user.email).once(“value”);
const data = snap.val();

if (data) {
const precId = Object.keys(data)[0];
currentRole  = “preceptor”;
currentData  = { id: precId, …data[precId] };
renderPreceptorPanel();
} else {
renderNoAutorizado(user);
}
}

function renderLogin() {
const webview = isWebView();
const app = document.getElementById(“app”);

let html = ‘<div class="login-wrap"><div class="login-card">’;
html += ‘<div class="login-logo">’ + IFD + ‘</div>’;
html += ‘<h1 class="login-title">Asistencia QR</h1>’;
html += ‘<p class="login-sub">Sistema de registro de asistencia</p>’;

if (webview) {
html += ‘<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 12px;margin-bottom:1rem;font-size:13px;color:#92400e;">Para usar Google abrí esta página en <strong>Safari</strong> o <strong>Chrome</strong>. O ingresá con email y contraseña.</div>’;
}

html += ‘<div style="display:flex;gap:0;margin-bottom:1.25rem;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">’;
html += ‘<button id="tab-google-btn" onclick="switchLoginTab(\'google\')" style="flex:1;padding:9px;border:none;background:' + (webview ? '#f3f4f6' : '#1A3A5C') + ';color:' + (webview ? '#374151' : '#fff') + ';font-size:13px;font-weight:500;cursor:pointer;">Google</button>’;
html += ‘<button id="tab-email-btn" onclick="switchLoginTab(\'email\')" style="flex:1;padding:9px;border:none;background:' + (webview ? '#1A3A5C' : '#f3f4f6') + ';color:' + (webview ? '#fff' : '#374151') + ';font-size:13px;font-weight:500;cursor:pointer;">Email y contraseña</button>’;
html += ‘</div>’;

html += ‘<div id="login-google" style="display:' + (webview ? 'none' : 'block') + ';">’;
html += ‘<button class="btn-google" onclick="loginGoogle()"><svg width="18" height="18" viewBox="0 0 18 18" style="margin-right:10px;vertical-align:middle"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>Ingresar con Google</button>’;
html += ‘</div>’;

html += ‘<div id="login-email" style="display:' + (webview ? 'block' : 'none') + ';">’;
html += ‘<div class="form-group"><label class="form-label">Email</label><input id="login-mail" type="email" class="inp" placeholder="tu@email.com" onkeydown="if(event.key===\'Enter\')loginEmail()"/></div>’;
html += ‘<div class="form-group"><label class="form-label">Contraseña</label><input id="login-pass" type="password" class="inp" placeholder="••••••••" onkeydown="if(event.key===\'Enter\')loginEmail()"/></div>’;
html += ‘<button class="btn-primary" style="width:100%;" onclick="loginEmail()">Ingresar</button>’;
html += ‘</div>’;

html += ‘<div id="login-msg" style="margin-top:12px;font-size:13px;min-height:20px;text-align:center;"></div>’;
html += ‘<p class="login-hint">Solo usuarios autorizados por la institución</p>’;
html += ‘</div></div>’;

app.innerHTML = html;
}

function switchLoginTab(tab) {
const isGoogle = tab === “google”;
document.getElementById(“login-google”).style.display = isGoogle ? “block” : “none”;
document.getElementById(“login-email”).style.display  = isGoogle ? “none”  : “block”;
document.getElementById(“tab-google-btn”).style.background = isGoogle ? “#1A3A5C” : “#f3f4f6”;
document.getElementById(“tab-google-btn”).style.color      = isGoogle ? “#fff”    : “#374151”;
document.getElementById(“tab-email-btn”).style.background  = isGoogle ? “#f3f4f6” : “#1A3A5C”;
document.getElementById(“tab-email-btn”).style.color       = isGoogle ? “#374151” : “#fff”;
document.getElementById(“login-msg”).textContent = “”;
}

async function loginGoogle() {
const provider = new firebase.auth.GoogleAuthProvider();
provider.setCustomParameters({ prompt: “select_account” });
try {
await auth.signInWithPopup(provider);
} catch(err) {
if (err.code === “auth/popup-blocked”) {
auth.signInWithRedirect(provider);
} else {
setLoginMsg(“Error: “ + err.message, “error”);
}
}
}

async function loginEmail() {
const email = document.getElementById(“login-mail”).value.trim().toLowerCase();
const pass  = document.getElementById(“login-pass”).value.trim();
if (!email || !pass) { setLoginMsg(“Completá email y contraseña.”, “error”); return; }

setLoginMsg(“Verificando…”, “info”);

// Admin con email/contraseña
if (email === ADMIN_MAIL) {
const snap = await db.ref(“config/adminPass”).once(“value”);
const adminPass = snap.val();
if (adminPass && adminPass === pass) {
currentRole = “admin”;
currentUser = { email };
renderAdminPanel();
return;
} else if (!adminPass) {
setLoginMsg(“El admin debe ingresar con Google la primera vez.”, “error”);
return;
} else {
setLoginMsg(“Contraseña incorrecta.”, “error”);
return;
}
}

// Preceptor
const snap = await db.ref(“preceptores”).orderByChild(“email”).equalTo(email).once(“value”);
const data = snap.val();

if (!data) { setLoginMsg(“Email no registrado. Contactá al administrador.”, “error”); return; }

const precId = Object.keys(data)[0];
const prec   = data[precId];

if (prec.passTemp !== pass) { setLoginMsg(“Contraseña incorrecta.”, “error”); return; }

sessionStorage.setItem(“precLogin”, JSON.stringify({ id: precId, …prec }));
currentRole = “preceptor”;
currentData = { id: precId, …prec };
renderPreceptorPanel();
setLoginMsg(””, “”);
}

function setLoginMsg(msg, tipo) {
const el = document.getElementById(“login-msg”);
if (!el) return;
const color = tipo === “success” ? “#15803d” : tipo === “error” ? “#dc2626” : “#2563eb”;
el.innerHTML = ‘<span style="color:' + color + ';">’ + msg + ‘</span>’;
}

function logout() {
sessionStorage.removeItem(“precLogin”);
currentUser = null; currentRole = null; currentData = null;
auth.signOut().then(() => renderLogin()).catch(() => renderLogin());
}

function renderNoAutorizado(user) {
document.getElementById(“app”).innerHTML =
‘<div class="login-wrap"><div class="login-card">’ +
‘<div class="login-logo">’ + IFD + ‘</div>’ +
‘<h1 class="login-title" style="font-size:18px;">Acceso no autorizado</h1>’ +
‘<p class="login-sub">Tu cuenta <strong>’ + user.email + ‘</strong> no está registrada.</p>’ +
‘<p class="login-sub" style="margin-top:8px;">Contactá al administrador para solicitar acceso.</p>’ +
‘<button class="btn-outline" style="margin-top:1.5rem;width:100%;" onclick="logout()">Cerrar sesión</button>’ +
‘</div></div>’;
}
