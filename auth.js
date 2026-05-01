
var currentUser = null;
var currentRole = null;
var currentData = null;

var params  = new URLSearchParams(location.search);
var isScan  = params.get("scan") === "1";
var cursoQR = params.get("curso");
var precQR  = params.get("prec");

function isWebView() {
  var ua = navigator.userAgent || "";
  return ua.indexOf("FBAN") > -1 || ua.indexOf("FBAV") > -1 ||
    ua.indexOf("Instagram") > -1 || ua.indexOf("WebView") > -1 ||
    (ua.indexOf("iPhone") > -1 && ua.indexOf("Safari") === -1) ||
    (ua.indexOf("iPad") > -1 && ua.indexOf("Safari") === -1);
}

window.addEventListener("DOMContentLoaded", function() {
  if (isScan && cursoQR && precQR) {
    renderVistaAlumno(cursoQR, precQR);
    return;
  }
  var saved = sessionStorage.getItem("precLogin");
  if (saved) {
    try {
      currentData = JSON.parse(saved);
      currentRole = "preceptor";
      renderPreceptorPanel();
      return;
    } catch(e) {
      sessionStorage.removeItem("precLogin");
    }
  }
  // Handle Drive OAuth redirect result
  auth.getRedirectResult().then(function(result) {
    if (result && result.credential && result.credential.accessToken) {
      gdriveToken = result.credential.accessToken;
      var accion = sessionStorage.getItem("driveAction");
      sessionStorage.removeItem("driveAction");
      if (accion === "backup") {
        setTimeout(function() {
          var btn  = document.querySelector("#tab-backup .btn-primary");
          var prog = document.getElementById("backup-progress");
          if (btn && prog) ejecutarBackup(btn, prog);
          else {
            // Panel not rendered yet, store flag
            sessionStorage.setItem("driveJustAuthed", "backup");
          }
        }, 1000);
      } else if (accion === "exportar") {
        setTimeout(function() {
          if (window._exportData) subirArchivoDrive(window._exportData);
          else setDriveMsg("Drive conectado. Selecciona una fecha y presiona Drive.", "success");
        }, 1000);
      }
    }
  }).catch(function(err) {
    console.warn("getRedirectResult:", err);
  });

  auth.onAuthStateChanged(function(user) {
    if (!user) { renderLogin(); return; }
    currentUser = user;
    resolveRole(user);
  });
});

function resolveRole(user) {
  document.getElementById("app").innerHTML = "<div class=\"loading\">Cargando...</div>";
  if (user.email === ADMIN_MAIL) {
    currentRole = "admin";
    db.ref("config/adminUid").once("value", function(snap) {
      if (!snap.val()) db.ref("config/adminUid").set(user.uid);
    });
    renderAdminPanel();
    return;
  }
  db.ref("preceptores").orderByChild("email").equalTo(user.email).once("value", function(snap) {
    var data = snap.val();
    if (data) {
      var precId = Object.keys(data)[0];
      currentRole = "preceptor";
      currentData = Object.assign({ id: precId }, data[precId]);
      renderPreceptorPanel();
    } else {
      renderNoAutorizado(user);
    }
  });
}

function renderLogin() {
  var webview = isWebView();
  var app = document.getElementById("app");
  var googleBg = webview ? "#f3f4f6" : "#1A3A5C";
  var googleColor = webview ? "#374151" : "#fff";
  var emailBg = webview ? "#1A3A5C" : "#f3f4f6";
  var emailColor = webview ? "#fff" : "#374151";
  var googleDisplay = webview ? "none" : "block";
  var emailDisplay = webview ? "block" : "none";

  var warning = webview
    ? "<div style=\"background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 12px;margin-bottom:1rem;font-size:13px;color:#92400e;\">Para usar Google abri la pagina en Safari o Chrome. O ingresa con email y contrasena.</div>"
    : "";

  app.innerHTML =
    "<div class=\"login-wrap\"><div class=\"login-card\">" +
    "<div class=\"login-logo\">" + IFD + "</div>" +
    "<h1 class=\"login-title\">Asistencia QR</h1>" +
    "<p class=\"login-sub\">Sistema de registro de asistencia</p>" +
    warning +
    "<div style=\"display:flex;gap:0;margin-bottom:1.25rem;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;\">" +
    "<button id=\"tab-google-btn\" onclick=\"switchLoginTab('google')\" style=\"flex:1;padding:9px;border:none;background:" + googleBg + ";color:" + googleColor + ";font-size:13px;font-weight:500;cursor:pointer;\">Google</button>" +
    "<button id=\"tab-email-btn\" onclick=\"switchLoginTab('email')\" style=\"flex:1;padding:9px;border:none;background:" + emailBg + ";color:" + emailColor + ";font-size:13px;font-weight:500;cursor:pointer;\">Email y contrasena</button>" +
    "</div>" +
    "<div id=\"login-google\" style=\"display:" + googleDisplay + ";\">" +
    "<button class=\"btn-google\" onclick=\"loginGoogle()\"><svg width=\"18\" height=\"18\" viewBox=\"0 0 18 18\" style=\"margin-right:10px;vertical-align:middle\"><path d=\"M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z\" fill=\"#4285F4\"/><path d=\"M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z\" fill=\"#34A853\"/><path d=\"M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z\" fill=\"#FBBC05\"/><path d=\"M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z\" fill=\"#EA4335\"/></svg>Ingresar con Google</button>" +
    "</div>" +
    "<div id=\"login-email\" style=\"display:" + emailDisplay + ";\">" +
    "<div class=\"form-group\"><label class=\"form-label\">Email</label><input id=\"login-mail\" type=\"email\" class=\"inp\" placeholder=\"tu@email.com\" onkeydown=\"if(event.key==='Enter')loginEmail()\"/></div>" +
    "<div class=\"form-group\"><label class=\"form-label\">Contrasena</label><input id=\"login-pass\" type=\"password\" class=\"inp\" placeholder=\"********\" onkeydown=\"if(event.key==='Enter')loginEmail()\"/></div>" +
    "<button class=\"btn-primary\" style=\"width:100%;\" onclick=\"loginEmail()\">Ingresar</button>" +
    "</div>" +
    "<div id=\"login-msg\" style=\"margin-top:12px;font-size:13px;min-height:20px;text-align:center;\"></div>" +
    "<p class=\"login-hint\">Solo usuarios autorizados por la institucion</p>" +
    "</div></div>";
}

