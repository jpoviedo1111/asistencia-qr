// ============================================================
//  Asistencia QR · IFD N°12 · 3°6° · Turno Tarde
// ============================================================

const CURSO = "3° 6°";
const TURNO = "Tarde";
const IFD   = "IFD N° 12";

const params  = new URLSearchParams(location.search);
const isScan  = params.get("scan") === "1";

window.addEventListener("DOMContentLoaded", () => {
  if (isScan) {
    // Fecha automática del momento del escaneo
    const hoy = getFechaHoy();
    renderVistaAlumno(hoy);
  } else {
    renderPanel();
  }
});

// ── Helpers de fecha ─────────────────────────────────────
function getFechaHoy() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, "0");
  const d   = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatearFecha(fechaStr) {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const dias  = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const fecha = new Date(y, m - 1, d);
  return `${dias[fecha.getDay()]} ${d} de ${meses[m - 1]} ${y}`;
}

// ══════════════════════════════════════════════════════════
//  VISTA ALUMNO  (se abre al escanear el QR)
// ══════════════════════════════════════════════════════════
function renderVistaAlumno(fechaId) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="phone-wrap">
      <div class="phone-header">
        <div class="logo-pill">${IFD}</div>
        <h1 class="phone-title">Marcar presencia</h1>
        <p class="phone-sub">${formatearFecha(fechaId)}</p>
        <p class="phone-sub">${CURSO} · Turno ${TURNO}</p>
      </div>
      <div id="scan-body" class="phone-body">
        <p style="text-align:center;color:#6b7280;font-size:14px;">Cargando lista...</p>
      </div>
    </div>
  `;

  // Crear el registro del día si no existe, y cargar alumnos
  db.ref("alumnos").once("value", snap => {
    const alumnos = snap.val() ? Object.values(snap.val()) : [];

    if (alumnos.length === 0) {
      document.getElementById("scan-body").innerHTML =
        `<div class="alert-error">No hay alumnos cargados. Avisá al preceptor.</div>`;
      return;
    }

    // Crear el día automáticamente si no existe
    const alumnosObj = {};
    alumnos.forEach((a, i) => alumnosObj[i] = a);

    db.ref("fechas/" + fechaId).once("value", snapFecha => {
      if (!snapFecha.val()) {
        // Primera vez que se escanea hoy: crear el registro del día
        db.ref("fechas/" + fechaId).set({ fecha: fechaId, alumnos: alumnosObj });
      }
      renderFormAlumno(fechaId, alumnos);
    });
  });
}

function renderFormAlumno(fechaId, alumnos) {
  db.ref("presentes/" + fechaId).on("value", snap => {
    const presentes = snap.val() ? Object.values(snap.val()).map(p => p.nombre) : [];
    const opciones  = alumnos.map(a =>
      `<option value="${a}" ${presentes.includes(a) ? "disabled" : ""}>${a}${presentes.includes(a) ? " ✓" : ""}</option>`
    ).join("");

    document.getElementById("scan-body").innerHTML = `
      <div class="form-group">
        <label class="form-label">Seleccioná tu nombre</label>
        <select id="alumno-sel" class="form-select">
          <option value="">— Elegí tu nombre —</option>
          ${opciones}
        </select>
      </div>
      <button class="btn-big" id="btn-marcar" onclick="marcarPresente('${fechaId}')" disabled>
        Marcar presente
      </button>
      <div id="scan-msg"></div>
      <div class="presentes-count">
        ${presentes.length} de ${alumnos.length} alumnos registrados
      </div>
    `;
    document.getElementById("alumno-sel").addEventListener("change", e => {
      document.getElementById("btn-marcar").disabled = !e.target.value;
    });
  });
}

function marcarPresente(fechaId) {
  const sel    = document.getElementById("alumno-sel");
  const nombre = sel.value;
  if (!nombre) return;

  const btn = document.getElementById("btn-marcar");
  btn.disabled    = true;
  btn.textContent = "Registrando...";

  const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const key  = nombre.replace(/\s+/g, "_").toLowerCase();

  db.ref(`presentes/${fechaId}/${key}`).set({ nombre, hora, timestamp: Date.now() })
    .then(() => {
      document.getElementById("scan-msg").innerHTML =
        `<div class="alert-success">¡Presencia registrada! · ${hora}</div>`;
      btn.textContent = "Registrado";
    })
    .catch(() => {
      document.getElementById("scan-msg").innerHTML =
        `<div class="alert-error">Error al registrar. Intentá de nuevo.</div>`;
      btn.disabled    = false;
      btn.textContent = "Marcar presente";
    });
}

// ══════════════════════════════════════════════════════════
//  PANEL PRECEPTOR
// ══════════════════════════════════════════════════════════
function renderPanel() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="panel-wrap">
      <header class="panel-header">
        <div>
          <h1 class="panel-title">Asistencia QR</h1>
          <p class="panel-sub">${IFD} · ${CURSO} · Turno ${TURNO}</p>
        </div>
      </header>

      <div class="tabs">
        <button class="tab active" onclick="showTab('tab-alumnos', this)">Alumnos</button>
        <button class="tab" onclick="showTab('tab-qr', this)">Código QR</button>
        <button class="tab" onclick="showTab('tab-registro', this)">Registro</button>
      </div>

      <!-- TAB: Alumnos -->
      <div id="tab-alumnos" class="tab-content active">
        <div class="card">
          <h2 class="card-title">Lista de alumnos</h2>
          <div class="row-gap">
            <input id="inp-alumno" type="text" class="inp" placeholder="Apellido y nombre" onkeydown="if(event.key==='Enter')addAlumno()" />
            <button class="btn-primary" onclick="addAlumno()">Agregar</button>
          </div>
          <div id="alumno-tags" class="tag-list"></div>
          <div class="row-gap" style="margin-top:12px">
            <button class="btn-outline" onclick="cargarEjemplo()">Cargar alumnos del curso</button>
            <button class="btn-outline" onclick="limpiarAlumnos()">Limpiar</button>
          </div>
        </div>
      </div>

      <!-- TAB: QR permanente -->
      <div id="tab-qr" class="tab-content">
        <div class="card">
          <h2 class="card-title">Código QR del curso</h2>
          <p style="font-size:14px;color:#6b7280;margin-bottom:1rem;">
            Este QR es permanente. Imprimilo o guardalo una sola vez. 
            Cada vez que un alumno lo escanea, se registra automáticamente con la fecha del día.
          </p>
          <div class="qr-center">
            <div id="qr-box" style="background:white;padding:16px;border-radius:8px;border:1px solid #e5e7eb;display:inline-block;"></div>
          </div>
          <p class="qr-hint" style="margin-top:1rem;">${IFD} · ${CURSO} · Turno ${TURNO}</p>
          <div class="row-gap" style="justify-content:center;margin-top:1rem">
            <button class="btn-outline" onclick="window.print()">Imprimir QR</button>
          </div>
        </div>
      </div>

      <!-- TAB: Registro -->
      <div id="tab-registro" class="tab-content">
        <div class="card">
          <h2 class="card-title">Seleccioná una fecha</h2>
          <select id="sel-fecha" class="form-select" onchange="cargarRegistro(this.value)">
            <option value="">— Elegí una fecha —</option>
          </select>
        </div>
        <div id="reg-stats" style="display:none;">
          <div class="stats-grid">
            <div class="stat-card"><div class="stat-num" id="s-total">0</div><div class="stat-lbl">Total</div></div>
            <div class="stat-card green"><div class="stat-num" id="s-presentes">0</div><div class="stat-lbl">Presentes</div></div>
            <div class="stat-card red"><div class="stat-num" id="s-ausentes">0</div><div class="stat-lbl">Ausentes</div></div>
          </div>
          <div class="card">
            <div class="card-title-row">
              <h2 class="card-title" style="margin:0">Presentes</h2>
              <button class="btn-outline sm" onclick="exportCSV()">Exportar CSV</button>
            </div>
            <ul id="lista-presentes" class="present-list"></ul>
          </div>
          <div class="card">
            <h2 class="card-title">Ausentes</h2>
            <ul id="lista-ausentes" class="present-list red-list"></ul>
          </div>
        </div>
      </div>

    </div>
  `;

  loadAlumnosFromDB();
  generarQRPermanente();
  loadFechasSelect();
}

