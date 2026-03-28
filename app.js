// ============================================================
//  Asistencia QR · IFD N°12 · 3°6° · Turno Tarde
// ============================================================

const CURSO = "3° 6°";
const TURNO = "Tarde";
const IFD   = "IFD N° 12";

const params  = new URLSearchParams(location.search);
const isScan  = params.get("scan") === "1";

// ── Google Drive config (se completa en config.js) ────────
// GDRIVE_CLIENT_ID se define en config.js
const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
let gdriveToken = null;

window.addEventListener("DOMContentLoaded", () => {
  if (isScan) {
    const hoy = getFechaHoy();
    renderVistaAlumno(hoy);
  } else {
    renderPanel();
  }
});

// ── Helpers de fecha ──────────────────────────────────────
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

function getNombreMes(fechaStr) {
  const [, m] = fechaStr.split("-").map(Number);
  return ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][m - 1];
}

// ── Restricción por dispositivo ───────────────────────────
function yaMarcoHoy(fechaId) {
  return localStorage.getItem("asistencia_" + fechaId) !== null;
}
function guardarMarcaDispositivo(fechaId, nombre) {
  localStorage.setItem("asistencia_" + fechaId, nombre);
}
function getNombreGuardado(fechaId) {
  return localStorage.getItem("asistencia_" + fechaId);
}

// ══════════════════════════════════════════════════════════
//  VISTA ALUMNO
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
        <p style="text-align:center;color:#6b7280;font-size:14px;">Cargando...</p>
      </div>
    </div>
  `;

  if (yaMarcoHoy(fechaId)) {
    const nombre = getNombreGuardado(fechaId);
    document.getElementById("scan-body").innerHTML = `
      <div class="alert-success" style="text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">✓</div>
        <div style="font-size:16px;font-weight:600;">¡Ya registraste tu presencia hoy!</div>
        <div style="margin-top:8px;font-size:14px;opacity:0.8;">${nombre}</div>
        <div style="margin-top:4px;font-size:13px;opacity:0.7;">${formatearFecha(fechaId)}</div>
      </div>
      <p style="text-align:center;font-size:13px;color:#9ca3af;margin-top:1rem;">
        Solo se puede registrar una vez por día desde este dispositivo.
      </p>
    `;
    return;
  }

  db.ref("alumnos").once("value", snap => {
    const alumnos = snap.val() ? Object.values(snap.val()) : [];
    if (alumnos.length === 0) {
      document.getElementById("scan-body").innerHTML =
        `<div class="alert-error">No hay alumnos cargados. Avisá al preceptor.</div>`;
      return;
    }
    const alumnosObj = {};
    alumnos.forEach((a, i) => alumnosObj[i] = a);
    db.ref("fechas/" + fechaId).once("value", snapFecha => {
      if (!snapFecha.val()) {
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
      <div class="presentes-count">${presentes.length} de ${alumnos.length} alumnos registrados</div>
    `;
    document.getElementById("alumno-sel").addEventListener("change", e => {
      document.getElementById("btn-marcar").disabled = !e.target.value;
    });
  });
}

