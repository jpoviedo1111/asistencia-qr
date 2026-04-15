// ══════════════════════════════════════════════════════════
//  AUTH — Login con Google + routing por rol
// ══════════════════════════════════════════════════════════

let currentUser  = null;
let currentRole  = null; // "admin" | "preceptor"
let currentData  = null; // datos del preceptor desde Firebase

const params  = new URLSearchParams(location.search);
const isScan  = params.get("scan") === "1";
const cursoQR = params.get("curso");
const precQR  = params.get("prec");

// ── Arranque ──────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  if (isScan && cursoQR && precQR) {
    renderVistaAlumno(cursoQR, precQR);
    return;
  }

  auth.onAuthStateChanged(async user => {
    if (!user) {
      renderLogin();
      return;
    }
    currentUser = user;
    await resolveRole(user);
  });
});

// ── Resolver rol del usuario ──────────────────────────────
async function resolveRole(user) {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="loading">Cargando...</div>`;

  // ¿Es admin?
  if (user.email === ADMIN_MAIL) {
    currentRole = "admin";
    // Guardar UID del admin si no está
    db.ref("config/adminUid").once("value", snap => {
      if (!snap.val()) db.ref("config/adminUid").set(user.uid);
    });
    renderAdminPanel();
    return;
  }

  // ¿Es preceptor registrado?
  const snap = await db.ref("preceptores").orderByChild("email").equalTo(user.email).once("value");
  const data = snap.val();

  if (data) {
    const precId = Object.keys(data)[0];
    currentRole = "preceptor";
    currentData = { id: precId, ...data[precId] };
    renderPreceptorPanel();
  } else {
    // No registrado
    renderNoAutorizado(user);
  }
}

// ── Login ─────────────────────────────────────────────────
function renderLogin() {
  document.getElementById("app").innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-logo">${IFD}</div>
        <h1 class="login-title">Asistencia QR</h1>
        <p class="login-sub">Sistema de registro de asistencia</p>
        <button class="btn-google" onclick="loginGoogle()">
          <svg width="18" height="18" viewBox="0 0 18 18" style="margin-right:10px;vertical-align:middle">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Ingresar con Google
        </button>
        <p class="login-hint">Solo usuarios autorizados por la institución</p>
      </div>
    </div>
  `;
}

function loginGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => {
    console.error(err);
    alert("Error al iniciar sesión. Intentá de nuevo.");
  });
}

function logout() {
  auth.signOut().then(() => { currentUser = null; currentRole = null; currentData = null; });
}

// ── No autorizado ─────────────────────────────────────────
function renderNoAutorizado(user) {
  document.getElementById("app").innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-logo">${IFD}</div>
        <h1 class="login-title" style="font-size:18px;">Acceso no autorizado</h1>
        <p class="login-sub">Tu cuenta <strong>${user.email}</strong> no está registrada en el sistema.</p>
        <p class="login-sub" style="margin-top:8px;">Contactá al administrador para solicitar acceso.</p>
        <button class="btn-outline" style="margin-top:1.5rem;width:100%;" onclick="logout()">Cerrar sesión</button>
      </div>
    </div>
  `;
}