// ── QR permanente ─────────────────────────────────────────
function generarQRPermanente() {
  const url = `${location.origin}${location.pathname}?scan=1`;
  const box = document.getElementById("qr-box");
  if (!box) return;
  box.innerHTML = "";
  new QRCode(box, { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
}

// ── Tabs ──────────────────────────────────────────────────
function showTab(id, btn) {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  btn.classList.add("active");
  if (id === "tab-registro") loadFechasSelect();
  if (id === "tab-qr") generarQRPermanente();
}

// ── Alumnos ───────────────────────────────────────────────
let alumnos = [];

function loadAlumnosFromDB() {
  db.ref("alumnos").once("value", snap => {
    alumnos = snap.val() ? Object.values(snap.val()) : [];
    renderTags();
  });
}

function saveAlumnos() {
  const obj = {};
  alumnos.forEach((a, i) => obj[i] = a);
  db.ref("alumnos").set(obj);
}

function addAlumno() {
  const inp    = document.getElementById("inp-alumno");
  const nombre = inp.value.trim();
  if (!nombre || alumnos.includes(nombre)) { inp.value = ""; return; }
  alumnos.push(nombre);
  inp.value = "";
  renderTags();
  saveAlumnos();
}

function removeAlumno(idx) {
  alumnos.splice(idx, 1);
  renderTags();
  saveAlumnos();
}

function renderTags() {
  const el = document.getElementById("alumno-tags");
  if (!el) return;
  el.innerHTML = alumnos.length === 0
    ? `<span class="empty-hint">Sin alumnos cargados</span>`
    : alumnos.map((a, i) =>
        `<span class="tag">${a}<button onclick="removeAlumno(${i})">×</button></span>`
      ).join("");
}

function limpiarAlumnos() {
  alumnos = [];
  renderTags();
  db.ref("alumnos").remove();
}

function cargarEjemplo() {
  alumnos = [
    "Godoy Tobias","Gomez Figueroa Dario","Jara Lautaro","Jerez Priscila Lujan",
    "Suruguay Lucia","Torres Pallaleo Maria Sidena","Soto Sucre Emanuel I",
    "Rodriguez Ximena Alejandro","Almaraz Morena Valentina Almora","Quilipan Soledad Hayde",
    "Marin Jazmin Camila","Hidalgo Pasisi Alonso","Subelza Thiago Martin",
    "Monsalves Henriquez Joe Fidel","Leoncqui Jakaina","Medina Thiara","Cabezal Doito"
  ];
  renderTags();
  saveAlumnos();
}

// ── Registro ──────────────────────────────────────────────
let regListener = null;

function loadFechasSelect() {
  db.ref("fechas").once("value", snap => {
    const sel    = document.getElementById("sel-fecha");
    if (!sel) return;
    const fechas = snap.val() || {};
    const keys   = Object.keys(fechas).sort().reverse();
    sel.innerHTML = `<option value="">— Elegí una fecha —</option>` +
      keys.map(k => `<option value="${k}">${formatearFecha(k)}</option>`).join("");
  });
}

function cargarRegistro(fechaId) {
  if (!fechaId) { document.getElementById("reg-stats").style.display = "none"; return; }
  if (regListener) regListener.off();
  document.getElementById("reg-stats").style.display = "block";

  db.ref("fechas/" + fechaId).once("value", snap => {
    const datos        = snap.val();
    const totalAlumnos = datos.alumnos ? Object.values(datos.alumnos) : [];

    regListener = db.ref("presentes/" + fechaId);
    regListener.on("value", snap => {
      const pObj      = snap.val() || {};
      const presentes = Object.values(pObj).sort((a, b) => a.timestamp - b.timestamp);
      const nombresP  = presentes.map(p => p.nombre);
      const ausentes  = totalAlumnos.filter(a => !nombresP.includes(a));

      document.getElementById("s-total").textContent     = totalAlumnos.length;
      document.getElementById("s-presentes").textContent = presentes.length;
      document.getElementById("s-ausentes").textContent  = ausentes.length;

      document.getElementById("lista-presentes").innerHTML = presentes.length === 0
        ? `<li class="empty-hint">Ningún alumno registrado aún</li>`
        : presentes.map(p =>
            `<li><span>${p.nombre}</span><span class="badge-hora">${p.hora}</span></li>`
          ).join("");

      document.getElementById("lista-ausentes").innerHTML = ausentes.length === 0
        ? `<li class="empty-hint">Todos presentes</li>`
        : ausentes.map(a => `<li><span>${a}</span></li>`).join("");

      window._exportData = { fecha: fechaId, presentes, ausentes, totalAlumnos };
    });
  });
}

function exportCSV() {
  const d = window._exportData;
  if (!d) return;
  let csv = "Nombre,Estado,Hora\n";
  d.totalAlumnos.forEach(a => {
    const p = d.presentes.find(x => x.nombre === a);
    csv += `"${a}","${p ? "Presente" : "Ausente"}","${p ? p.hora : ""}"\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = `asistencia_${d.fecha}.csv`;
  link.click();
}