function marcarPresente(fechaId) {
  const sel    = document.getElementById("alumno-sel");
  const nombre = sel.value;
  if (!nombre || yaMarcoHoy(fechaId)) return;

  const btn = document.getElementById("btn-marcar");
  btn.disabled    = true;
  btn.textContent = "Registrando...";

  const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const key  = nombre.replace(/\s+/g, "_").toLowerCase();

  db.ref(`presentes/${fechaId}/${key}`).set({ nombre, hora, timestamp: Date.now() })
    .then(() => {
      guardarMarcaDispositivo(fechaId, nombre);
      document.getElementById("scan-body").innerHTML = `
        <div class="alert-success" style="text-align:center;">
          <div style="font-size:40px;margin-bottom:8px;">✓</div>
          <div style="font-size:17px;font-weight:600;">¡Presencia registrada!</div>
          <div style="margin-top:10px;font-size:15px;">${nombre}</div>
          <div style="margin-top:4px;font-size:13px;opacity:0.8;">${formatearFecha(fechaId)} · ${hora}</div>
        </div>
        <p style="text-align:center;font-size:13px;color:#9ca3af;margin-top:1rem;">Ya podés cerrar esta página.</p>
      `;
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

      <!-- TAB: QR -->
      <div id="tab-qr" class="tab-content">
        <div class="card">
          <h2 class="card-title">Código QR del curso</h2>
          <p style="font-size:14px;color:#6b7280;margin-bottom:1rem;">
            QR permanente. Imprimilo y colgalo en el aula. Cada alumno solo puede registrarse <strong>una vez por día</strong>.
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
              <div class="row-gap" style="margin:0">
                <button class="btn-outline sm" onclick="exportCSV()">Exportar CSV</button>
                <button class="btn-outline sm" id="btn-planilla" onclick="exportarPlanillaCompleta()">Planilla Excel</button>
                <button class="btn-drive sm" id="btn-drive" onclick="exportarADrive()">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right:5px;vertical-align:middle"><path d="M4.5 20.5L9 12.5L2 8L4.5 20.5Z" fill="#4285F4"/><path d="M19.5 20.5L15 12.5L22 8L19.5 20.5Z" fill="#FBBC05"/><path d="M12 3L9 12.5H15L12 3Z" fill="#34A853"/><path d="M4.5 20.5H19.5L15 12.5H9L4.5 20.5Z" fill="#EA4335"/></svg>
                  Subir a Drive
                </button>
              </div>
            </div>
            <div id="drive-msg" style="margin-bottom:8px;"></div>
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

function generarQRPermanente() {
  const url = `${location.origin}${location.pathname}?scan=1`;
  const box = document.getElementById("qr-box");
  if (!box) return;
  box.innerHTML = "";
  new QRCode(box, { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
}

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

function limpiarAlumnos() { alumnos = []; renderTags(); db.ref("alumnos").remove(); }

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
let regListener  = null;
let fechaActual  = null;

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
  fechaActual = fechaId;
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

// ── Exportar CSV ──────────────────────────────────────────
function exportCSV() {
  const d = window._exportData;
  if (!d) return;
  const csv = buildCSV(d);
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = `asistencia_${d.fecha}.csv`;
  link.click();
}

function buildCSV(d) {
  let csv = `IFD N°12 · ${CURSO} · Turno ${TURNO}\n`;
  csv    += `Fecha: ${formatearFecha(d.fecha)}\n\n`;
  csv    += `Nombre,Estado,Hora\n`;
  d.totalAlumnos.forEach(a => {
    const p = d.presentes.find(x => x.nombre === a);
    csv    += `"${a}","${p ? "Presente" : "Ausente"}","${p ? p.hora : ""}"\n`;
  });
  csv += `\nPresentes: ${d.presentes.length} / ${d.totalAlumnos.length}\n`;
  return csv;
}

// ══════════════════════════════════════════════════════════
//  GOOGLE DRIVE
// ══════════════════════════════════════════════════════════
function exportarADrive() {
  const d = window._exportData;
  if (!d) { alert("Primero seleccioná una fecha con datos"); return; }

  setDriveMsg("Conectando con Google Drive...", "info");

  if (gdriveToken) {
    subirArchivoDrive(d);
  } else {
    autenticarDrive(() => subirArchivoDrive(d));
  }
}

function autenticarDrive(callback) {
  if (!window.GDRIVE_CLIENT_ID || window.GDRIVE_CLIENT_ID === "TU_CLIENT_ID") {
    setDriveMsg("⚠️ Falta configurar el Client ID de Google. Seguí las instrucciones.", "error");
    return;
  }

  const client = google.accounts.oauth2.initTokenClient({
    client_id: window.GDRIVE_CLIENT_ID,
    scope: GDRIVE_SCOPE,
    callback: (resp) => {
      if (resp.error) {
        setDriveMsg("Error al conectar con Google Drive.", "error");
        return;
      }
      gdriveToken = resp.access_token;
      callback();
    }
  });
  client.requestAccessToken();
}

async function subirArchivoDrive(d) {
  const csv      = buildCSV(d);
  const nombre   = `Asistencia_${IFD.replace(/\s/g,"")}_${CURSO.replace(/\s/g,"")}_${d.fecha}.csv`;
  const mes      = getNombreMes(d.fecha);
  const carpeta  = `Asistencia ${mes} ${d.fecha.split("-")[0]}`;

  setDriveMsg("Subiendo a Google Drive...", "info");

  try {
    // Buscar o crear carpeta
    const folderId = await obtenerOCrearCarpeta(carpeta);

    // Buscar si ya existe el archivo para actualizarlo
    const existente = await buscarArchivo(nombre, folderId);

    if (existente) {
      await actualizarArchivo(existente, csv);
    } else {
      await crearArchivo(nombre, csv, folderId);
    }

    setDriveMsg(`✓ Subido a Drive · carpeta "${carpeta}"`, "success");
  } catch (e) {
    setDriveMsg("Error al subir. Intentá de nuevo.", "error");
    console.error(e);
  }
}

async function obtenerOCrearCarpeta(nombre) {
  const busq = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${nombre}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
    { headers: { Authorization: "Bearer " + gdriveToken } }
  );
  const data = await busq.json();
  if (data.files && data.files.length > 0) return data.files[0].id;

  const crear = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: "Bearer " + gdriveToken, "Content-Type": "application/json" },
    body: JSON.stringify({ name: nombre, mimeType: "application/vnd.google-apps.folder" })
  });
  const carpeta = await crear.json();
  return carpeta.id;
}

async function buscarArchivo(nombre, folderId) {
  const busq = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${nombre}' and '${folderId}' in parents and trashed=false&fields=files(id)`,
    { headers: { Authorization: "Bearer " + gdriveToken } }
  );
  const data = await busq.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function crearArchivo(nombre, contenido, folderId) {
  const meta = JSON.stringify({ name: nombre, parents: [folderId] });
  const body = new FormData();
  body.append("metadata", new Blob([meta], { type: "application/json" }));
  body.append("file",     new Blob([contenido], { type: "text/csv" }));

  await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { Authorization: "Bearer " + gdriveToken },
    body
  });
}

