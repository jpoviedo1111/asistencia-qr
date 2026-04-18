// ══════════════════════════════════════════════════════════
//  APP — Panel Admin + Panel Preceptor + Vista Alumno
// ══════════════════════════════════════════════════════════

const dayNames  = ["Lu","Ma","Mi","Ju","Vi","Sa","Do"];
const mesesNom  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                   "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const YEAR      = 2026;

// ── Helpers ───────────────────────────────────────────────
function getFechaHoy() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

function formatearFecha(f) {
  const [y,m,d] = f.split("-").map(Number);
  const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  return `${dias[new Date(y,m-1,d).getDay()]} ${d} de ${mesesNom[m-1]} ${y}`;
}

function dbPath(precId, ...parts) {
  return ["preceptores", precId, "datos", ...parts].join("/");
}

// ══════════════════════════════════════════════════════════
//  PANEL ADMIN
// ══════════════════════════════════════════════════════════
function renderAdminPanel() {
  const u = currentUser;
  document.getElementById("app").innerHTML = `
    <div class="panel-wrap">
      <header class="panel-header">
        <div>
          <h1 class="panel-title">Panel Administrador</h1>
          <p class="panel-sub">${IFD} · ${u.displayName} · ${u.email}</p>
        </div>
        <button class="btn-outline sm" onclick="logout()">Cerrar sesión</button>
      </header>

      <div class="tabs">
        <button class="tab active" onclick="showTab('tab-prec', this)">Preceptores</button>
        <button class="tab" onclick="showTab('tab-add', this)">Agregar preceptor</button>
      </div>

      <div id="tab-prec" class="tab-content active">
        <div class="card">
          <h2 class="card-title">Preceptores registrados</h2>
          <div id="lista-prec"><p class="empty-hint">Cargando...</p></div>
        </div>
      </div>

      <div id="tab-add" class="tab-content">
        <div class="card">
          <h2 class="card-title">Agregar nuevo preceptor</h2>
          <div class="form-group">
            <label class="form-label">Nombre completo</label>
            <input id="add-nombre" type="text" class="inp" placeholder="Ej: María González"/>
          </div>
          <div class="form-group">
            <label class="form-label">Email (cualquier mail)</label>
            <input id="add-email" type="email" class="inp" placeholder="preceptor@hotmail.com"/>
          </div>
          <div class="form-group">
            <label class="form-label">Contraseña temporal</label>
            <input id="add-pass" type="text" class="inp" placeholder="Mínimo 6 caracteres"/>
            <p style="font-size:12px;color:#6b7280;margin-top:4px;">El preceptor usará esta contraseña para ingresar.</p>
          </div>
          <div class="form-group">
            <label class="form-label">Cursos (uno por línea, ej: 3° 6°)</label>
            <textarea id="add-cursos" class="inp" rows="3" placeholder="3° 6°&#10;1° 6°" style="resize:vertical;"></textarea>
          </div>
          <button class="btn-primary" onclick="agregarPreceptor()">Agregar preceptor</button>
          <div id="add-msg" style="margin-top:10px;font-size:13px;"></div>
        </div>
      </div>
    </div>
  `;
  cargarListaPreceptores();
}

function cargarListaPreceptores() {
  db.ref("preceptores").once("value", snap => {
    const el   = document.getElementById("lista-prec");
    const data = snap.val();
    if (!data) { el.innerHTML = `<p class="empty-hint">No hay preceptores registrados.</p>`; return; }

    el.innerHTML = Object.entries(data).map(([id, p]) => `
      <div class="prec-row">
        <div>
          <div style="font-weight:500;font-size:14px;">${p.nombre}</div>
          <div style="font-size:12px;color:var(--color-text-secondary);">${p.email}</div>
          <div style="font-size:12px;color:var(--color-text-secondary);margin-top:2px;">
            Cursos: ${p.cursos ? p.cursos.join(", ") : "—"}
          </div>
        </div>
        <div class="row-gap" style="margin:0;">
          <button class="btn-outline sm" onclick="verPanelPreceptor('${id}')">Ver panel</button>
          <button class="btn-danger sm" onclick="eliminarPreceptor('${id}', '${p.nombre}')">Eliminar</button>
        </div>
      </div>
    `).join("");
  });
}

function agregarPreceptor() {
  const nombre = document.getElementById("add-nombre").value.trim();
  const email  = document.getElementById("add-email").value.trim().toLowerCase();
  const pass   = document.getElementById("add-pass").value.trim();
  const cursos = document.getElementById("add-cursos").value
    .split("\n").map(s => s.trim()).filter(Boolean);
  const msg    = document.getElementById("add-msg");

  if (!nombre || !email || !pass || cursos.length === 0) {
    msg.innerHTML = `<span style="color:#dc2626;">Completá todos los campos.</span>`; return;
  }
  if (pass.length < 6) {
    msg.innerHTML = `<span style="color:#dc2626;">La contraseña debe tener al menos 6 caracteres.</span>`; return;
  }

  const id = email.replace(/[@.]/g, "_");
  // Guardar en DB con contraseña hasheada simple (el preceptor la usa para login)
  db.ref(`preceptores/${id}`).set({
    nombre, email, cursos,
    passTemp: pass,
    creadoEn: Date.now()
  }).then(() => {
    msg.innerHTML = `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-top:8px;">
        <div style="font-weight:600;color:#15803d;margin-bottom:6px;">✓ Preceptor agregado</div>
        <div style="font-size:13px;color:#374151;">
          <b>Email:</b> ${email}<br>
          <b>Contraseña temporal:</b> ${pass}<br>
          <span style="color:#6b7280;">Compartí estos datos con el preceptor para que pueda ingresar.</span>
        </div>
      </div>`;
    document.getElementById("add-nombre").value = "";
    document.getElementById("add-email").value  = "";
    document.getElementById("add-pass").value   = "";
    document.getElementById("add-cursos").value = "";
    cargarListaPreceptores();
  });
}

function eliminarPreceptor(id, nombre) {
  if (!confirm(`¿Eliminar a ${nombre}? Se borrarán todos sus datos.`)) return;
  db.ref(`preceptores/${id}`).remove().then(() => cargarListaPreceptores());
}