function switchLoginTab(tab) {
  var isGoogle = tab === "google";
  document.getElementById("login-google").style.display = isGoogle ? "block" : "none";
  document.getElementById("login-email").style.display  = isGoogle ? "none"  : "block";
  document.getElementById("tab-google-btn").style.background = isGoogle ? "#1A3A5C" : "#f3f4f6";
  document.getElementById("tab-google-btn").style.color      = isGoogle ? "#fff"    : "#374151";
  document.getElementById("tab-email-btn").style.background  = isGoogle ? "#f3f4f6" : "#1A3A5C";
  document.getElementById("tab-email-btn").style.color       = isGoogle ? "#374151" : "#fff";
  document.getElementById("login-msg").textContent = "";
}

function loginGoogle() {
  var provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  auth.signInWithPopup(provider).catch(function(err) {
    if (err.code === "auth/popup-blocked") {
      auth.signInWithRedirect(provider);
    } else {
      setLoginMsg("Error: " + err.message, "error");
    }
  });
}

function loginEmail() {
  var email = document.getElementById("login-mail").value.trim().toLowerCase();
  var pass  = document.getElementById("login-pass").value.trim();
  if (!email || !pass) { setLoginMsg("Completa email y contrasena.", "error"); return; }
  setLoginMsg("Verificando...", "info");

  if (email === ADMIN_MAIL) {
    db.ref("config/adminPass").once("value", function(snap) {
      var adminPass = snap.val();
      if (adminPass && adminPass === pass) {
        currentRole = "admin";
        currentUser = { email: email };
        renderAdminPanel();
      } else if (!adminPass) {
        setLoginMsg("El admin debe ingresar con Google la primera vez.", "error");
      } else {
        setLoginMsg("Contrasena incorrecta.", "error");
      }
    });
    return;
  }

  db.ref("preceptores").orderByChild("email").equalTo(email).once("value", function(snap) {
    var data = snap.val();
    if (!data) { setLoginMsg("Email no registrado. Contacta al administrador.", "error"); return; }
    var precId = Object.keys(data)[0];
    var prec   = data[precId];
    if (prec.passTemp !== pass) { setLoginMsg("Contrasena incorrecta.", "error"); return; }
    sessionStorage.setItem("precLogin", JSON.stringify(Object.assign({ id: precId }, prec)));
    currentRole = "preceptor";
    currentData = Object.assign({ id: precId }, prec);
    renderPreceptorPanel();
    setLoginMsg("", "");
  });
}

function setLoginMsg(msg, tipo) {
  var el = document.getElementById("login-msg");
  if (!el) return;
  var color = tipo === "success" ? "#15803d" : tipo === "error" ? "#dc2626" : "#2563eb";
  el.innerHTML = "<span style=\"color:" + color + ";\">" + msg + "</span>";
}

function logout() {
  sessionStorage.removeItem("precLogin");
  currentUser = null; currentRole = null; currentData = null;
  auth.signOut().then(function() { renderLogin(); }).catch(function() { renderLogin(); });
}

function renderNoAutorizado(user) {
  document.getElementById("app").innerHTML =
    "<div class=\"login-wrap\"><div class=\"login-card\">" +
    "<div class=\"login-logo\">" + IFD + "</div>" +
    "<h1 class=\"login-title\" style=\"font-size:18px;\">Acceso no autorizado</h1>" +
    "<p class=\"login-sub\">Tu cuenta <strong>" + user.email + "</strong> no esta registrada.</p>" +
    "<p class=\"login-sub\" style=\"margin-top:8px;\">Contacta al administrador.</p>" +
    "<button class=\"btn-outline\" style=\"margin-top:1.5rem;width:100%;\" onclick=\"logout()\">Cerrar sesion</button>" +
    "</div></div>";
}
