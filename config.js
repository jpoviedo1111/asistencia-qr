// ============================================================
//  Asistencia QR · IFD N°12 · 3°6° · Turno Tarde
// ============================================================

const CURSO = "3° 6°";
const TURNO = "Tarde";
const IFD   = "IFD N° 12";

const params = new URLSearchParams(location.search);
const isScan = params.get("scan") === "1";
const claseId = params.get("clase") || null;

// ── Arranque ──────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  if (isScan && claseId) {
    renderVistaAlumno(claseId);
  } else {
    renderPanel();
  }
});

// ══════════════════════════════════════════════════════════
//  VISTA ALUMNO  (página que ven al escanear el QR)
// ══════════════════════════════════════════════════════════
function renderVistaAlumno(claseId) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="phone-wrap">
      <div class="phone-header">
        <div class="logo-pill">${IFD}</div>
        <h1 class="phone-title">Marcar presencia</h1>
        <p class="phone-sub" id="clase-info">Cargando...</p>
      </div>

      <div id="scan-body" class="phone-body"></div>
    </div>
  `;

  const claseRef = db.ref("clases/" + claseId);
  claseRef.once("value", snap => {
    const clase = snap.val();
    if (!clase) {
      document.getElementById("scan-body").innerHTML =
        `<div class="alert-error">El código QR no es válido o ya expiró.</div>`;
      return;
    }

    document.getElementById("clase-info").textContent =
      `${clase.materia} · ${clase.fecha} · ${CURSO} · Turno ${TURNO}`;

    const alumnos = clase.alumnos ? Object.values(clase.alumnos) : [];
    renderFormAlumno(claseId, alumnos, clase.expira);
  });
}

function renderFormAlumno(claseId, alumnos, expira) {
  const ahora = Date.now();
  const body = document.getElementById("scan-body");

  if (expira && ahora > expira) {
    body.innerHTML = `<div class="alert-error">El tiempo para registrar presencia ya cerró.</div>`;
    return;
  }

  // Escucha presentes en tiempo real para deshabilitar ya registrados
  const presentesRef = db.ref("presentes/" + claseId);
  presentesRef.on("value", snap => {
    const presentes = snap.val() ? Object.values(snap.val()).map(p => p.nombre) : [];

    const opciones = alumnos
      .map(a => `<option value="${a}" ${presentes.includes(a) ? "disabled" : ""}>${a}${presentes.includes(a) ? " ✓" : ""}</option>`)
      .join("");

    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Seleccioná tu nombre</label>
        <select id="alumno-sel" class="form-select">
          <option value="">— Elegí tu nombre —</option>
          ${opciones}
        </select>
      </div>
      <button class="btn-big" id="btn-marcar" onclick="marcarPresente('${claseId}')" disabled>
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

function marcarPresente(claseId) {
  const sel = document.getElementById("alumno-sel");
  const nombre = sel.value;
  if (!nombre) return;

  const btn = document.getElementById("btn-marcar");
  btn.disabled = true;
  btn.textContent = "Registrando...";

  const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const key = nombre.replace(/\s+/g, "_").toLowerCase();

  db.ref(`presentes/${claseId}/${key}`).set({ nombre, hora, timestamp: Date.now() })
    .then(() => {
      document.getElementById("scan-msg").innerHTML =
        `<div class="alert-success">¡Presencia registrada! · ${hora}</div>`;
      btn.textContent = "Registrado";
    })
    .catch(() => {
      document.getElementById("scan-msg").innerHTML =
        `<div class="alert-error">Error al registrar. Intentá de nuevo.</div>`;
      btn.disabled = false;
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
        <button class="tab" onclick="showTab('tab-clase', this)">Nueva clase</button>
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

      <!-- TAB: Nueva clase -->
      <div id="tab-clase" class="tab-content">
        <div class="card">
          <h2 class="card-title">Configurar clase</h2>
          <div class="form-group">
            <label class="form-label">Materia</label>
            <input id="inp-materia" type="text" class="inp" placeholder="ej: Matemática" />
          </div>
          <div class="form-group">
            <label class="form-label">Fecha</label>
            <input id="inp-fecha" type="date" class="inp" />
          </div>
          <div class="form-group">
            <label class="form-label">Tiempo para marcar presente</label>
            <select id="inp-tiempo" class="form-select">
              <option value="0">Sin límite</option>
              <option value="10">10 minutos</option>
              <option value="15" selected>15 minutos</option>
              <option value="20">20 minutos</option>
              <option value="30">30 minutos</option>
            </select>
          </div>
          <button class="btn-primary" onclick="generarClase()">Generar QR</button>
        </div>

        <div id="qr-card" class="card" style="display:none;">
          <h2 class="card-title">Código QR listo</h2>
          <div class="qr-center">
            <div id="qr-box" style="background:white;padding:16px;border-radius:8px;border:1px solid #e5e7eb;display:inline-block;"></div>
          </div>
          <p class="qr-hint">Mostrá este QR en el proyector o imprimilo. Los alumnos lo escanean con la cámara del celular.</p>
          <div class="row-gap" style="justify-content:center;margin-top:12px">
            <button class="btn-outline" onclick="window.print()">Imprimir QR</button>
            <button class="btn-outline" onclick="showTab('tab-registro', document.querySelectorAll('.tab')[2])">Ver registro en vivo</button>
          </div>
        </div>
      </div>

      <!-- TAB: Registro -->
      <div id="tab-registro" class="tab-content">
        <div id="reg-select-clase" class="card">
          <h2 class="card-title">Seleccioná una clase</h2>
          <select id="sel-clase" class="form-select" onchange="cargarRegistro(this.value)">
            <option value="">— Elegí una clase —</option>
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
              <div class="row-gap">
                <button class="btn-outline sm" onclick="exportCSV()">Exportar CSV</button>
              </div>
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

  // Set today's date
  const hoy = new Date().toISOString().split("T")[0];
  document.getElementById("inp-fecha").value = hoy;

  loadAlumnosFromDB();
  loadClasesSelect();
}

// ── Tabs ──────────────────────────────────────────────────
function showTab(id, btn) {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  btn.classList.add("active");
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
  const inp = document.getElementById("inp-alumno");
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

// ── Clase / QR ────────────────────────────────────────────
let claseActualId = null;

function generarClase() {
  const materia = document.getElementById("inp-materia").value.trim();
  const fecha   = document.getElementById("inp-fecha").value;
  const minutos = parseInt(document.getElementById("inp-tiempo").value);

  if (!materia || !fecha) { alert("Completá materia y fecha"); return; }
  if (alumnos.length === 0) { alert("Primero cargá los alumnos en la pestaña Alumnos"); return; }

  const claseId = `${fecha}_${materia.replace(/\s+/g,"_").toLowerCase()}_${Date.now()}`;
  const expira  = minutos > 0 ? Date.now() + minutos * 60000 : null;

  const alumnosObj = {};
  alumnos.forEach((a, i) => alumnosObj[i] = a);

  db.ref("clases/" + claseId).set({ materia, fecha, expira, alumnos: alumnosObj })
    .then(() => {
      claseActualId = claseId;
      const url = `${location.origin}${location.pathname}?scan=1&clase=${claseId}`;
      document.getElementById("qr-card").style.display = "block";
      const box = document.getElementById("qr-box");
      box.innerHTML = "";
      new QRCode(box, { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
      loadClasesSelect();
    });
}

// ── Registro ──────────────────────────────────────────────
let regListener = null;

function loadClasesSelect() {
  db.ref("clases").once("value", snap => {
    const sel = document.getElementById("sel-clase");
    if (!sel) return;
    const clases = snap.val() || {};
    const keys = Object.keys(clases).sort().reverse();
    sel.innerHTML = `<option value="">— Elegí una clase —</option>` +
      keys.map(k => {
        const c = clases[k];
        return `<option value="${k}">${c.materia} · ${c.fecha}</option>`;
      }).join("");
  });
}

function cargarRegistro(claseId) {
  if (!claseId) { document.getElementById("reg-stats").style.display = "none"; return; }
  if (regListener) regListener.off();

  document.getElementById("reg-stats").style.display = "block";

  db.ref("clases/" + claseId).once("value", snap => {
    const clase = snap.val();
    const totalAlumnos = clase.alumnos ? Object.values(clase.alumnos) : [];

    regListener = db.ref("presentes/" + claseId);
    regListener.on("value", snap => {
      const pObj = snap.val() || {};
      const presentes = Object.values(pObj).sort((a,b) => a.timestamp - b.timestamp);
      const nombresPresentes = presentes.map(p => p.nombre);
      const ausentes = totalAlumnos.filter(a => !nombresPresentes.includes(a));

      document.getElementById("s-total").textContent = totalAlumnos.length;
      document.getElementById("s-presentes").textContent = presentes.length;
      document.getElementById("s-ausentes").textContent = ausentes.length;

      document.getElementById("lista-presentes").innerHTML = presentes.length === 0
        ? `<li class="empty-hint">Ningún alumno registrado aún</li>`
        : presentes.map(p =>
            `<li><span>${p.nombre}</span><span class="badge-hora">${p.hora}</span></li>`
          ).join("");

      document.getElementById("lista-ausentes").innerHTML = ausentes.length === 0
        ? `<li class="empty-hint">Todos presentes</li>`
        : ausentes.map(a => `<li><span>${a}</span></li>`).join("");

      // Guardar para export
      window._exportData = { clase, presentes, ausentes, totalAlumnos };
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
  link.href = url;
  link.download = `asistencia_${d.clase.materia}_${d.clase.fecha}.csv`;
  link.click();
}