function verPanelPreceptor(precId) {
  db.ref(`preceptores/${precId}`).once("value", snap => {
    currentData = { id: precId, ...snap.val() };
    currentRole = "preceptor";
    renderPreceptorPanel(true);
  });
}

// ══════════════════════════════════════════════════════════
//  PANEL PRECEPTOR
// ══════════════════════════════════════════════════════════
let cursoActivo  = null;
let regListener  = null;
let fechaActual  = null;

function renderPreceptorPanel(fromAdmin = false) {
  const p      = currentData;
  const cursos = p.cursos || [];
  if (!cursoActivo || !cursos.includes(cursoActivo)) cursoActivo = cursos[0] || null;

  const cursoId = cursoActivo ? cursoActivo.replace(/[°\s]/g, "_") : "";

  document.getElementById("app").innerHTML = `
    <div class="panel-wrap">
      <header class="panel-header">
        <div>
          <h1 class="panel-title">Asistencia QR</h1>
          <p class="panel-sub">${IFD} · ${p.nombre}</p>
        </div>
        <div class="row-gap" style="margin:0;gap:6px;">
          ${cursos.length > 1 ? `
            <select id="curso-sel" class="form-select" style="width:auto;" onchange="cambiarCurso(this.value)">
              ${cursos.map(c => `<option value="${c}" ${c===cursoActivo?"selected":""}>${c}</option>`).join("")}
            </select>` : `<span style="font-weight:500;font-size:14px;">${cursoActivo}</span>`}
          ${fromAdmin
            ? `<button class="btn-outline sm" onclick="renderAdminPanel()">← Admin</button>`
            : `<button class="btn-outline sm" onclick="logout()">Cerrar sesión</button>`}
        </div>
      </header>

      <div class="tabs">
        <button class="tab active" onclick="showTab('tab-alumnos', this)">Alumnos</button>
        <button class="tab" onclick="showTab('tab-qr', this)">Código QR</button>
        <button class="tab" onclick="showTab('tab-registro', this)">Registro</button>
      </div>

      <!-- Alumnos -->
      <div id="tab-alumnos" class="tab-content active">
        <div class="card">
          <h2 class="card-title">Lista de alumnos — ${cursoActivo}</h2>
          <div class="row-gap">
            <input id="inp-alumno" type="text" class="inp" placeholder="Apellido y nombre"
              onkeydown="if(event.key==='Enter')addAlumno()"/>
            <button class="btn-primary" onclick="addAlumno()">Agregar</button>
          </div>
          <div id="alumno-tags" class="tag-list"></div>
          <div class="row-gap" style="margin-top:12px;">
            <button class="btn-outline" onclick="limpiarAlumnos()">Limpiar lista</button>
          </div>
        </div>
      </div>

      <!-- QR -->
      <div id="tab-qr" class="tab-content">
        <div class="card">
          <h2 class="card-title">Código QR — ${cursoActivo}</h2>
          <p style="font-size:14px;color:#6b7280;margin-bottom:1rem;">
            QR permanente. Cada alumno solo puede registrarse <strong>una vez por día</strong>.
            La fecha se detecta automáticamente al escanear.
          </p>
          <div class="qr-center">
            <div id="qr-box" style="background:white;padding:16px;border-radius:8px;border:1px solid #e5e7eb;display:inline-block;"></div>
          </div>
          <p class="qr-hint" style="margin-top:1rem;">${IFD} · ${cursoActivo} · Turno ${TURNO}</p>
          <div class="row-gap" style="justify-content:center;margin-top:1rem;">
            <button class="btn-outline" onclick="window.print()">Imprimir QR</button>
          </div>
        </div>
      </div>

      <!-- Registro -->
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
              <h2 class="card-title" style="margin:0;">Presentes</h2>
              <div class="row-gap" style="margin:0;">
                <button class="btn-outline sm" id="btn-planilla" onclick="exportarPlanillaCompleta()">Planilla Excel</button>
                <button class="btn-drive sm" id="btn-drive" onclick="exportarADrive()">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right:5px;vertical-align:middle">
                    <path d="M4.5 20.5L9 12.5L2 8L4.5 20.5Z" fill="#4285F4"/>
                    <path d="M19.5 20.5L15 12.5L22 8L19.5 20.5Z" fill="#FBBC05"/>
                    <path d="M12 3L9 12.5H15L12 3Z" fill="#34A853"/>
                    <path d="M4.5 20.5H19.5L15 12.5H9L4.5 20.5Z" fill="#EA4335"/>
                  </svg>
                  Drive
                </button>
              </div>
            </div>
            <div id="drive-msg" style="margin-bottom:8px;"></div>
            <ul id="lista-presentes" class="present-list"></ul>
          </div>
          <div class="card">
            <h2 class="card-title">Ausentes</h2>
            <ul id="lista-ausentes" class="present-list red-list"></ul>
            <div id="marcar-manual-box" style="margin-top:1rem;display:none;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="font-size:13px;font-weight:500;color:#374151;">Selecciona alumnos a marcar presente:</span>
                <button id="btn-sel-todos" class="btn-outline sm" onclick="seleccionarTodos()">Seleccionar todos</button>
              </div>
              <div id="lista-manual-check" style="max-height:250px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;padding:0 12px;margin-bottom:10px;"></div>
              <div class="row-gap" style="margin:0;">
                <button class="btn-primary" style="flex:1;" onclick="marcarManual()">Marcar presentes</button>
                <button class="btn-outline" onclick="toggleManual(false)">Cancelar</button>
              </div>
              <div id="manual-msg" style="margin-top:8px;font-size:13px;"></div>
            </div>
            <button class="btn-outline" id="btn-manual" style="margin-top:1rem;width:100%;" onclick="toggleManual(true)">
              + Marcar presente manualmente
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  loadAlumnos();
  generarQR();
  loadFechas();
}

function cambiarCurso(curso) {
  cursoActivo = curso;
  renderPreceptorPanel(currentRole === "admin" && currentData?.id !== currentUser?.uid);
}

function showTab(id, btn) {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  btn.classList.add("active");
  if (id === "tab-registro") loadFechas();
  if (id === "tab-qr") generarQR();
}

// ── Alumnos ───────────────────────────────────────────────
let alumnosLista = [];

function getCursoPath(...parts) {
  const cid = cursoActivo.replace(/[°\s]/g,"_");
  return [dbPath(currentData.id, "cursos", cid), ...parts].join("/");
}

function loadAlumnos() {
  db.ref(getCursoPath("alumnos")).once("value", snap => {
    alumnosLista = snap.val() ? Object.values(snap.val()) : [];
    renderTags();
  });
}

function saveAlumnos() {
  const obj = {};
  alumnosLista.forEach((a,i) => obj[i] = a);
  db.ref(getCursoPath("alumnos")).set(obj);
}

function addAlumno() {
  const inp    = document.getElementById("inp-alumno");
  const nombre = inp.value.trim();
  if (!nombre || alumnosLista.includes(nombre)) { inp.value=""; return; }
  alumnosLista.push(nombre);
  inp.value = "";
  renderTags();
  saveAlumnos();
}

function removeAlumno(idx) {
  alumnosLista.splice(idx, 1);
  renderTags();
  saveAlumnos();
}

function renderTags() {
  const el = document.getElementById("alumno-tags");
  if (!el) return;
  el.innerHTML = alumnosLista.length === 0
    ? `<span class="empty-hint">Sin alumnos cargados</span>`
    : alumnosLista.map((a,i) =>
        `<span class="tag">${a}<button onclick="removeAlumno(${i})">×</button></span>`
      ).join("");
}

function limpiarAlumnos() {
  if (!confirm("¿Limpiar toda la lista?")) return;
  alumnosLista = [];
  renderTags();
  db.ref(getCursoPath("alumnos")).remove();
}

// ── QR ────────────────────────────────────────────────────
function generarQR() {
  const box = document.getElementById("qr-box");
  if (!box) return;
  box.innerHTML = "";
  const cid = cursoActivo.replace(/[°\s]/g,"_");
  const url = `${location.origin}${location.pathname}?scan=1&prec=${currentData.id}&curso=${cid}`;
  new QRCode(box, { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
}

// ── Registro ──────────────────────────────────────────────
function loadFechas() {
  db.ref(getCursoPath("fechas")).once("value", snap => {
    const sel    = document.getElementById("sel-fecha");
    if (!sel) return;
    const fechas = snap.val() || {};
    const keys   = Object.keys(fechas).sort().reverse();
    sel.innerHTML = `<option value="">— Elegí una fecha —</option>` +
      keys.map(k => `<option value="${k}">${formatearFecha(k)}</option>`).join("");
  });
}

function cargarRegistro(fechaId) {
  if (!fechaId) { document.getElementById("reg-stats").style.display="none"; return; }
  if (regListener) regListener.off();
  fechaActual = fechaId;
  document.getElementById("reg-stats").style.display = "block";

  db.ref(getCursoPath("fechas", fechaId)).once("value", snap => {
    const datos = snap.val();
    const total = datos?.alumnos ? Object.values(datos.alumnos) : [];

    regListener = db.ref(getCursoPath("presentes", fechaId));
    regListener.on("value", snap => {
      const pObj      = snap.val() || {};
      const presentes = Object.values(pObj).sort((a,b) => a.timestamp-b.timestamp);
      const nombresP  = presentes.map(p => p.nombre);
      const ausentes  = total.filter(a => !nombresP.includes(a));

      document.getElementById("s-total").textContent     = total.length;
      document.getElementById("s-presentes").textContent = presentes.length;
      document.getElementById("s-ausentes").textContent  = ausentes.length;

      document.getElementById("lista-presentes").innerHTML = presentes.length === 0
        ? `<li class="empty-hint">Ningún alumno registrado aún</li>`
        : presentes.map(p => `<li><span>${p.nombre}</span><span class="badge-hora">${p.hora}${p.manual?' · manual':''}</span></li>`).join("");

      document.getElementById("lista-ausentes").innerHTML = ausentes.length === 0
        ? `<li class="empty-hint">Todos presentes</li>`
        : ausentes.map(a => `<li><span>${a}</span></li>`).join("");

      window._exportData = { fecha: fechaId, presentes, ausentes, totalAlumnos: total };
    });
  });
}

// ── Marcar manual ─────────────────────────────────────────
function toggleManual(show) {
  const box = document.getElementById("marcar-manual-box");
  const btn = document.getElementById("btn-manual");
  if (!box||!btn) return;
  box.style.display = show ? "block" : "none";
  btn.style.display  = show ? "none"  : "block";
  if (show) {
    const ausentes = Array.from(document.querySelectorAll("#lista-ausentes li span:first-child"))
      .map(el => el.textContent.trim()).filter(Boolean);
    const sel = document.getElementById("sel-manual");
    sel.innerHTML = '<option value="">— Elegí un alumno —</option>' +
      ausentes.map(a => `<option value="${a}">${a}</option>`).join("");
    document.getElementById("manual-msg").innerHTML = "";
  }
}

function marcarManual() {
  const sel    = document.getElementById("sel-manual");
  const nombre = sel.value;
  if (!nombre || !fechaActual) return;
  const btn  = document.querySelector("#marcar-manual-box .btn-primary");
  btn.disabled = true; btn.textContent = "Registrando...";
  const hora = new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
  const key  = nombre.replace(/\s+/g,"_").toLowerCase();
  db.ref(getCursoPath("presentes", fechaActual, key))
    .set({ nombre, hora, timestamp: Date.now(), manual: true })
    .then(() => {
      document.getElementById("manual-msg").innerHTML =
        `<span style="color:#15803d;">✓ ${nombre} marcado presente · ${hora}</span>`;
      btn.disabled=false; btn.textContent="Marcar presente";
      sel.value="";
      setTimeout(() => toggleManual(false), 1500);
    });
}

// ── Exportar CSV ──────────────────────────────────────────
function exportCSV() {
  const d = window._exportData;
  if (!d) return;
  let csv = `${IFD} · ${cursoActivo} · Turno ${TURNO}\nFecha: ${formatearFecha(d.fecha)}\n\nNombre,Estado,Hora\n`;
  d.totalAlumnos.forEach(a => {
    const p = d.presentes.find(x => x.nombre===a);
    csv += `"${a}","${p?"Presente":"Ausente"}","${p?p.hora:""}"\n`;
  });
  const blob = new Blob([csv],{type:"text/csv"});
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href=url; link.download=`asistencia_${cursoActivo.replace(/[°\s]/g,"_")}_${d.fecha}.csv`; link.click();
}

// ══════════════════════════════════════════════════════════
//  VISTA ALUMNO (escaneo QR)
// ══════════════════════════════════════════════════════════
function renderVistaAlumno(cursoId, precId) {
  const fechaId = getFechaHoy();
  const app     = document.getElementById("app");

  // Verificar franja horaria Argentina
  const ahora  = new Date();
  const horaAR = new Date(ahora.toLocaleString("en-US",{timeZone:"America/Argentina/Buenos_Aires"}));
  const min    = horaAR.getHours()*60 + horaAR.getMinutes();
  if (min < 13*60+30 || min > 18*60) {
    const horaStr = horaAR.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
    app.innerHTML = `
      <div class="phone-wrap">
        <div class="phone-header">
          <div class="logo-pill">${IFD}</div>
          <h1 class="phone-title">Fuera de horario</h1>
        </div>
        <div class="phone-body">
          <div class="alert-error" style="text-align:center;padding:1.5rem;">
            <div style="font-size:32px;margin-bottom:12px;">🕐</div>
            <div style="font-weight:600;">El registro está disponible de 13:30 a 18:00 hs</div>
            <div style="margin-top:10px;font-size:13px;">Hora actual: ${horaStr} hs</div>
          </div>
        </div>
      </div>`;
    return;
  }

  // Verificar si ya marcó hoy
  if (localStorage.getItem(`asist_${precId}_${cursoId}_${fechaId}`)) {
    const nombre = localStorage.getItem(`asist_${precId}_${cursoId}_${fechaId}`);
    app.innerHTML = `
      <div class="phone-wrap">
        <div class="phone-header">
          <div class="logo-pill">${IFD}</div>
          <h1 class="phone-title">Marcar presencia</h1>
          <p class="phone-sub">${formatearFecha(fechaId)}</p>
        </div>
        <div class="phone-body">
          <div class="alert-success" style="text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">✓</div>
            <div style="font-size:16px;font-weight:600;">¡Ya registraste tu presencia hoy!</div>
            <div style="margin-top:8px;font-size:14px;opacity:0.8;">${nombre}</div>
          </div>
          <p style="text-align:center;font-size:13px;color:#9ca3af;margin-top:1rem;">Solo una vez por día por dispositivo.</p>
        </div>
      </div>`;
    return;
  }

  app.innerHTML = `
    <div class="phone-wrap">
      <div class="phone-header">
        <div class="logo-pill">${IFD}</div>
        <h1 class="phone-title">Marcar presencia</h1>
        <p class="phone-sub" id="scan-sub">Cargando...</p>
      </div>
      <div id="scan-body" class="phone-body">
        <p style="text-align:center;color:#6b7280;font-size:14px;">Cargando lista...</p>
      </div>
    </div>`;

  // Cargar datos del preceptor/curso
  const alumnosPath  = `preceptores/${precId}/datos/cursos/${cursoId}/alumnos`;
  const fechasPath   = `preceptores/${precId}/datos/cursos/${cursoId}/fechas/${fechaId}`;

  db.ref(alumnosPath).once("value", snap => {
    const alumnos = snap.val() ? Object.values(snap.val()) : [];
    if (alumnos.length === 0) {
      document.getElementById("scan-body").innerHTML =
        `<div class="alert-error">No hay alumnos cargados. Avisá al preceptor.</div>`; return;
    }

    // Obtener nombre del curso desde Firebase
    db.ref(`preceptores/${precId}`).once("value", ps => {
      const pd     = ps.val();
      const cursos = pd?.cursos || [];
      // Reconstruir nombre del curso desde el id
      const cursoNombre = cursos.find(c => c.replace(/[°\s]/g,"_") === cursoId) || cursoId;
      document.getElementById("scan-sub").textContent = `${cursoNombre} · Turno ${TURNO} · ${formatearFecha(fechaId)}`;
    });

    const alumnosObj = {};
    alumnos.forEach((a,i) => alumnosObj[i]=a);
    db.ref(fechasPath).once("value", sf => {
      if (!sf.val()) db.ref(fechasPath).set({ fecha: fechaId, alumnos: alumnosObj });
      renderFormAlumno(precId, cursoId, fechaId, alumnos);
    });
  });
}

function renderFormAlumno(precId, cursoId, fechaId, alumnos) {
  const presentesPath = `preceptores/${precId}/datos/cursos/${cursoId}/presentes/${fechaId}`;
  db.ref(presentesPath).on("value", snap => {
    const presentes = snap.val() ? Object.values(snap.val()).map(p=>p.nombre) : [];
    const opciones  = alumnos.map(a =>
      `<option value="${a}" ${presentes.includes(a)?"disabled":""}>${a}${presentes.includes(a)?" ✓":""}</option>`
    ).join("");
    document.getElementById("scan-body").innerHTML = `
      <div class="form-group">
        <label class="form-label">Seleccioná tu nombre</label>
        <select id="alumno-sel" class="form-select">
          <option value="">— Elegí tu nombre —</option>
          ${opciones}
        </select>
      </div>
      <button class="btn-big" id="btn-marcar" onclick="marcarPresente('${precId}','${cursoId}','${fechaId}')" disabled>
        Marcar presente
      </button>
      <div id="scan-msg"></div>
      <div class="presentes-count">${presentes.length} de ${alumnos.length} registrados</div>`;
    document.getElementById("alumno-sel").addEventListener("change", e => {
      document.getElementById("btn-marcar").disabled = !e.target.value;
    });
  });
}

function marcarPresente(precId, cursoId, fechaId) {
  const sel    = document.getElementById("alumno-sel");
  const nombre = sel.value;
  if (!nombre) return;
  const btn  = document.getElementById("btn-marcar");
  btn.disabled=true; btn.textContent="Registrando...";
  const hora = new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
  const key  = nombre.replace(/\s+/g,"_").toLowerCase();
  db.ref(`preceptores/${precId}/datos/cursos/${cursoId}/presentes/${fechaId}/${key}`)
    .set({ nombre, hora, timestamp: Date.now() })
    .then(() => {
      localStorage.setItem(`asist_${precId}_${cursoId}_${fechaId}`, nombre);
      document.getElementById("scan-body").innerHTML = `
        <div class="alert-success" style="text-align:center;">
          <div style="font-size:40px;margin-bottom:8px;">✓</div>
          <div style="font-size:17px;font-weight:600;">¡Presencia registrada!</div>
          <div style="margin-top:10px;font-size:15px;">${nombre}</div>
          <div style="margin-top:4px;font-size:13px;opacity:0.8;">${formatearFecha(fechaId)} · ${hora}</div>
        </div>
        <p style="text-align:center;font-size:13px;color:#9ca3af;margin-top:1rem;">Ya podés cerrar esta página.</p>`;
    });
}

// ══════════════════════════════════════════════════════════
//  GOOGLE DRIVE
// ══════════════════════════════════════════════════════════
function exportarADrive() {
  const d = window._exportData;
  if (!d) { alert("Primero seleccioná una fecha con datos"); return; }
  setDriveMsg("Conectando con Google Drive...", "info");
  if (gdriveToken) { subirArchivoDrive(d); return; }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: window.GDRIVE_CLIENT_ID, scope: GDRIVE_SCOPE,
    callback: resp => {
      if (resp.error) { setDriveMsg("Error al conectar.", "error"); return; }
      gdriveToken = resp.access_token; subirArchivoDrive(d);
    }
  });
  client.requestAccessToken();
}

async function subirArchivoDrive(d) {
  const csv      = buildCSV(d);
  const nombre   = `Asistencia_${cursoActivo.replace(/[°\s]/g,"_")}_${d.fecha}.csv`;
  const carpeta  = `Asistencia ${mesesNom[parseInt(d.fecha.split("-")[1])-1]} ${YEAR}`;
  setDriveMsg("Subiendo a Google Drive...", "info");
  try {
    const folderId  = await obtenerOCrearCarpeta(carpeta);
    const existente = await buscarArchivo(nombre, folderId);
    if (existente) await actualizarArchivo(existente, csv);
    else await crearArchivo(nombre, csv, folderId);
    setDriveMsg(`✓ Subido · carpeta "${carpeta}"`, "success");
  } catch(e) { setDriveMsg("Error al subir. Intentá de nuevo.", "error"); }
}

async function obtenerOCrearCarpeta(nombre) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${nombre}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
    {headers:{Authorization:"Bearer "+gdriveToken}});
  const d = await r.json();
  if (d.files?.length) return d.files[0].id;
  const c = await fetch("https://www.googleapis.com/drive/v3/files",
    {method:"POST",headers:{Authorization:"Bearer "+gdriveToken,"Content-Type":"application/json"},
     body:JSON.stringify({name:nombre,mimeType:"application/vnd.google-apps.folder"})});
  return (await c.json()).id;
}

async function buscarArchivo(nombre, folderId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${nombre}' and '${folderId}' in parents and trashed=false&fields=files(id)`,
    {headers:{Authorization:"Bearer "+gdriveToken}});
  const d = await r.json();
  return d.files?.length ? d.files[0].id : null;
}