async function actualizarArchivo(fileId, contenido) {
  await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + gdriveToken, "Content-Type": "text/csv" },
    body: contenido
  });
}

function setDriveMsg(msg, tipo) {
  const el = document.getElementById("drive-msg");
  if (!el) return;
  const color = tipo === "success" ? "#15803d" : tipo === "error" ? "#dc2626" : "#2563eb";
  el.innerHTML = `<span style="font-size:13px;color:${color};">${msg}</span>`;
}

// ══════════════════════════════════════════════════════════
//  EXPORTAR PLANILLA EXCEL COMPLETA (SheetJS)
// ══════════════════════════════════════════════════════════
async function exportarPlanillaCompleta() {
  const btn = document.getElementById("btn-planilla");
  if (btn) { btn.disabled = true; btn.textContent = "Generando..."; }

  try {
    // Cargar todos los datos de Firebase
    const [fechasSnap, presentesSnap, alumnosSnap] = await Promise.all([
      db.ref("fechas").once("value"),
      db.ref("presentes").once("value"),
      db.ref("alumnos").once("value")
    ]);

    const fechas    = fechasSnap.val()    || {};
    const presentes = presentesSnap.val() || {};
    const alumnosObj= alumnosSnap.val()   || {};
    const alumnos   = Object.values(alumnosObj);

    const XLSX = window.XLSX;
    const wb   = XLSX.utils.book_new();

    const meses = [
      [1,"Enero"],[2,"Febrero"],[3,"Marzo"],[4,"Abril"],
      [5,"Mayo"],[6,"Junio"],[7,"Julio"],[8,"Agosto"],
      [9,"Septiembre"],[10,"Octubre"],[11,"Noviembre"],[12,"Diciembre"]
    ];

    for (const [mNum, mNombre] of meses) {
      const diasEnMes = new Date(2026, mNum, 0).getDate();
      
      // Headers
      const header1 = [`IFD N° 12 - MEDIA  |  REGISTRO DE ASISTENCIA 2026  |  ${mNombre.toUpperCase()}`];
      const header2 = ["CURSO:", "", "3° 6°", "", "TURNO:", "", "TARDE", "", "PRECEPTOR:", "", "cristina"];
      const header3 = ["N°", "APELLIDO Y NOMBRE"];
      const header4 = ["", ""];
      for (let d = 1; d <= diasEnMes; d++) {
        const wd = new Date(2026, mNum-1, d).getDay();
        header3.push(d);
        header4.push(["Do","Lu","Ma","Mi","Ju","Vi","Sa"][wd]);
      }
      header3.push("P","A","T");
      header4.push("","","");

      const rows = [header1, header2, header3, header4];

      // Filas de alumnos
      for (let i = 0; i < alumnos.length; i++) {
        const nombre = alumnos[i];
        const row    = [i+1, nombre];
        let totalP   = 0, totalA = 0;

        for (let d = 1; d <= diasEnMes; d++) {
          const wd      = new Date(2026, mNum-1, d).getDay();
          if (wd === 0 || wd === 6) { row.push("-"); continue; }

          const fechaId = `2026-${String(mNum).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          const presDay = presentes[fechaId] ? Object.values(presentes[fechaId]) : [];
          const nombresP= presDay.map(p => p.nombre.trim().toLowerCase());
          const normNombre = nombre.trim().toLowerCase();
          const estaPresente = nombresP.some(p =>
            p === normNombre || p.includes(normNombre.split(" ")[0]) || normNombre.includes(p.split(" ")[0])
          );

          // Solo marcar si hay datos de ese día en Firebase
          if (fechas[fechaId]) {
            row.push(estaPresente ? "P" : "A");
            if (estaPresente) totalP++; else totalA++;
          } else {
            row.push("");
          }
        }
        row.push(totalP, totalA, totalP + totalA);
        rows.push(row);
      }

      // Filas vacías extra
      for (let i = alumnos.length; i < 24; i++) {
        const row = [i+1, ""];
        for (let d = 0; d < diasEnMes + 3; d++) row.push("");
        rows.push(row);
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 5 }, { wch: 30 }, ...Array(diasEnMes).fill({ wch: 4 }), { wch: 5 }, { wch: 5 }, { wch: 5 }];
      XLSX.utils.book_append_sheet(wb, ws, mNombre);
    }

    XLSX.writeFile(wb, `Asistencia_IFD12_3ro6ta_2026.xlsx`);
  } catch(e) {
    console.error(e);
    alert("Error al generar la planilla: " + e.message);
  }

  if (btn) { btn.disabled = false; btn.textContent = "Descargar planilla Excel"; }
}
