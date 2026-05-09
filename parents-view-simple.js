// ══════════════════════════════════════════════════════════════
//  PARENTS VIEW — Ultra simple sin BD
//  Solo ver quién está online hoy con URL ?curso=
// ══════════════════════════════════════════════════════════════

var cursoActualPadre = null;
var parentListenerRef = null;

window.addEventListener("DOMContentLoaded", function() {
  const params = new URLSearchParams(location.search);
  const curso = params.get("curso");
  
  if (!curso) {
    renderParentError("No hay curso especificado en el link.");
    return;
  }

  cursoActualPadre = curso;
  renderParentOnlinePanel();
});

function renderParentOnlinePanel() {
  const app = document.getElementById("app");

  app.innerHTML =
    "<div class=\"panel-wrap\">" +
    "<div class=\"panel-header\" style=\"justify-content:space-between;\">" +
    "<div>" +
    "<h1 class=\"panel-title\">Presentes hoy</h1>" +
    "<p class=\"panel-sub\">" + cursoActualPadre + " · " + formatearFecha(getFechaHoy()) + "</p>" +
    "</div>" +
    "<button class=\"btn-outline\" onclick=\"location.reload()\">Actualizar</button>" +
    "</div>" +
    "<div id=\"parent-content\"></div>" +
    "</div>";

  loadParentOnlineView();
}

function loadParentOnlineView() {
  const container = document.getElementById("parent-content");
  const cid = cursoActualPadre.replace(/[°\s]/g, "_");
  const fechaHoy = getFechaHoy();

  container.innerHTML = "<div class=\"loading\">Cargando datos en tiempo real...</div>";

  // Escuchar en tiempo real SOLO hoy
  parentListenerRef = db.ref(`preceptores/_admin/datos/cursos/${cid}/presentes/${fechaHoy}`);
  
  parentListenerRef.on("value", function(snap) {
    const presentesHoy = snap.val() ? Object.values(snap.val()) : [];
    
    let html = "";
    
    // Card con contador
    html += "<div class=\"card\" style=\"margin-bottom:1.5rem;\">";
    
    // Contador
    html += "<div class=\"stats-grid\" style=\"margin-bottom:1rem;\">";
    html += "<div class=\"stat-card green\">";
    html += "<div class=\"stat-num\">" + presentesHoy.length + "</div>";
    html += "<div class=\"stat-lbl\">Presentes ahora</div>";
    html += "</div>";
    html += "</div>";

    // Lista de presentes
    if (presentesHoy.length === 0) {
      html += "<p class=\"empty-hint\" style=\"padding:1rem;text-align:center;color:#9ca3af;\">Sin presentes aún.</p>";
    } else {
      html += "<ul class=\"present-list\" style=\"border-top:1px solid #e5e7eb;padding-top:12px;\">";
      presentesHoy.forEach(function(alumno) {
        const hora = alumno.hora || "—";
        html += "<li style=\"display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #f3f4f6;\">";
        html += "<span style=\"display:flex;align-items:center;gap:8px;font-weight:500;\">";
        html += "<span style=\"width:8px;height:8px;border-radius:50%;background:#15803d;\"></span>";
        html += alumno.nombre;
        html += "</span>";
        html += "<span class=\"badge-hora\" style=\"background:#f0fdf4;color:#15803d;\">" + hora + "</span>";
        html += "</li>";
      });
      html += "</ul>";
    }

    html += "</div>";
    container.innerHTML = html;
  }, function(err) {
    container.innerHTML = "<div class=\"card\"><p style=\"color:#dc2626;padding:1rem;text-align:center;\">Error al cargar datos: " + err.message + "</p></div>";
  });
}

function renderParentError(msg) {
  document.getElementById("app").innerHTML =
    "<div class=\"login-wrap\"><div class=\"login-card\">" +
    "<div class=\"login-logo\">" + IFD + "</div>" +
    "<h1 class=\"login-title\">Link inválido</h1>" +
    "<p class=\"login-sub\" style=\"color:#dc2626;\">" + msg + "</p>" +
    "<p class=\"login-sub\" style=\"margin-top:1rem;font-size:13px;color:#6b7280;\">El link debe incluir el curso, por ejemplo:</p>" +
    "<p style=\"font-family:monospace;font-size:12px;background:#f3f4f6;padding:8px;border-radius:6px;margin:1rem 0;\">domain.com/?curso=3°+6°</p>" +
    "</div></div>";
}

// Limpiar listener al salir
window.addEventListener("beforeunload", function() {
  if (parentListenerRef) {
    parentListenerRef.off();
  }
});