async function crearArchivoBlob(nombre, blob, folderId) {
  const meta = JSON.stringify({name:nombre, parents:[folderId]});
  const body = new FormData();
  body.append("metadata", new Blob([meta],{type:"application/json"}));
  body.append("file", blob);
  await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {method:"POST",headers:{Authorization:"Bearer "+gdriveToken},body});
}

async function actualizarArchivoBlob(fileId, blob) {
  await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {method:"PATCH",headers:{Authorization:"Bearer "+gdriveToken,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},body:blob});
}

async function generarExcelBlob() {
  const [fechasSnap, presentesSnap, alumnosSnap] = await Promise.all([
    db.ref(getCursoPath("fechas")).once("value"),
    db.ref(getCursoPath("presentes")).once("value"),
    db.ref(getCursoPath("alumnos")).once("value")
  ]);
  const fechas     = fechasSnap.val()    || {};
  const presentes  = presentesSnap.val() || {};
  const alumnosObj = alumnosSnap.val()   || {};
  const alumnos    = Object.values(alumnosObj);
  const XLSX       = window.XLSXStyle || window.XLSX;
  const wb         = XLSX.utils.book_new();
  const meses = [[1,"Enero"],[2,"Febrero"],[3,"Marzo"],[4,"Abril"],[5,"Mayo"],[6,"Junio"],
                 [7,"Julio"],[8,"Agosto"],[9,"Septiembre"],[10,"Octubre"],[11,"Noviembre"],[12,"Diciembre"]];
  function thinBorder(){ const s={style:"thin",color:{rgb:"B0BEC5"}}; return {top:s,bottom:s,left:s,right:s}; }
  function outerBorder(){ const s={style:"medium",color:{rgb:"1A3A5C"}}; return {top:s,bottom:s,left:s,right:s}; }
  const S = {
    hdr:   {font:{name:"Calibri",bold:true,color:{rgb:"FFFFFF"},sz:11},fill:{fgColor:{rgb:"1A3A5C"}},alignment:{horizontal:"center",vertical:"center"},border:outerBorder()},
    sub:   {font:{name:"Calibri",bold:true,color:{rgb:"FFFFFF"},sz:9}, fill:{fgColor:{rgb:"2E6DA4"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
    meta:  {font:{name:"Calibri",bold:true,color:{rgb:"1A3A5C"},sz:8}, fill:{fgColor:{rgb:"D6E4F0"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
    body:  {font:{name:"Calibri",sz:8,color:{rgb:"1A1A1A"}},fill:{fgColor:{rgb:"FFFFFF"}},alignment:{horizontal:"left",vertical:"center"},border:thinBorder()},
    bodyAlt:{font:{name:"Calibri",sz:8,color:{rgb:"1A1A1A"}},fill:{fgColor:{rgb:"F2F7FB"}},alignment:{horizontal:"left",vertical:"center"},border:thinBorder()},
    num:   {font:{name:"Calibri",bold:true,sz:8,color:{rgb:"1A3A5C"}},fill:{fgColor:{rgb:"D6E4F0"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
    wkd:   {font:{name:"Calibri",sz:8,color:{rgb:"999999"}},fill:{fgColor:{rgb:"ECECEC"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
    pres:  {font:{name:"Calibri",bold:true,sz:8,color:{rgb:"155724"}},fill:{fgColor:{rgb:"D4EDDA"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
    aus:   {font:{name:"Calibri",bold:true,sz:8,color:{rgb:"721C24"}},fill:{fgColor:{rgb:"F8D7DA"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
    tot:   {font:{name:"Calibri",bold:true,sz:8,color:{rgb:"1A3A5C"}},fill:{fgColor:{rgb:"EAF0FB"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
    dayHdr:{font:{name:"Calibri",bold:true,color:{rgb:"FFFFFF"},sz:8},fill:{fgColor:{rgb:"2E6DA4"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
  };
  const dayNames = ["Lu","Ma","Mi","Ju","Vi","Sa","Do"];
  for (const [mNum, mName] of meses) {
    const daysInMonth = new Date(YEAR,mNum,0).getDate();
    const dayWd = {};
    for (let d=1;d<=daysInMonth;d++) dayWd[d]=(new Date(YEAR,mNum-1,d).getDay()+6)%7;
    const ws = {}; const merges = []; const colWidths = [];
    function setCell(r,c,v,style){ const addr=XLSX.utils.encode_cell({r,c}); ws[addr]={v,s:style}; }
    const totalCols = daysInMonth + 5;
    setCell(0,0,`INSTITUCION DE FORMACION DOCENTE N 12  REGISTRO DE ASISTENCIA ${YEAR}`,S.hdr);
    merges.push({s:{r:0,c:0},e:{r:0,c:totalCols-1}});
    setCell(1,0,`${mName.toUpperCase()}  CURSO: ${cursoActivo}  TURNO: ${TURNO}  PRECEPTOR/A: ${currentData.nombre}`,S.sub);
    merges.push({s:{r:1,c:0},e:{r:1,c:totalCols-1}});
    setCell(2,0,"N",S.dayHdr); setCell(2,1,"APELLIDO Y NOMBRE",S.dayHdr);
    for (let d=1;d<=daysInMonth;d++) setCell(2,d+1,d,dayWd[d]>=5?S.wkd:S.dayHdr);
    setCell(2,daysInMonth+2,"P",{...S.dayHdr,fill:{fgColor:{rgb:"1A3A5C"}}});
    setCell(2,daysInMonth+3,"A",{...S.dayHdr,fill:{fgColor:{rgb:"1A3A5C"}}});
    setCell(2,daysInMonth+4,"T",{...S.dayHdr,fill:{fgColor:{rgb:"1A3A5C"}}});
    setCell(3,0,"",S.meta); setCell(3,1,"",S.meta);
    for (let d=1;d<=daysInMonth;d++) setCell(3,d+1,dayNames[(new Date(YEAR,mNum-1,d).getDay()+6)%7],dayWd[d]>=5?S.wkd:S.meta);
    for (let o=0;o<3;o++) setCell(3,daysInMonth+2+o,"",S.meta);
    for (let i=0;i<Math.max(alumnos.length,24);i++) {
      const r=i+4; const nombre=alumnos[i]||""; const base=i%2!==0?S.bodyAlt:S.body;
      setCell(r,0,nombre?i+1:"",S.num); setCell(r,1,nombre,base);
      let tP=0,tA=0;
      for (let d=1;d<=daysInMonth;d++) {
        const wd=dayWd[d];
        const fid=`${YEAR}-${String(mNum).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
        if (wd>=5){setCell(r,d+1,"-",S.wkd);continue;}
        if (!nombre||!fechas[fid]){setCell(r,d+1,"",{...base,alignment:{horizontal:"center",vertical:"center"}});continue;}
        const pd=presentes[fid]?Object.values(presentes[fid]):[];
        const np=pd.map(p=>p.nombre.trim().toLowerCase());
        const nn=nombre.trim().toLowerCase();
        const ok=np.some(p=>p===nn||nn.split(" ").some(pt=>pt.length>2&&p.includes(pt)));
        if(ok){setCell(r,d+1,"P",S.pres);tP++;}else{setCell(r,d+1,"A",S.aus);tA++;}
      }
      if(nombre){
        const dataStart=XLSX.utils.encode_cell({r,c:2});
        const dataEnd=XLSX.utils.encode_cell({r,c:daysInMonth+1});
        const pColL=XLSX.utils.encode_col(daysInMonth+2);
        const aColL=XLSX.utils.encode_col(daysInMonth+3);
        const rowNum=r+1; const rangeRef=dataStart+":"+dataEnd;
        const pAddr=XLSX.utils.encode_cell({r,c:daysInMonth+2});
        const aAddr=XLSX.utils.encode_cell({r,c:daysInMonth+3});
        const tAddr=XLSX.utils.encode_cell({r,c:daysInMonth+4});
        ws[pAddr]={v:tP,f:'COUNTIF('+rangeRef+',"P")',t:'n',s:S.pres};
        ws[aAddr]={v:tA,f:'COUNTIF('+rangeRef+',"A")',t:'n',s:S.aus};
        ws[tAddr]={v:tP+tA,f:pColL+rowNum+'+'+aColL+rowNum,t:'n',s:S.tot};
      } else { for(let o=0;o<3;o++) setCell(r,daysInMonth+2+o,"",S.tot); }
    }
    colWidths.push({wch:5},{wch:28});
    for(let d=0;d<daysInMonth;d++) colWidths.push({wch:3.5});
    colWidths.push({wch:5},{wch:5},{wch:5});
    ws["!ref"]=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:29,c:totalCols-1}});
    ws["!merges"]=merges; ws["!cols"]=colWidths;
    ws["!rows"]=[{hpt:22},{hpt:16},{hpt:16},{hpt:13},...Array(26).fill({hpt:15})];
    XLSX.utils.book_append_sheet(wb, ws, mName);
  }
  const wbOut = XLSX.write(wb, {bookType:"xlsx", type:"array"});
  return new Blob([wbOut], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}

async function crearArchivo(nombre, contenido, folderId) {
  const meta = JSON.stringify({name:nombre,parents:[folderId]});
  const body = new FormData();
  body.append("metadata", new Blob([meta],{type:"application/json"}));
  body.append("file", new Blob([contenido],{type:"text/csv"}));
  await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {method:"POST",headers:{Authorization:"Bearer "+gdriveToken},body});
}

async function actualizarArchivo(fileId, contenido) {
  await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {method:"PATCH",headers:{Authorization:"Bearer "+gdriveToken,"Content-Type":"text/csv"},body:contenido});
}

function setDriveMsg(msg, tipo) {
  const el = document.getElementById("drive-msg");
  if (!el) return;
  const color = tipo==="success"?"#15803d":tipo==="error"?"#dc2626":"#2563eb";
  el.innerHTML = `<span style="font-size:13px;color:${color};">${msg}</span>`;
}

function buildCSV(d) {
  let csv = `${IFD} · ${cursoActivo} · Turno ${TURNO}\nFecha: ${formatearFecha(d.fecha)}\n\nNombre,Estado,Hora\n`;
  d.totalAlumnos.forEach(a => {
    const p = d.presentes.find(x=>x.nombre===a);
    csv += `"${a}","${p?"Presente":"Ausente"}","${p?p.hora:""}"\n`;
  });
  return csv;
}

// ══════════════════════════════════════════════════════════
//  EXPORTAR PLANILLA EXCEL PROFESIONAL
// ══════════════════════════════════════════════════════════
async function exportarPlanillaCompleta() {
  CURSO_ACTUAL_EXPORT = cursoActivo;
  const cid = cursoActivo.replace(/[°\s]/g,"_");
  const btn = document.getElementById("btn-planilla");
  if (btn) { btn.disabled=true; btn.textContent="Generando..."; }

  try {
    const [fechasSnap, presentesSnap, alumnosSnap] = await Promise.all([
      db.ref(getCursoPath("fechas")).once("value"),
      db.ref(getCursoPath("presentes")).once("value"),
      db.ref(getCursoPath("alumnos")).once("value")
    ]);

    const fechas     = fechasSnap.val()    || {};
    const presentes  = presentesSnap.val() || {};
    const alumnosObj = alumnosSnap.val()   || {};
    const alumnos    = Object.values(alumnosObj);
    const XLSX       = window.XLSXStyle || window.XLSX;
    const wb         = XLSX.utils.book_new();

    const meses = [[1,"Enero"],[2,"Febrero"],[3,"Marzo"],[4,"Abril"],[5,"Mayo"],[6,"Junio"],
                   [7,"Julio"],[8,"Agosto"],[9,"Septiembre"],[10,"Octubre"],[11,"Noviembre"],[12,"Diciembre"]];

    function thinBorder() { const s={style:"thin",color:{rgb:"B0BEC5"}}; return {top:s,bottom:s,left:s,right:s}; }
    function outerBorder(){ const s={style:"medium",color:{rgb:"1A3A5C"}}; return {top:s,bottom:s,left:s,right:s}; }

    const S = {
      hdr:   {font:{name:"Calibri",bold:true,color:{rgb:"FFFFFF"},sz:11},fill:{fgColor:{rgb:"1A3A5C"}},alignment:{horizontal:"center",vertical:"center"},border:outerBorder()},
      sub:   {font:{name:"Calibri",bold:true,color:{rgb:"FFFFFF"},sz:9}, fill:{fgColor:{rgb:"2E6DA4"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
      meta:  {font:{name:"Calibri",bold:true,color:{rgb:"1A3A5C"},sz:8}, fill:{fgColor:{rgb:"D6E4F0"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
      body:  {font:{name:"Calibri",sz:8,color:{rgb:"1A1A1A"}},           fill:{fgColor:{rgb:"FFFFFF"}},alignment:{horizontal:"left",  vertical:"center"},border:thinBorder()},
      bodyAlt:{font:{name:"Calibri",sz:8,color:{rgb:"1A1A1A"}},          fill:{fgColor:{rgb:"F2F7FB"}},alignment:{horizontal:"left",  vertical:"center"},border:thinBorder()},
      num:   {font:{name:"Calibri",bold:true,sz:8,color:{rgb:"1A3A5C"}}, fill:{fgColor:{rgb:"D6E4F0"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
      wkd:   {font:{name:"Calibri",sz:8,color:{rgb:"999999"}},           fill:{fgColor:{rgb:"ECECEC"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
      pres:  {font:{name:"Calibri",bold:true,sz:8,color:{rgb:"155724"}}, fill:{fgColor:{rgb:"D4EDDA"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
      aus:   {font:{name:"Calibri",bold:true,sz:8,color:{rgb:"721C24"}}, fill:{fgColor:{rgb:"F8D7DA"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
      tot:   {font:{name:"Calibri",bold:true,sz:8,color:{rgb:"1A3A5C"}}, fill:{fgColor:{rgb:"EAF0FB"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
      dayHdr:{font:{name:"Calibri",bold:true,color:{rgb:"FFFFFF"},sz:8}, fill:{fgColor:{rgb:"2E6DA4"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
    };

    for (const [mNum, mName] of meses) {
      const daysInMonth = new Date(YEAR,mNum,0).getDate();
      const dayWd = {};
      for (let d=1;d<=daysInMonth;d++) dayWd[d]=(new Date(YEAR,mNum-1,d).getDay()+6)%7;
      const ws = {}; const merges = []; const colWidths = [];

      function setCell(r,c,v,style){ const addr=XLSX.utils.encode_cell({r,c}); ws[addr]={v,s:style}; }

      const totalCols = daysInMonth + 5;
      setCell(0,0,`INSTITUCIÓN DE FORMACIÓN DOCENTE N° 12  ·  REGISTRO DE ASISTENCIA ${YEAR}`,S.hdr);
      merges.push({s:{r:0,c:0},e:{r:0,c:totalCols-1}});
      setCell(1,0,`${mName.toUpperCase()}  ·  CURSO: ${cursoActivo}  ·  TURNO: ${TURNO}  ·  PRECEPTOR/A: ${currentData.nombre}`,S.sub);
      merges.push({s:{r:1,c:0},e:{r:1,c:totalCols-1}});
      setCell(2,0,"N°",S.dayHdr); setCell(2,1,"APELLIDO Y NOMBRE",S.dayHdr);
      for (let d=1;d<=daysInMonth;d++) setCell(2,d+1,d,dayWd[d]>=5?S.wkd:S.dayHdr);
      setCell(2,daysInMonth+2,"P",{...S.dayHdr,fill:{fgColor:{rgb:"1A3A5C"}}});
      setCell(2,daysInMonth+3,"A",{...S.dayHdr,fill:{fgColor:{rgb:"1A3A5C"}}});
      setCell(2,daysInMonth+4,"T",{...S.dayHdr,fill:{fgColor:{rgb:"1A3A5C"}}});
      setCell(3,0,"",S.meta); setCell(3,1,"",S.meta);
      for (let d=1;d<=daysInMonth;d++) setCell(3,d+1,dayNames[(new Date(YEAR,mNum-1,d).getDay()+6)%7],dayWd[d]>=5?S.wkd:S.meta);
      for (let o=0;o<3;o++) setCell(3,daysInMonth+2+o,"",S.meta);

      for (let i=0;i<Math.max(alumnos.length,24);i++) {
        const r=i+4; const nombre=alumnos[i]||""; const base=i%2!==0?S.bodyAlt:S.body;
        setCell(r,0,nombre?i+1:"",S.num); setCell(r,1,nombre,base);
        let tP=0,tA=0;
        for (let d=1;d<=daysInMonth;d++) {
          const wd=dayWd[d];
          const fid=`${YEAR}-${String(mNum).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          if (wd>=5){setCell(r,d+1,"-",S.wkd);continue;}
          if (!nombre||!fechas[fid]){setCell(r,d+1,"",{...base,alignment:{horizontal:"center",vertical:"center"}});continue;}
          const pd=presentes[fid]?Object.values(presentes[fid]):[];
          const np=pd.map(p=>p.nombre.trim().toLowerCase());
          const nn=nombre.trim().toLowerCase();
          const ok=np.some(p=>p===nn||nn.split(" ").some(pt=>pt.length>2&&p.includes(pt)));
          if(ok){setCell(r,d+1,"P",S.pres);tP++;}else{setCell(r,d+1,"A",S.aus);tA++;}
        }
        if(nombre){
          // Use COUNTIF formulas so totals update when cells change
          var dataStart = XLSX.utils.encode_cell({r:r, c:2});
          var dataEnd   = XLSX.utils.encode_cell({r:r, c:daysInMonth+1});
          var pColLetter = XLSX.utils.encode_col(daysInMonth+2);
          var aColLetter = XLSX.utils.encode_col(daysInMonth+3);
          var rowNum = r + 1;
          var rangeRef = dataStart + ":" + dataEnd;
          var pCell = ws[XLSX.utils.encode_cell({r:r, c:daysInMonth+2})];
          var aCell = ws[XLSX.utils.encode_cell({r:r, c:daysInMonth+3})];
          var tCell = ws[XLSX.utils.encode_cell({r:r, c:daysInMonth+4})];
          if(!pCell){ ws[XLSX.utils.encode_cell({r:r, c:daysInMonth+2})] = {}; pCell = ws[XLSX.utils.encode_cell({r:r, c:daysInMonth+2})]; }
          if(!aCell){ ws[XLSX.utils.encode_cell({r:r, c:daysInMonth+3})] = {}; aCell = ws[XLSX.utils.encode_cell({r:r, c:daysInMonth+3})]; }
          if(!tCell){ ws[XLSX.utils.encode_cell({r:r, c:daysInMonth+4})] = {}; tCell = ws[XLSX.utils.encode_cell({r:r, c:daysInMonth+4})]; }
          pCell.v = tP; pCell.f = 'COUNTIF(' + rangeRef + ',"P")'; pCell.t = 'n'; pCell.s = S.pres;
          aCell.v = tA; aCell.f = 'COUNTIF(' + rangeRef + ',"A")'; aCell.t = 'n'; aCell.s = S.aus;
          tCell.v = tP+tA; tCell.f = pColLetter + rowNum + '+' + aColLetter + rowNum; tCell.t = 'n'; tCell.s = S.tot;
        }
        else for(let o=0;o<3;o++)setCell(r,daysInMonth+2+o,"",S.tot);
      }

      colWidths.push({wch:5},{wch:28});
      for(let d=0;d<daysInMonth;d++)colWidths.push({wch:3.5});
      colWidths.push({wch:5},{wch:5},{wch:5});
      ws["!ref"]=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:29,c:totalCols-1}});
      ws["!merges"]=merges; ws["!cols"]=colWidths;
      ws["!rows"]=[{hpt:22},{hpt:16},{hpt:16},{hpt:13},...Array(26).fill({hpt:15})];
      XLSX.utils.book_append_sheet(wb, ws, mName);
    }

    const cursoFile = cursoActivo.replace(/[°\s]/g,"_");
    XLSX.writeFile(wb, `Asistencia_IFD12_${cursoFile}_${YEAR}.xlsx`);
  } catch(e) { console.error(e); alert("Error: "+e.message); }

  if (btn) { btn.disabled=false; btn.textContent="Planilla Excel"; }
}
