// ══════════════════════════════════════════════════════════
//  APP — Panel Admin + Panel Preceptor + Vista Alumno
// ══════════════════════════════════════════════════════════

// ⚡ DEFINICIONES GLOBALES TEMPRANAS - Evitar scope issues
if (typeof window !== 'undefined') {
  window.renderAdminPanel = null;
  window.volverAlAdmin = null;
  window.renderPreceptorPanel = null;
}

const dayNames  = ["Lu","Ma","Mi","Ju","Vi","Sa","Do"];
const mesesNom  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                   "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const YEAR      = 2026;

// ── CONFIGURACIÓN GOOGLE DRIVE PARA CERTIFICADOS ──────────────
// Reutilizar el token existente de gdriveToken (usado para Excel backup)
let certificadosFolderId = null;

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
//  MANEJO DEL TOKEN DE GOOGLE DRIVE AL VOLVER DEL REDIRECT
//  Usando Firebase getRedirectResult para recuperar el token
// ══════════════════════════════════════════════════════════
function checkDriveTokenFromRedirect() {
  auth.getRedirectResult().then(function(result) {
    if (!result || !result.credential) return;

    // Recuperar el access token de Google (incluye scope de Drive)
    const token = result.credential.accessToken;
    if (!token) return;
    gdriveToken = token;

    // Recuperar acción pendiente
    const accion = sessionStorage.getItem("driveAction");
    sessionStorage.removeItem("driveAction");

    if (accion === "exportar") {
      setTimeout(function() {
        const exportData = window._exportData;
        if (exportData) {
          subirArchivoDrive(exportData);
        } else {
          setDriveMsg("✓ Drive conectado. Seleccioná la fecha y presioná Drive.", "success");
        }
      }, 500);
    } else if (accion === "backup") {
      setTimeout(function() {
        const btn  = document.querySelector("#tab-backup .btn-primary");
        const prog = document.getElementById("backup-progress");
        if (btn && prog) ejecutarBackup(btn, prog);
      }, 500);
    }
  }).catch(function(err) {
    console.warn("getRedirectResult error:", err);
  });
}

// ══════════════════════════════════════════════════════════
//  PANEL ADMIN
// ══════════════════════════════════════════════════════════
async function backupTodoADrive() {
  const btn = document.querySelector("#tab-backup .btn-primary");
  btn.disabled = true; btn.textContent = "Procesando...";
  const prog = document.getElementById("backup-progress");
  prog.innerHTML = "";

  if (!gdriveToken) {
    autenticarDrive("backup");
    return;
  }
  await ejecutarBackup(btn, prog);
}

async function ejecutarBackup(btn, prog) {
  try {
    const snap = await db.ref("preceptores").once("value");
    const precs = snap.val() || {};
    const lista = Object.entries(precs);
    let html = "";

    for (let i = 0; i < lista.length; i++) {
      const [precId, prec] = lista[i];
      const cursos = prec.cursos || [];
      prog.innerHTML = html + `<div style="color:#2563eb;font-size:13px;">Procesando ${prec.nombre}...</div>`;

      for (const curso of cursos) {
        const cid = getCursoId(curso);
        try {
          const [fechasSnap, presentesSnap, alumnosSnap] = await Promise.all([
            db.ref("preceptores/" + precId + "/datos/cursos/" + cid + "/fechas").once("value"),
            db.ref("preceptores/" + precId + "/datos/cursos/" + cid + "/presentes").once("value"),
            db.ref("preceptores/" + precId + "/datos/cursos/" + cid + "/alumnos").once("value")
          ]);

          const fechas    = fechasSnap.val()    || {};
          const presentes = presentesSnap.val() || {};
          const alumnosObj= alumnosSnap.val()   || {};
          const alumnos   = Object.values(alumnosObj);

          if (alumnos.length === 0) continue;

          const excelBlob = await generarExcelBlobParaPreceptor(alumnos, fechas, presentes, curso, prec.nombre);
          const cursoFile = curso.replace(/[°\s]/g,"_");
          const nombre    = "Asistencia_" + cursoFile + "_" + YEAR + ".xlsx";
          const carpeta   = "Backup IFD12 - " + prec.nombre;

          const folderId  = await obtenerOCrearCarpeta(carpeta);
          const existente = await buscarArchivo(nombre, folderId);
          if (existente) await actualizarArchivoBlob(existente, excelBlob);
          else await crearArchivoBlob(nombre, excelBlob, folderId);

          html += `<div style="color:#15803d;font-size:13px;">✓ ${prec.nombre} · ${curso}</div>`;
        } catch(e) {
          html += `<div style="color:#dc2626;font-size:13px;">✗ Error en ${prec.nombre} · ${curso}</div>`;
        }
        prog.innerHTML = html;
      }
    }
    html += `<div style="font-weight:600;color:#15803d;margin-top:8px;font-size:14px;">Backup completado.</div>`;
    prog.innerHTML = html;
  } catch(e) {
    prog.innerHTML = "<span style=\"color:#dc2626;\">Error general: " + e.message + "</span>";
  }
  btn.disabled = false; btn.textContent = "Subir todos los Excel a Drive";
}

async function generarExcelBlobParaPreceptor(alumnos, fechas, presentes, cursoNombre, nombrePreceptor) {
  const XLSX = window.XLSXStyle || window.XLSX;
  const wb   = XLSX.utils.book_new();
  const meses = [[3,"Marzo"],[4,"Abril"],[5,"Mayo"],[6,"Junio"],
                 [7,"Julio"],[8,"Agosto"],[9,"Septiembre"],[10,"Octubre"],[11,"Noviembre"],[12,"Diciembre"]];

  function thinBorder(){ const s={style:"thin",color:{rgb:"B0BEC5"}}; return {top:s,bottom:s,left:s,right:s}; }
  function outerBorder(){ const s={style:"medium",color:{rgb:"1A3A5C"}}; return {top:s,bottom:s,left:s,right:s}; }
  const S = {
    hdr:   {font:{name:"Calibri",bold:true,color:{rgb:"FFFFFF"},sz:11},fill:{fgColor:{rgb:"1A3A5C"}},alignment:{horizontal:"center",vertical:"center"},border:outerBorder()},
    sub:   {font:{name:"Calibri",bold:true,color:{rgb:"FFFFFF"},sz:9}, fill:{fgColor:{rgb:"2E6DA4"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
    meta:  {font:{name:"Calibri",bold:true,color:{rgb:"1A3A5C"},sz:8}, fill:{fgColor:{rgb:"D6E4F0"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
    body:  {font:{name:"Calibri",sz:8},fill:{fgColor:{rgb:"FFFFFF"}},alignment:{horizontal:"left",vertical:"center"},border:thinBorder()},
    bodyAlt:{font:{name:"Calibri",sz:8},fill:{fgColor:{rgb:"F2F7FB"}},alignment:{horizontal:"left",vertical:"center"},border:thinBorder()},
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
    setCell(0,0,"INSTITUCION DE FORMACION DOCENTE N 12  REGISTRO DE ASISTENCIA " + YEAR,S.hdr);
    merges.push({s:{r:0,c:0},e:{r:0,c:totalCols-1}});
    setCell(1,0,mName.toUpperCase() + "  CURSO: " + cursoNombre + "  TURNO: " + TURNO + "  PRECEPTOR/A: " + nombrePreceptor,S.sub);
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
        const fid=YEAR+"-"+String(mNum).padStart(2,"0")+"-"+String(d).padStart(2,"0");
        if (wd>=5){setCell(r,d+1,"-",S.wkd);continue;}
        if (!nombre||!fechas[fid]){setCell(r,d+1,"",{...base,alignment:{horizontal:"center",vertical:"center"}});continue;}
        if (!presentes[fid] || Object.keys(presentes[fid]).length === 0) {setCell(r,d+1,"",{...base,alignment:{horizontal:"center",vertical:"center"}});continue;}
        const tipoFB = fechas[fid].tipo;
        if (tipoFB && tipoFB !== "normal") {
          const abrB = tipoFB==="feriado"?"F":tipoFB==="jornada"?"J":tipoFB==="suspension"?"S":"X";
          const fcB = {feriado:{font:"D97706",fill:"FED7AA"},jornada:{font:"CA8A04",fill:"FEF3C7"},suspension:{font:"DC2626",fill:"FECACA"},otro:{font:"7C3AED",fill:"EDE9FE"}}[tipoFB]||{font:"7C3AED",fill:"EDE9FE"};
          setCell(r,d+1,abrB,{font:{name:"Calibri",bold:true,sz:8,color:{rgb:fcB.font}},fill:{fgColor:{rgb:fcB.fill}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()});
          continue;
        }
        const pd=presentes[fid]?Object.values(presentes[fid]):[];
        const np=pd.map(function(p){return p.nombre.trim().toLowerCase();});
        const nn=nombre.trim().toLowerCase();
        const ok=np.some(function(p){return p===nn||nn.split(" ").some(function(pt){return pt.length>2&&p.includes(pt);});});
        if(ok){setCell(r,d+1,"P",S.pres);tP++;}else{setCell(r,d+1,"A",S.aus);tA++;}
      }
      if(nombre){
        const dataStart=XLSX.utils.encode_cell({r,c:2});
        const dataEnd=XLSX.utils.encode_cell({r,c:daysInMonth+1});
        const pColL=XLSX.utils.encode_col(daysInMonth+2);
        const aColL=XLSX.utils.encode_col(daysInMonth+3);
        const rowNum=r+1; const rangeRef=dataStart+":"+dataEnd;
        ws[XLSX.utils.encode_cell({r,c:daysInMonth+2})]={v:tP,f:'COUNTIF('+rangeRef+',"P")',t:'n',s:S.pres};
        ws[XLSX.utils.encode_cell({r,c:daysInMonth+3})]={v:tA,f:'COUNTIF('+rangeRef+',"A")',t:'n',s:S.aus};
        ws[XLSX.utils.encode_cell({r,c:daysInMonth+4})]={v:tP+tA,f:pColL+rowNum+"+"+aColL+rowNum,t:'n',s:S.tot};
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

// ── VOLVER AL ADMIN PANEL ───────────────────────────────────
function volverAlAdmin() {
  if (typeof renderAdminPanel === 'function') {
    renderAdminPanel();
  } else {
    console.error("❌ renderAdminPanel no disponible - recargando...");
    location.reload();
  }
}

function renderAdminPanel() {
  const u = currentUser;
  document.getElementById("app").innerHTML = `
    <div class="panel-wrap">
      <header class="panel-header">
        <div>
          <h1 class="panel-title">Panel Administrador</h1>
          <p class="panel-sub">${IFD} · ${u.displayName} · ${u.email}</p>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="btn-dark-mode" onclick="toggleDarkMode()" title="Modo oscuro" id="btn-dark">🌙</button>
          <button class="btn-outline sm" onclick="logout()">Cerrar sesión</button>
        </div>
      </header>

      <div class="tabs">
        <button class="tab active" onclick="showTab('tab-prec', this)">Preceptores</button>
        <button class="tab" onclick="showTab('tab-add', this)">Agregar preceptor</button>
        <button class="tab" onclick="showTab('tab-backup', this)">Backup Drive</button>
      </div>

      <div id="tab-prec" class="tab-content active">
        <div class="card">
          <h2 class="card-title">Preceptores registrados</h2>
          <div id="lista-prec"><p class="empty-hint">Cargando...</p></div>
        </div>
      </div>

      <div id="tab-backup" class="tab-content">
        <div class="card">
          <h2 class="card-title">Backup a Google Drive</h2>
          <p style="font-size:14px;color:#6b7280;margin-bottom:1rem;">
            Genera y sube el Excel anual de cada preceptor a tu Google Drive.
            Se crea una carpeta por preceptor con todos sus cursos.
          </p>
          <button class="btn-primary" onclick="backupTodoADrive()">
            Subir todos los Excel a Drive
          </button>
          <div id="backup-progress" style="margin-top:1rem;"></div>
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
  initDarkMode();
}

// ⚡ REGISTRAR EN WINDOW PARA DISPONIBILIDAD GLOBAL
window.renderAdminPanel = renderAdminPanel;
window.volverAlAdmin = volverAlAdmin;

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

async function renderPreceptorPanel(fromAdmin = false) {
  const p      = currentData;
  const cursos = (p.cursos || []).filter(c => c && c !== "null");
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
          <button class="btn-dark-mode" onclick="toggleDarkMode()" title="Modo oscuro" id="btn-dark">🌙</button>
          ${fromAdmin
            ? `<button class="btn-outline sm" onclick="if(typeof renderAdminPanel==='function'){renderAdminPanel();}else{location.reload();}">← Admin</button>`
            : `<button class="btn-outline sm" onclick="logout()">Cerrar sesión</button>`}
        </div>
      </header>

      <div class="tabs">
        <button class="tab active" onclick="showTab('tab-alumnos', this)">Estudiantes</button>
        <button class="tab" onclick="showTab('tab-agregar-alumnos', this)">Agregar Estudiantes</button>
        <button class="tab" onclick="showTab('tab-qr', this)">Código QR</button>
        <button class="tab" onclick="showTab('tab-registro', this)">Registro</button>
      </div>

      <!-- Alumnos -->
      <div id="tab-alumnos" class="tab-content active">
        ${await renderEstudiantesGrid(cursoActivo)}
      </div>

      <!-- Agregar Alumnos -->
      <div id="tab-agregar-alumnos" class="tab-content">
        <div class="card">
          <h2 class="card-title">Agregar estudiantes — ${cursoActivo}</h2>
          <div class="row-gap">
            <input id="inp-alumno" type="text" class="inp" placeholder="Apellido y nombre"
              onkeydown="if(event.key==='Enter')addAlumno()"/>
            <button class="btn-primary" onclick="addAlumno()">Agregar</button>
          </div>
          <div class="row-gap" style="margin-top:8px;">
            <input id="inp-buscar" type="text" class="inp" placeholder="Buscar estudiante..."
              oninput="filtrarEstudiantes(this.value)" style="background:#f9fafb;"/>
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
          <div class="card-title-row">
            <h2 class="card-title" style="margin:0;">Seleccioná una fecha</h2>
            <button class="btn-outline sm" onclick="mostrarNuevaFecha()">+ Nueva fecha</button>
          </div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
            <select id="sel-mes" class="form-select" onchange="cargarFechasPorMes(this.value)" style="flex:1;">
              <option value="">— Elegí un mes —</option>
              <option value="2">Febrero</option>
              <option value="3">Marzo</option>
              <option value="4">Abril</option>
              <option value="5">Mayo</option>
              <option value="6">Junio</option>
              <option value="7">Julio</option>
              <option value="8">Agosto</option>
              <option value="9">Septiembre</option>
              <option value="10">Octubre</option>
              <option value="11">Noviembre</option>
              <option value="12">Diciembre</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <select id="sel-fecha" class="form-select" onchange="cargarRegistro(this.value)" style="flex:1;" disabled>
              <option value="">— Primero elegí un mes —</option>
            </select>
            <button class="btn-outline sm" onclick="editarFechaActual()" id="btn-editar-fecha" style="display:none;white-space:nowrap;">✎ Editar</button>
          </div>
          <div id="editar-fecha-box" style="display:none;margin-top:1rem;padding-top:1rem;border-top:1px solid #e5e7eb;">
            <div class="form-group">
              <label class="form-label">Cambiar tipo de fecha</label>
              <select id="sel-tipo-editar" class="form-select">
                <option value="normal">Clase normal</option>
                <option value="suspension">Suspension de actividades</option>
                <option value="feriado">Feriado</option>
                <option value="jornada">Jornada institucional</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div class="form-group" id="obs-editar-box">
              <label class="form-label">Observacion (opcional)</label>
              <input id="inp-obs-editar" type="text" class="inp" placeholder="Ej: Suspension por paro docente"/>
            </div>
            <div class="row-gap" style="margin:0;">
              <button class="btn-primary" onclick="guardarEdicionFecha()">Guardar cambios</button>
              <button class="btn-outline" onclick="cancelarEdicionFecha()">Cancelar</button>
            </div>
            <div id="editar-fecha-msg" style="margin-top:8px;font-size:13px;"></div>
          </div>
          <div id="nueva-fecha-box" style="display:none;margin-top:1rem;padding-top:1rem;border-top:1px solid #e5e7eb;">
            <div class="form-group">
              <label class="form-label">Fecha</label>
              <input id="inp-nueva-fecha" type="date" class="inp"/>
            </div>
            <div class="form-group">
              <label class="form-label">Tipo</label>
              <select id="sel-tipo-fecha" class="form-select">
                <option value="normal">Clase normal</option>
                <option value="suspension">Suspension de actividades</option>
                <option value="feriado">Feriado</option>
                <option value="jornada">Jornada institucional</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div class="form-group" id="obs-box" style="display:none;">
              <label class="form-label">Observación (aparece en el Excel)</label>
              <input id="inp-obs" type="text" class="inp" placeholder="Ej: Jornada de capacitación docente"/>
            </div>
            <div class="row-gap" style="margin:0;">
              <button class="btn-primary" onclick="crearFechaManual()">Crear fecha</button>
              <button class="btn-outline" onclick="ocultarNuevaFecha()">Cancelar</button>
            </div>
            <div id="nueva-fecha-msg" style="margin-top:8px;font-size:13px;"></div>
          </div>
        </div>
        <div id="alertas-inasistencias" style="margin-bottom:8px;"></div>
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
  initDarkMode();

  // Si volvimos del redirect de Drive con token, mostrar aviso
  if (gdriveToken && sessionStorage.getItem("driveJustAuthed")) {
    sessionStorage.removeItem("driveJustAuthed");
    setTimeout(function() {
      setDriveMsg("✓ Google Drive conectado. Seleccioná una fecha y presioná Drive.", "success");
    }, 500);
  }
}

function toggleDarkMode() {
  const body = document.body;
  const isDark = body.classList.toggle("dark");
  localStorage.setItem("darkMode", isDark ? "1" : "0");
  const btn = document.getElementById("btn-dark");
  if (btn) btn.textContent = isDark ? "☀️" : "🌙";
}

function initDarkMode() {
  if (localStorage.getItem("darkMode") === "1") {
    document.body.classList.add("dark");
    const btn = document.getElementById("btn-dark");
    if (btn) btn.textContent = "☀️";
  }
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
  if (id === "tab-registro") { autoGenerarFechaHoy(); loadFechas(); }
  if (id === "tab-qr") generarQR();
}

async function autoGenerarFechaHoy() {
  const hoy   = getFechaHoy();
  const fecha = new Date(hoy + "T12:00:00");
  const dia   = fecha.getDay(); // 0=dom, 6=sab
  if (dia === 0 || dia === 6) return; // No generar en finde

  const snap = await db.ref(getCursoPath("fechas", hoy)).once("value");
  if (snap.val()) return; // Ya existe

  const alumnosSnap = await db.ref(getCursoPath("alumnos")).once("value");
  const alumnosObj  = alumnosSnap.val() || {};
  const alumnos     = Object.values(alumnosObj).filter(Boolean);
  if (alumnos.length === 0) return;

  await db.ref(getCursoPath("fechas", hoy)).set({ fecha: hoy, alumnos: alumnos });
}

// ── Alumnos ───────────────────────────────────────────────
let alumnosLista = [];

function getCursoId(curso) {
  return (curso || "").replace(/[°\.\s]/g,"_");
}

function getCursoPath(...parts) {
  const cid = getCursoId(cursoActivo);
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

function filtrarEstudiantes(texto) {
  const tags = document.querySelectorAll("#alumno-tags .tag");
  const q = texto.toLowerCase().trim();
  tags.forEach(tag => {
    const nombre = tag.textContent.toLowerCase();
    tag.style.display = !q || nombre.includes(q) ? "" : "none";
  });
}

function editarAlumno(idx) {
  const nombre = alumnosLista[idx];
  const nuevo  = prompt("Editar nombre del estudiante:", nombre);
  if (!nuevo || !nuevo.trim() || nuevo.trim() === nombre) return;
  alumnosLista[idx] = nuevo.trim();
  renderTags();
  saveAlumnos();
}

function renderTags() {
  const el = document.getElementById("alumno-tags");
  if (!el) return;
  el.innerHTML = alumnosLista.length === 0
    ? `<span class="empty-hint">Sin estudiantes cargados</span>`
    : alumnosLista.map((a,i) =>
        `<span class="tag">${a}<button onclick="editarAlumno(${i})" title="Editar" style="color:#2563eb;font-size:13px;margin-right:3px;">✎</button><button onclick="removeAlumno(${i})" title="Eliminar">×</button></span>`
      ).join("");
}

function limpiarAlumnos() {
  const total = alumnosLista.length;
  if (total === 0) { alert("La lista ya esta vacia."); return; }
  if (!confirm("ATENCION: Esta accion eliminara los " + total + " estudiantes del curso " + cursoActivo + " de forma permanente.\n\n¿Confirmas?")) return;
  const check = prompt("Escribi CONFIRMAR para eliminar la lista:");
  if (check !== "CONFIRMAR") { alert("Operacion cancelada."); return; }
  alumnosLista = [];
  renderTags();
  db.ref(getCursoPath("alumnos")).remove();
}

// ── QR ────────────────────────────────────────────────────
function generarQR() {
  const box = document.getElementById("qr-box");
  if (!box) return;
  box.innerHTML = "";
  const cid = getCursoId(cursoActivo);
  const url = `${location.origin}${location.pathname}?scan=1&prec=${currentData.id}&curso=${cid}`;
  new QRCode(box, { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
}

// ── Registro ──────────────────────────────────────────────
function editarFechaActual() {
  const box = document.getElementById("editar-fecha-box");
  if (!box || !fechaActual) return;
  box.style.display = "block";
  document.getElementById("editar-fecha-msg").innerHTML = "";
  // Load current tipo
  db.ref(getCursoPath("fechas", fechaActual)).once("value", snap => {
    const data = snap.val() || {};
    const tipo = data.tipo || "normal";
    const obs  = data.observacion || "";
    document.getElementById("sel-tipo-editar").value = tipo;
    document.getElementById("inp-obs-editar").value  = obs;
  });
}

function cancelarEdicionFecha() {
  const box = document.getElementById("editar-fecha-box");
  if (box) box.style.display = "none";
}

async function guardarEdicionFecha() {
  if (!fechaActual) return;
  const tipo = document.getElementById("sel-tipo-editar").value;
  const obs  = document.getElementById("inp-obs-editar").value.trim();
  const msg  = document.getElementById("editar-fecha-msg");

  msg.innerHTML = '<span style="color:#2563eb;">Guardando...</span>';

  const update = { tipo: tipo };
  if (tipo !== "normal") {
    update.observacion = obs || tipo;
  } else {
    update.observacion = null;
    update.tipo = null;
  }

  // Update only the tipo/observacion fields, keep alumnos intact
  const snap = await db.ref(getCursoPath("fechas", fechaActual)).once("value");
  const data = snap.val() || {};
  if (tipo === "normal") {
    delete data.tipo;
    delete data.observacion;
  } else {
    data.tipo = tipo;
    data.observacion = obs || tipo;
  }
  await db.ref(getCursoPath("fechas", fechaActual)).set(data);

  // Si no es clase normal, borrar presentes automáticamente
  if (tipo !== "normal") {
    await db.ref(getCursoPath("presentes", fechaActual)).remove();
  }

  msg.innerHTML = '<span style="color:#15803d;">✓ Fecha actualizada. Presentes eliminados.</span>';
  setTimeout(() => {
    cancelarEdicionFecha();
    cargarRegistro(fechaActual);
  }, 1200);
}

function mostrarNuevaFecha() {
  const box = document.getElementById("nueva-fecha-box");
  if (!box) return;
  box.style.display = "block";
  // Set default date to today
  const hoy = getFechaHoy();
  document.getElementById("inp-nueva-fecha").value = hoy;
  document.getElementById("sel-tipo-fecha").value = "normal";
  document.getElementById("obs-box").style.display = "none";
  document.getElementById("nueva-fecha-msg").innerHTML = "";
  // Show obs when not normal
  document.getElementById("sel-tipo-fecha").onchange = function() {
    document.getElementById("obs-box").style.display =
      this.value !== "normal" ? "block" : "none";
  };
}

function ocultarNuevaFecha() {
  const box = document.getElementById("nueva-fecha-box");
  if (box) box.style.display = "none";
}

async function crearFechaManual() {
  const fechaId = document.getElementById("inp-nueva-fecha").value;
  const tipo    = document.getElementById("sel-tipo-fecha").value;
  const obs     = document.getElementById("inp-obs").value.trim();
  const msg     = document.getElementById("nueva-fecha-msg");

  if (!fechaId) { msg.innerHTML = '<span style="color:#dc2626;">Selecciona una fecha.</span>'; return; }

  // Check if already exists
  const snap = await db.ref(getCursoPath("fechas", fechaId)).once("value");

  if (snap.val() && tipo === "normal") {
    msg.innerHTML = '<span style="color:#2563eb;">Esa fecha ya existe. Podés seleccionarla en el selector.</span>';
    return;
  }

  const alumnosSnap = await db.ref(getCursoPath("alumnos")).once("value");
  const alumnosObj  = alumnosSnap.val() || {};
  const alumnos     = Object.values(alumnosObj).filter(Boolean);

  // Build fecha object
  const fechaData = { fecha: fechaId, alumnos: alumnos };
  if (tipo !== "normal") {
    fechaData.tipo = tipo;
    fechaData.observacion = obs || tipo;
  }

  await db.ref(getCursoPath("fechas", fechaId)).set(fechaData);
  msg.innerHTML = '<span style="color:#15803d;">✓ Fecha creada correctamente.</span>';

  // Refresh fecha selector and select new date
  const mesNum = parseInt(fechaId.split("-")[1]);
  const selMes = document.getElementById("sel-mes");
  if (selMes) selMes.value = mesNum;
  await cargarFechasPorMes(mesNum);
  document.getElementById("sel-fecha").value = fechaId;
  cargarRegistro(fechaId);

  setTimeout(() => ocultarNuevaFecha(), 1500);
}

function loadFechas() {
  // Auto-select current month
  const mesActual = new Date().getMonth() + 1;
  const selMes = document.getElementById("sel-mes");
  if (selMes && !selMes.value) {
    selMes.value = mesActual >= 2 ? mesActual : 2;
    cargarFechasPorMes(selMes.value);
  }
}

function cargarFechasPorMes(mes) {
  const sel = document.getElementById("sel-fecha");
  if (!sel) return;
  if (!mes) {
    sel.innerHTML = '<option value="">— Primero elegí un mes —</option>';
    sel.disabled = true;
    return;
  }
  db.ref(getCursoPath("fechas")).once("value", snap => {
    const fechas = snap.val() || {};
    const keys = Object.keys(fechas)
      .filter(k => {
        const m = parseInt(k.split("-")[1]);
        return m === parseInt(mes);
      })
      .sort().reverse();
    if (keys.length === 0) {
      sel.innerHTML = '<option value="">— Sin fechas en este mes —</option>';
      sel.disabled = true;
    } else {
      sel.innerHTML = '<option value="">— Elegí una fecha —</option>' +
        keys.map(k => '<option value="' + k + '">' + formatearFecha(k) + '</option>').join("");
      sel.disabled = false;
    }
    // Auto-select if only one date or reset
    document.getElementById("reg-stats").style.display = "none";
    const btnEditar = document.getElementById("btn-editar-fecha");
    if (btnEditar) btnEditar.style.display = "none";
  });
}

function cargarRegistro(fechaId) {
  const btnEditar = document.getElementById("btn-editar-fecha");
  if (btnEditar) btnEditar.style.display = fechaId ? "block" : "none";
  cancelarEdicionFecha();
  if (!fechaId) { document.getElementById("reg-stats").style.display="none"; return; }
  if (regListener) regListener.off();
  fechaActual = fechaId;
  document.getElementById("reg-stats").style.display = "block";

  db.ref(getCursoPath("fechas", fechaId)).once("value", snap => {
    const datos = snap.val();
    const total = datos?.alumnos ? Object.values(datos.alumnos) : [];
    const tipoF = datos?.tipo || "normal";
    const obsF  = datos?.observacion || "";

    // Si es feriado/jornada mostrar aviso especial
    if (tipoF !== "normal") {
      const etiquetas = { feriado: "Feriado", jornada: "Jornada institucional", suspension: "Suspension de actividades", otro: "Sin clase" };
      const label = etiquetas[tipoF] || tipoF;
      document.getElementById("reg-stats").style.display = "block";
      document.getElementById("s-total").textContent     = "-";
      document.getElementById("s-presentes").textContent = "-";
      document.getElementById("s-ausentes").textContent  = "-";
      document.getElementById("lista-presentes").innerHTML =
        '<li><div class="alerta-ausencia" style="margin:0;"><span style="font-size:16px;">📅</span>' +
        '<div><strong>' + label + '</strong>' +
        (obsF ? '<br><span style="font-size:12px;">' + obsF + '</span>' : '') +
        '</div></div></li>';
      document.getElementById("lista-ausentes").innerHTML =
        '<li class="empty-hint">No aplica — dia sin clase</li>';
      document.getElementById("btn-manual").style.display = "none";
      window._exportData = { fecha: fechaId, presentes: [], ausentes: [], totalAlumnos: total };
      return;
    }

    regListener = db.ref(getCursoPath("presentes", fechaId));
    regListener.on("value", snap => {
      const pObj      = snap.val() || {};
      const presentes = Object.values(pObj).sort((a,b) => a.timestamp-b.timestamp);
      const nombresP  = presentes.map(p => p.nombre);
      const ausentes  = total.filter(a => !nombresP.includes(a));

      document.getElementById("s-total").textContent     = total.length;
      document.getElementById("s-presentes").textContent = presentes.length;
      document.getElementById("s-ausentes").textContent  = ausentes.length;
      // Make sure manual button is visible for normal dates
      const btnManual = document.getElementById("btn-manual");
      if (btnManual) btnManual.style.display = "block";

      document.getElementById("lista-presentes").innerHTML = presentes.length === 0
        ? `<li class="empty-hint">Ningún alumno registrado aún</li>`
        : presentes.map(p => {
            const key = p.nombre.replace(/\s+/g,"_").toLowerCase();
            return `<li>
              <span>${p.nombre}</span>
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="badge-hora">${p.hora}${p.manual?' · manual':''}</span>
                <button onclick="quitarPresente('${key}')" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:13px;padding:2px 6px;border-radius:4px;border:1px solid #fecaca;" title="Quitar presente">✕</button>
              </div>
            </li>`;
          }).join("");

      document.getElementById("lista-ausentes").innerHTML = ausentes.length === 0
        ? `<li class="empty-hint">Todos presentes</li>`
        : ausentes.map(a => `<li><span>${a}</span></li>`).join("");

      window._exportData = { fecha: fechaId, presentes, ausentes, totalAlumnos: total };
      verificarInasistencias(total);
    });
  });
}

async function verificarInasistencias(totalAlumnos) {
  if (!totalAlumnos || totalAlumnos.length === 0) return;
  const fechasSnap = await db.ref(getCursoPath("fechas")).once("value");
  const presentesSnap = await db.ref(getCursoPath("presentes")).once("value");
  const fechas = fechasSnap.val() || {};
  const presentes = presentesSnap.val() || {};
  const fechasOrdenadas = Object.keys(fechas).sort();
  const alertas = [];
  totalAlumnos.forEach(alumno => {
    let consecutivas = 0;
    for (let i = fechasOrdenadas.length - 1; i >= 0; i--) {
      const fid = fechasOrdenadas[i];
      // Skip feriados/jornadas
      const tipoFecha = fechas[fid] ? fechas[fid].tipo : "normal";
      if (tipoFecha && tipoFecha !== "normal") continue;
      const pd = presentes[fid] ? Object.values(presentes[fid]) : [];
      const estuvo = pd.some(p => p.nombre === alumno);
      if (!estuvo) consecutivas++;
      else break;
    }
    if (consecutivas >= 2) alertas.push({ alumno, consecutivas });
  });
  const contenedor = document.getElementById("alertas-inasistencias");
  if (!contenedor) return;
  if (alertas.length === 0) { contenedor.innerHTML = ""; return; }
  contenedor.innerHTML = alertas.map(a =>
    '<div class="alerta-ausencia"><span style="font-size:16px;">⚠️</span>' +
    '<div><strong>' + a.alumno + '</strong><br>' +
    '<span style="font-size:12px;">' + a.consecutivas + ' inasistencias consecutivas</span></div></div>'
  ).join("");
}

// ── Marcar manual ─────────────────────────────────────────
function toggleManual(show) {
  const box = document.getElementById("marcar-manual-box");
  const btn = document.getElementById("btn-manual");
  if (!box || !btn) return;
  box.style.display = show ? "block" : "none";
  btn.style.display  = show ? "none"  : "block";
  if (show) {
    const ausentes = Array.from(document.querySelectorAll("#lista-ausentes li span:first-child"))
      .map(function(el){ return el.textContent.trim(); }).filter(Boolean);
    const lista = document.getElementById("lista-manual-check");
    if (!lista) return;
    lista.innerHTML = ausentes.length === 0
      ? '<p class="empty-hint">No hay ausentes</p>'
      : ausentes.map(function(a){
          return '<label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6;cursor:pointer;font-size:14px;">' +
            '<input type="checkbox" value="' + a + '" style="width:18px;height:18px;cursor:pointer;accent-color:#1A3A5C;"/>' +
            a + '</label>';
        }).join("");
    document.getElementById("manual-msg").innerHTML = "";
    var btn2 = document.getElementById("btn-sel-todos");
    if (btn2) btn2.textContent = "Seleccionar todos";
  }
}

function seleccionarTodos() {
  var checks = document.querySelectorAll("#lista-manual-check input[type=checkbox]");
  var allChecked = Array.from(checks).every(function(c){ return c.checked; });
  checks.forEach(function(c){ c.checked = !allChecked; });
  var btn = document.getElementById("btn-sel-todos");
  if (btn) btn.textContent = allChecked ? "Seleccionar todos" : "Deseleccionar todos";
}

async function marcarManual() {
  var checks  = document.querySelectorAll("#lista-manual-check input[type=checkbox]:checked");
  var nombres = Array.from(checks).map(function(c){ return c.value; });
  if (nombres.length === 0 || !fechaActual) {
    document.getElementById("manual-msg").innerHTML =
      '<span style="color:#dc2626;">Selecciona al menos un alumno.</span>';
    return;
  }
  var btn  = document.querySelector("#marcar-manual-box .btn-primary");
  btn.disabled = true; btn.textContent = "Registrando...";
  var hora = new Date().toLocaleTimeString("es-AR", {hour:"2-digit", minute:"2-digit"});
  var promises = nombres.map(function(nombre) {
    var key = nombre.replace(/\s+/g,"_").toLowerCase();
    return db.ref(getCursoPath("presentes", fechaActual, key))
      .set({ nombre: nombre, hora: hora, timestamp: Date.now(), manual: true });
  });
  await Promise.all(promises);
  var n = nombres.length;
  document.getElementById("manual-msg").innerHTML =
    '<span style="color:#15803d;">✓ ' + n + ' alumno' + (n > 1 ? 's marcados' : ' marcado') + ' presente · ' + hora + '</span>';
  btn.disabled = false; btn.textContent = "Marcar presentes";
  setTimeout(function(){ toggleManual(false); }, 1500);
}

function quitarPresente(key) {
  if (!fechaActual) return;
  if (!confirm("Quitar la presencia de este estudiante?")) return;
  db.ref(getCursoPath("presentes", fechaActual, key)).remove()
    .then(function() {
      console.log("Presencia eliminada");
    })
    .catch(function(e) {
      alert("Error al quitar la presencia: " + e.message);
    });
}

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

  const ahora  = new Date();
  const horaAR = new Date(ahora.toLocaleString("en-US",{timeZone:"America/Argentina/Buenos_Aires"}));
  const min    = horaAR.getHours()*60 + horaAR.getMinutes();
  if (min < 8*60 || min > 18*60) {
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
            <div style="font-weight:600;">El registro está disponible de 08:00 a 18:00 hs</div>
            <div style="margin-top:10px;font-size:13px;">Hora actual: ${horaStr} hs</div>
          </div>
        </div>
      </div>`;
    return;
  }

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

  const alumnosPath  = `preceptores/${precId}/datos/cursos/${cursoId}/alumnos`;
  const fechasPath   = `preceptores/${precId}/datos/cursos/${cursoId}/fechas/${fechaId}`;

  db.ref(alumnosPath).once("value", snap => {
    const alumnos = snap.val() ? Object.values(snap.val()) : [];
    if (alumnos.length === 0) {
      document.getElementById("scan-body").innerHTML =
        `<div class="alert-error">No hay alumnos cargados. Avisá al preceptor.</div>`; return;
    }

    db.ref(`preceptores/${precId}`).once("value", ps => {
      const pd     = ps.val();
      const cursos = pd?.cursos || [];
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
//  GOOGLE DRIVE — autenticación por REDIRECT (sin popup)
// ══════════════════════════════════════════════════════════

function exportarADrive() {
  const d = window._exportData;
  if (!d) { alert("Primero selecciona una fecha con datos"); return; }
  setDriveMsg("Conectando con Google Drive...", "info");
  if (gdriveToken) { subirArchivoDrive(d); return; }
  autenticarDrive("exportar");
}

// ── Autenticar Drive usando Firebase (misma sesión de Google) ──
function autenticarDrive(accion) {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope(GDRIVE_SCOPE);
  provider.setCustomParameters({ prompt: "consent" });

  auth.signInWithPopup(provider).then(function(result) {
    const token = result.credential ? result.credential.accessToken : null;
    if (!token) { 
      setDriveMsg("No se pudo obtener el token de Drive.", "error"); 
      return; 
    }
    gdriveToken = token;
    if (accion === "exportar" && window._exportData) {
      subirArchivoDrive(window._exportData);
    } else if (accion === "backup") {
      const btn  = document.querySelector("#tab-backup .btn-primary");
      const prog = document.getElementById("backup-progress");
      if (btn && prog) ejecutarBackup(btn, prog);
    } else if (accion === "exportar") {
      setDriveMsg("Drive conectado. Selecciona una fecha y presiona Drive.", "success");
    }
  }).catch(function(err) {
    console.error("Drive auth error:", err);
    setDriveMsg("Error al conectar Drive: " + (err.message || err.code), "error");
    const btn = document.querySelector("#tab-backup .btn-primary");
    if (btn) { btn.disabled = false; btn.textContent = "Subir todos los Excel a Drive"; }
  });
}


async function subirArchivoDrive(d) {
  setDriveMsg("Generando Excel...", "info");
  try {
    const excelBlob = await generarExcelBlob();
    if (!excelBlob) { setDriveMsg("Error al generar el Excel.", "error"); return; }
    const cursoFile = cursoActivo.replace(/[°\s]/g,"_");
    const nombre    = "Asistencia_IFD12_" + cursoFile + "_" + YEAR + ".xlsx";
    const carpeta   = "Asistencia " + cursoActivo + " " + YEAR;
    setDriveMsg("Subiendo a Google Drive...", "info");
    const folderId  = await obtenerOCrearCarpeta(carpeta);
    const existente = await buscarArchivo(nombre, folderId);
    if (existente) await actualizarArchivoBlob(existente, excelBlob);
    else await crearArchivoBlob(nombre, excelBlob, folderId);
    setDriveMsg("✓ Subido correctamente · carpeta " + carpeta, "success");
  } catch(e) { console.error(e); setDriveMsg("Error al subir. Intenta de nuevo.", "error"); }
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
  const meses = [[3,"Marzo"],[4,"Abril"],[5,"Mayo"],[6,"Junio"],
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
    feriado:{font:{name:"Calibri",bold:true,sz:8,color:{rgb:"D97706"}},fill:{fgColor:{rgb:"FED7AA"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
    jornada:{font:{name:"Calibri",bold:true,sz:8,color:{rgb:"CA8A04"}},fill:{fgColor:{rgb:"FEF3C7"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()},
    suspension:{font:{name:"Calibri",bold:true,sz:8,color:{rgb:"DC2626"}},fill:{fgColor:{rgb:"FECACA"}},alignment:{horizontal:"center",vertical:"center"},border:thinBorder()}
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
        if (!presentes[fid] || Object.keys(presentes[fid]).length === 0) {setCell(r,d+1,"",{...base,alignment:{horizontal:"center",vertical:"center"}});continue;}
        const tipoFG = fechas[fid].tipo;
        if (tipoFG && tipoFG !== "normal") {
          const abrG = tipoFG==="feriado"?"F":tipoFG==="jornada"?"J":tipoFG==="suspension"?"S":"X";
          const estilo = tipoFG==="feriado"?S.feriado:tipoFG==="jornada"?S.jornada:tipoFG==="suspension"?S.suspension:S.body;
          setCell(r,d+1,abrG,estilo);
          continue;
        }
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

    const meses = [[3,"Marzo"],[4,"Abril"],[5,"Mayo"],[6,"Junio"],
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
          if (!fechas[fid]){setCell(r,d+1,"",{...base,alignment:{horizontal:"center",vertical:"center"}});continue;}
          // Mark feriado/jornada - neutral, no cuenta como P ni A
          const tipoFecha = fechas[fid].tipo;
          if (tipoFecha && tipoFecha !== "normal") {
            const abrev = tipoFecha === "feriado" ? "F" : tipoFecha === "jornada" ? "J" : tipoFecha === "suspension" ? "S" : "X";
            const festStyle = {
              font:{name:"Calibri",bold:true,sz:8,color:{rgb:"7C3AED"}},
              fill:{fgColor:{rgb:"EDE9FE"}},
              alignment:{horizontal:"center",vertical:"center"},
              border:thinBorder()
            };
            setCell(r,d+1,abrev,festStyle);
            continue; // No suma ni P ni A
          }
          if (!nombre){setCell(r,d+1,"",{...base,alignment:{horizontal:"center",vertical:"center"}});continue;}
          const pd=presentes[fid]?Object.values(presentes[fid]):[];
          const np=pd.map(p=>p.nombre.trim().toLowerCase());
          const nn=nombre.trim().toLowerCase();
          const ok=np.some(p=>p===nn||nn.split(" ").some(pt=>pt.length>2&&p.includes(pt)));
          if(ok){setCell(r,d+1,"P",S.pres);tP++;}else{setCell(r,d+1,"A",S.aus);tA++;}
        }
        if(nombre){
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
    const fileName = "Asistencia_IFD12_" + cursoFile + "_" + YEAR + ".xlsx";
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      const wbOut = XLSX.write(wb, {bookType:"xlsx", type:"base64"});
      const link = document.createElement("a");
      link.href = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + wbOut;
      link.download = fileName;
      link.click();
    } else {
      XLSX.writeFile(wb, fileName);
    }
  } catch(e) { console.error(e); alert("Error: "+e.message); }

  if (btn) { btn.disabled=false; btn.textContent="Planilla Excel"; }
}

// ═══════════════════════════════════════════════════════════════════════════
//  NUEVAS FUNCIONES - TARJETAS DE ESTUDIANTES Y REGISTRO ACADÉMICO
// ═══════════════════════════════════════════════════════════════════════════

// ── ESTRUCTURA DE ÁREAS Y ASIGNATURAS ────────────────────────────────
const AREAS_ACADEMICAS = {
  "ciencias-sociales": {
    nombre: "Ciencias Sociales",
    asignaturas: ["Construcción de Ciudad", "Economía", "Geografía", "Historia"]
  },
  "matematica-informatica": {
    nombre: "Matemática e Informática",
    asignaturas: ["Matemática", "Informática"]
  },
  "educacion-fisica": {
    nombre: "E.F.I",
    asignaturas: ["E.F.I"]
  },
  "lenguajes-produccion": {
    nombre: "Lenguajes y Producción Cultural",
    asignaturas: ["Artes Visuales", "Lengua y Literatura", "Lenguas Otras", "Lenguas Preexistentes"]
  },
  "integracion-tecnologica": {
    nombre: "Integración Tecnológica",
    asignaturas: ["Integración Tecnológica"]
  },
  "investigacion-orientaciones": {
    nombre: "Investigación de las Orientaciones",
    asignaturas: ["Investigación de las Orientaciones"]
  },
  "ciencias-naturales": {
    nombre: "Ciencias Naturales",
    asignaturas: ["Biología", "Física", "Química"]
  },
  "comunicacion-medios": {
    nombre: "Comunicación y Medios",
    asignaturas: ["Comunicación y Medios"]
  }
};

// ── RENDER TARJETAS DE ESTUDIANTES EN GRID ───────────────────────────
async function renderEstudiantesGrid(cursoId) {
  const cid = cursoId.replace(/[°\s]/g, "_");
  const path = dbPath(currentData.id, "cursos", cid, "alumnos");
  
  const alumnosSnap = await db.ref(path).once("value");
  const alumnosObj = alumnosSnap.val() || {};
  const alumnos = Object.values(alumnosObj).sort((a, b) => a.localeCompare(b, 'es-AR'));
  
  let html = `
    <div style="margin-bottom: 1.5rem;">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Lista de Estudiantes · ${cursoId}</h2>
          <p class="panel-sub">${alumnos.length} estudiantes registrados</p>
        </div>
      </div>
      
      <input type="text" id="buscar-estudiante" placeholder="Buscar estudiante..." class="inp" style="margin-bottom: 1.5rem; max-width: 400px;" onkeyup="filtrarTarjetasEstudiantes(this.value)" />
      
      <div id="estudiantes-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
  `;
  
  for (const alumno of alumnos) {
    const iniciales = alumno.split(" ").map(n => n[0]).join("").substring(0, 2);
    const estadoAsistencia = await obtenerEstadoAsistencia(cid, alumno);
    const colorAvatar = obtenerColorAvatar(alumno);
    
    html += `
      <div class="estudiante-card" data-nombre="${alumno.toLowerCase()}" onclick="irAlPerfilEstudiante('${alumno}', '${cid}')" style="
        background: var(--color-background-primary);
        border: 2px solid var(--color-border-secondary);
        border-radius: 12px;
        padding: 14px;
        cursor: pointer;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      " onmouseover="this.style.borderColor='var(--color-text-primary)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.25)'; this.style.transform='translateY(-4px)';" onmouseout="this.style.borderColor='var(--color-border-secondary)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.12)'; this.style.transform='translateY(0)';">
        
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: ${colorAvatar}; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: white; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">${iniciales}</div>
          <div style="min-width: 0; flex: 1;">
            <p style="margin: 0; font-size: 13px; font-weight: 600; color: var(--color-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${alumno}</p>
          </div>
        </div>
        
        <div style="padding: 10px 0; border-top: 1px solid var(--color-border-tertiary); font-size: 12px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: var(--color-text-secondary); font-weight: 500;">Asistencia</span>
            <span style="color: ${estadoAsistencia.color}; font-weight: 700;">${estadoAsistencia.porcentaje}%</span>
          </div>
          <div style="width: 100%; height: 6px; background: var(--color-background-secondary); border-radius: 3px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);">
            <div style="height: 100%; background: ${estadoAsistencia.color}; width: ${estadoAsistencia.porcentaje}%; border-radius: 3px; transition: width 0.3s ease;"></div>
          </div>
        </div>
      </div>
    `;
  }
  
  html += `</div></div>`;
  return html;
}

// ── OBTENER ESTADO DE ASISTENCIA ─────────────────────────────────────
async function obtenerEstadoAsistencia(cursoId, alumno) {
  const path = dbPath(currentData.id, "cursos", cursoId, "presentes");
  const snap = await db.ref(path).once("value");
  const presentes = snap.val() || {};
  
  let totalPresentes = 0;
  let totalDias = 0;
  const alumnoNorm = alumno.toLowerCase().trim();
  
  for (const fecha in presentes) {
    const pd = presentes[fecha] ? Object.values(presentes[fecha]) : [];
    totalDias++;
    const encontrado = pd.some(p => 
      p.nombre.toLowerCase().trim() === alumnoNorm || 
      alumnoNorm.split(" ").some(part => part.length > 2 && p.nombre.toLowerCase().includes(part))
    );
    if (encontrado) totalPresentes++;
  }
  
  const porcentaje = totalDias > 0 ? Math.round((totalPresentes / totalDias) * 100) : 0;
  const color = porcentaje >= 80 ? "var(--color-text-success)" : 
                porcentaje >= 70 ? "var(--color-text-warning)" : 
                "var(--color-text-danger)";
  
  return { porcentaje, color, totalPresentes, totalDias };
}

// ── OBTENER COLOR PARA AVATAR ────────────────────────────────────────
function obtenerColorAvatar(nombre) {
  const colores = [
    "#3B82F6", "#10B981", "#F59E0B", "#EF4444", 
    "#8B5CF6", "#06B6D4", "#EC4899", "#6366F1"
  ];
  const hash = nombre.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colores[hash % colores.length];
}

// ── FILTRAR TARJETAS EN TIEMPO REAL ──────────────────────────────────
function filtrarTarjetasEstudiantes(texto) {
  const cards = document.querySelectorAll(".estudiante-card");
  const textoNorm = texto.toLowerCase().trim();
  
  cards.forEach(card => {
    const nombre = card.getAttribute("data-nombre");
    if (nombre.includes(textoNorm)) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
}

// ── IR AL PERFIL DE UN ESTUDIANTE ────────────────────────────────────
function irAlPerfilEstudiante(alumno, cursoId) {
  sessionStorage.setItem("estudianteActual", JSON.stringify({
    nombre: alumno,
    cursoId: cursoId
  }));
  renderPerfilEstudiante(alumno, cursoId);
}

// ── CUATRIMESTRES Y PERÍODOS ESPECIALES ──────────────────────────────
const PERIODOS = {
  "1er_cuatrimestre": { nombre: "1er Cuatrimestre", icono: "📚" },
  "2do_cuatrimestre": { nombre: "2do Cuatrimestre", icono: "📚" },
  "3er_cuatrimestre": { nombre: "3er Cuatrimestre", icono: "📚" }
};

// ── RENDERIZAR PERFIL DEL ESTUDIANTE ─────────────────────────────────
async function renderPerfilEstudiante(alumno, cursoId) {
  // Guardar que venimos del admin si es necesario
  const esFromAdmin = sessionStorage.getItem("fromAdmin") === "true" || currentRole === "admin";
  if (esFromAdmin) {
    sessionStorage.setItem("fromAdmin", "true");
  }
  
  const estadoAsistencia = await obtenerEstadoAsistencia(cursoId, alumno);
  const registroAcademico = await obtenerRegistroAcademico(cursoId, alumno);
  const iniciales = alumno.split(" ").map(n => n[0]).join("").substring(0, 2);
  const colorAvatar = obtenerColorAvatar(alumno);
  
  let htmlAsignaturas = "";
  
  for (const [areaId, area] of Object.entries(AREAS_ACADEMICAS)) {
    const notasArea = registroAcademico[areaId] || {};
    
    htmlAsignaturas += `
      <div class="card" style="margin-bottom: 1.5rem; border: 2px solid #64748b; box-shadow: 0 2px 8px rgba(0,0,0,0.5); background: #1e293b; padding: 14px; border-radius: 8px;">
        <h4 style="margin: 0 0 14px; font-size: 15px; font-weight: 700; color: #e2e8f0;">${area.nombre}</h4>
        
        <!-- Selector de Cuatrimestre con colores forzados -->
        <div style="margin-bottom: 12px;">
          <select id="select-periodo-${areaId}" class="form-select" style="
            width: 100%; 
            padding: 12px; 
            border: 2px solid #64748b; 
            border-radius: 6px; 
            background: #0f172a !important;
            color: #e2e8f0 !important;
            font-weight: 700;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
            box-sizing: border-box;
          " onchange="cambiarPeriodo('${areaId}', this.value)" onmouseover="this.style.borderColor='#93c5fd'; this.style.boxShadow='0 0 8px rgba(147, 197, 253, 0.6)';" onmouseout="this.style.borderColor='#64748b'; this.style.boxShadow='none';">
    `;
    
    for (const [periodoId, periodo] of Object.entries(PERIODOS)) {
      htmlAsignaturas += `<option value="${periodoId}" style="background: #0f172a; color: #e2e8f0;">${periodo.icono} ${periodo.nombre}</option>`;
    }
    
    htmlAsignaturas += `
          </select>
        </div>
        
        <!-- Grid de Asignaturas con mejor visualización -->
        <div id="asignaturas-${areaId}" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
    `;
    
    for (const asignatura of area.asignaturas) {
      const asigId = asignatura.toLowerCase().replace(/[^\w]/g, "_");
      const notasAsig = notasArea[asigId] || {};
      const notaPrimero = notasAsig["1er_cuatrimestre"] || "";
      
      htmlAsignaturas += `
        <div class="form-group" style="background: #1e293b; padding: 10px; border-radius: 6px; border: 2px solid #64748b;">
          <label class="form-label" style="font-size: 12px; font-weight: 700; color: #e2e8f0; margin-bottom: 6px; display: block;">${asignatura}</label>
          <input 
            type="number" 
            class="inp nota-input-${areaId}" 
            data-asig="${asigId}" 
            min="0" 
            max="10" 
            step="0.5" 
            value="${notaPrimero}" 
            placeholder="—" 
            onchange="guardarCalificacionConPeriodo('${cursoId}', '${alumno}', '${areaId}', this.dataset.asig, this.value, document.getElementById('select-periodo-${areaId}').value)" 
            style="
              width: 100%;
              text-align: center; 
              font-weight: 700; 
              padding: 10px; 
              border: 2px solid #64748b; 
              border-radius: 4px; 
              background: #0f172a !important;
              color: #e2e8f0 !important;
              font-size: 14px;
              transition: all 0.2s;
              box-sizing: border-box;
            " 
            onmouseover="this.style.borderColor='#93c5fd'; this.style.boxShadow='0 0 8px rgba(147, 197, 253, 0.6)';"
            onmouseout="this.style.borderColor='#64748b'; this.style.boxShadow='none';"
          />
        </div>
      `;
    }
    
    htmlAsignaturas += `</div></div>`;
  }
  
  const html = `
    <div class="panel-wrap">
      <div style="display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px; padding: 16px; background: var(--color-background-secondary); border-radius: var(--border-radius-lg); border: 1.5px solid var(--color-border-secondary);">
        <div style="width: 80px; height: 80px; border-radius: 50%; background: ${colorAvatar}; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 600; color: white; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">${iniciales}</div>
        <div style="flex: 1;">
          <h2 style="margin: 0 0 4px; font-size: 22px; font-weight: 700; color: var(--color-text-primary);">${alumno}</h2>
          <p style="margin: 0 0 8px; font-size: 13px; color: var(--color-text-secondary);">Curso: ${cursoId} • Turno: ${TURNO}</p>
          <p style="margin: 0; font-size: 12px; color: var(--color-text-tertiary);">Presentes: ${estadoAsistencia.totalPresentes} | Días: ${estadoAsistencia.totalDias}</p>
        </div>
        <button class="btn-outline" onclick="volverAEstudiantes()" style="white-space: nowrap;">Volver</button>
      </div>
      
      <div class="stats-grid" style="margin-bottom: 20px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); border: 2px solid #1e40af; border-radius: 8px; padding: 16px; text-align: center; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">
          <div style="font-size: 32px; font-weight: 700; color: white; margin-bottom: 4px;">${estadoAsistencia.porcentaje}%</div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.9); font-weight: 500;">Asistencia</div>
        </div>
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: 2px solid #059669; border-radius: 8px; padding: 16px; text-align: center; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
          <div style="font-size: 32px; font-weight: 700; color: white; margin-bottom: 4px;">${estadoAsistencia.totalPresentes}</div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.9); font-weight: 500;">Presentes</div>
        </div>
        <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border: 2px solid #dc2626; border-radius: 8px; padding: 16px; text-align: center; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);">
          <div style="font-size: 32px; font-weight: 700; color: white; margin-bottom: 4px;">${estadoAsistencia.totalDias - estadoAsistencia.totalPresentes}</div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.9); font-weight: 500;">Ausentes</div>
        </div>
      </div>
      
      <h3 style="margin: 1.5rem 0 1rem; font-size: 16px; font-weight: 600; color: var(--color-text-primary);">Justificación de Faltas</h3>
      <div style="border: 2px solid #64748b; border-radius: 8px; padding: 16px; background: #1e293b; margin-bottom: 1.5rem;">
        
        <!-- SECCIÓN DE FALTAS JUSTIFICADAS DESPLEGABLE -->
        <div style="margin-bottom: 16px;">
          <button id="btn-faltas-justificadas" onclick="toggleFaltasJustificadas('${cursoId}', '${alumno}')" style="
            width: 100%;
            padding: 10px;
            background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
            color: white;
            border: none;
            border-radius: 4px;
            font-weight: 600;
            cursor: pointer;
            font-size: 13px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.2s;
            box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
          " onmouseover="this.style.boxShadow='0 4px 12px rgba(139, 92, 246, 0.5)'; this.style.transform='translateY(-1px)';" onmouseout="this.style.boxShadow='0 2px 8px rgba(139, 92, 246, 0.3)'; this.style.transform='translateY(0)';">
            <span>📋 Faltas Justificadas</span>
            <span id="flecha-faltas" style="transition: transform 0.2s;">▼</span>
          </button>
          <div id="faltas-justificadas-list" style="display: none; margin-top: 8px; background: #0f172a; border: 1px solid #64748b; border-radius: 4px; padding: 0; max-height: 200px; overflow-y: auto;">
            <div style="padding: 12px; color: #94a3b8; text-align: center; font-size: 12px;">Cargando faltas justificadas...</div>
          </div>
        </div>
        
        <!-- SECCIÓN AGREGAR NUEVA JUSTIFICACIÓN -->
        <div style="border-top: 1px solid #64748b; padding-top: 16px;">
          <h4 style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #e2e8f0;">Agregar Nueva Justificación</h4>
        
          <!-- RANGO DE FECHAS -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label style="font-size: 12px; font-weight: 600; color: #e2e8f0; display: block; margin-bottom: 8px;">Fecha Desde</label>
              <input type="date" id="fecha-falta-desde" style="
                width: 100%;
                padding: 10px;
                border: 2px solid #64748b;
                border-radius: 4px;
                background: #0f172a;
                color: #e2e8f0;
                font-size: 13px;
                box-sizing: border-box;
              " onmouseover="this.style.borderColor='#93c5fd';" onmouseout="this.style.borderColor='#64748b';" />
            </div>
            <div>
              <label style="font-size: 12px; font-weight: 600; color: #e2e8f0; display: block; margin-bottom: 8px;">Fecha Hasta</label>
              <input type="date" id="fecha-falta-hasta" style="
                width: 100%;
                padding: 10px;
                border: 2px solid #64748b;
                border-radius: 4px;
                background: #0f172a;
                color: #e2e8f0;
                font-size: 13px;
                box-sizing: border-box;
              " onmouseover="this.style.borderColor='#93c5fd';" onmouseout="this.style.borderColor='#64748b';" />
            </div>
          </div>
          
          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; font-weight: 600; color: #e2e8f0; display: block; margin-bottom: 8px;">Motivo de Justificación</label>
            <textarea id="motivo-falta" placeholder="Ej: Enfermedad, cita médica, problema familiar, etc." style="
              width: 100%;
              padding: 10px;
              border: 2px solid #64748b;
              border-radius: 4px;
              background: #0f172a;
              color: #e2e8f0;
              font-size: 13px;
              min-height: 80px;
              resize: vertical;
              font-family: inherit;
              box-sizing: border-box;
            " onmouseover="this.style.borderColor='#93c5fd';" onmouseout="this.style.borderColor='#64748b';"></textarea>
          </div>
          
          <!-- CARGA DE ARCHIVOS -->
          <div style="margin-bottom: 12px;">
            <label style="font-size: 12px; font-weight: 600; color: #e2e8f0; display: block; margin-bottom: 8px;">📎 Adjuntar Certificado (Opcional)</label>
            <input type="file" id="archivo-certificado" style="
              width: 100%;
              padding: 10px;
              border: 2px solid #64748b;
              border-radius: 4px;
              background: #0f172a;
              color: #e2e8f0;
              font-size: 13px;
              box-sizing: border-box;
              cursor: pointer;
            " accept="image/*,.pdf" onchange="mostrarNombreArchivo(this)" />
            <div style="font-size: 10px; color: #64748b; margin-top: 4px;">
              PNG, JPG, PDF - máx 5MB
            </div>
            <div id="nombre-archivo" style="font-size: 11px; color: #10b981; margin-top: 6px; font-weight: 500; display: none;"></div>
          </div>
          
          <button onclick="guardarJustificacionFalta('${cursoId}', '${alumno}')" style="
            width: 100%;
            padding: 10px;
            background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
            color: white;
            border: none;
            border-radius: 4px;
            font-weight: 600;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
            box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
          " onmouseover="this.style.boxShadow='0 4px 12px rgba(59, 130, 246, 0.5)'; this.style.transform='translateY(-1px)';" onmouseout="this.style.boxShadow='0 2px 8px rgba(59, 130, 246, 0.3)'; this.style.transform='translateY(0)';">
            Guardar Justificación
          </button>
        </div>
      </div>
      
      <h3 style="margin: 1.5rem 0 1rem; font-size: 16px; font-weight: 600; color: var(--color-text-primary);">Registro Académico por Áreas</h3>
      ${htmlAsignaturas}
    </div>
  `;
  
  document.getElementById("app").innerHTML = html;
}

// ── OBTENER REGISTRO ACADÉMICO ───────────────────────────────────────
async function obtenerRegistroAcademico(cursoId, alumno) {
  const cid = cursoId.replace(/[°\s]/g, "_");
  const path = dbPath(currentData.id, "cursos", cid, "estudiantes", alumno.toLowerCase().replace(/[^\w]/g, "_"), "academico");
  try {
    const snap = await db.ref(path).once("value");
    return snap.val() || {};
  } catch(e) {
    return {};
  }
}

// ── GUARDAR CALIFICACIÓN CON PERÍODO ─────────────────────────────────
function guardarCalificacionConPeriodo(cursoId, alumno, areaId, asigId, valor, periodo) {
  const cid = cursoId.replace(/[°\s]/g, "_");
  const alumnoId = alumno.toLowerCase().replace(/[^\w]/g, "_");
  const path = dbPath(currentData.id, "cursos", cid, "estudiantes", alumnoId, "academico", areaId, asigId, periodo);
  
  const calif = valor.trim() === "" ? null : parseFloat(valor);
  
  if (calif !== null && (calif < 0 || calif > 10)) {
    alert("La calificación debe estar entre 0 y 10");
    return;
  }
  
  db.ref(path).set(calif).catch(err => {
    console.error("Error guardando calificación:", err);
  });
}

// ── CAMBIAR PERÍODO Y ACTUALIZAR INPUTS ──────────────────────────────
async function cambiarPeriodo(areaId, periodId) {
  const cursoId = JSON.parse(sessionStorage.getItem("estudianteActual")).cursoId;
  const alumno = JSON.parse(sessionStorage.getItem("estudianteActual")).nombre;
  const registroAcademico = await obtenerRegistroAcademico(cursoId, alumno);
  const notasArea = registroAcademico[areaId] || {};
  const area = AREAS_ACADEMICAS[areaId];
  
  // Actualizar los inputs con las notas del período seleccionado
  for (const asignatura of area.asignaturas) {
    const asigId = asignatura.toLowerCase().replace(/[^\w]/g, "_");
    const notasAsig = notasArea[asigId] || {};
    const notaPeriodo = notasAsig[periodId] || "";
    const input = document.querySelector(`.nota-input-${areaId}[data-asig="${asigId}"]`);
    if (input) {
      input.value = notaPeriodo;
    }
  }
}

// ── GUARDAR CALIFICACIÓN (COMPATIBILIDAD) ──────────────────────────
function guardarCalificacion(cursoId, alumno, areaId, asigId, valor) {
  const periodo = "1er_cuatrimestre"; // Default al primer cuatrimestre
  guardarCalificacionConPeriodo(cursoId, alumno, areaId, asigId, valor, periodo);
}

// ── VOLVER A VISTA DE ESTUDIANTES ────────────────────────────────────
function volverAEstudiantes() {
  sessionStorage.removeItem("estudianteActual");
  
  // Verificar si venimos del admin
  const fromAdmin = sessionStorage.getItem("fromAdmin") === "true";
  if (fromAdmin) {
    sessionStorage.removeItem("fromAdmin");
    renderAdminPanel();
  } else {
    renderPreceptorPanel();
  }
}

// ── USAR AUTENTICACIÓN EXISTENTE DE GOOGLE DRIVE ────────────────
// Las funciones obtenerCarpetaCertificados, etc. usan gdriveToken existente

// ── OBTENER O CREAR CARPETA "CERTIFICADOS" EN GOOGLE DRIVE ──────────
async function obtenerCarpetaCertificados() {
  if (certificadosFolderId) {
    return certificadosFolderId;
  }
  
  return new Promise((resolve, reject) => {
    gapi.client.drive.files.list({
      'q': "name='Certificados' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      'spaces': 'drive',
      'pageSize': 1,
      'fields': 'files(id, name)',
      'access_token': gdriveToken
    }).then(response => {
      const files = response.result.files;
      
      if (files && files.length > 0) {
        certificadosFolderId = files[0].id;
        console.log("✅ Carpeta Certificados encontrada");
        resolve(certificadosFolderId);
      } else {
        crearCarpetaCertificados().then(id => {
          certificadosFolderId = id;
          resolve(id);
        }).catch(reject);
      }
    }).catch(err => {
      console.error("Error al buscar carpeta:", err);
      reject(err);
    });
  });
}

function crearCarpetaCertificados() {
  return new Promise((resolve, reject) => {
    const fileMetadata = {
      'name': 'Certificados',
      'mimeType': 'application/vnd.google-apps.folder'
    };
    
    gapi.client.drive.files.create({
      resource: fileMetadata,
      fields: 'id',
      access_token: gdriveToken
    }).then(response => {
      const folderId = response.result.id;
      console.log("✅ Carpeta Certificados creada");
      resolve(folderId);
    }).catch(err => {
      console.error("Error al crear carpeta:", err);
      reject(err);
    });
  });
}

// ── SUBIR ARCHIVO A GOOGLE DRIVE ───────────────────────────────────
async function subirArchivoADrive(archivo, nombreArchivo, carpetaPadreId) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      try {
        const base64String = e.target.result.split(',')[1];
        
        const fileMetadata = {
          'name': nombreArchivo,
          'parents': [carpetaPadreId]
        };
        
        const multipartBody =
          '--314159265\r\n' +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(fileMetadata) + '\r\n' +
          '--314159265\r\n' +
          'Content-Type: ' + archivo.type + '\r\n' +
          'Content-Transfer-Encoding: base64\r\n\r\n' +
          base64String + '\r\n' +
          '--314159265--';
        
        const xhr = new XMLHttpRequest();
        xhr.withCredentials = true;
        
        xhr.addEventListener('readystatechange', function() {
          if (this.readyState === 4) {
            try {
              const response = JSON.parse(this.responseText);
              if (response.id) {
                console.log("✅ Archivo subido a Drive:", response.id);
                resolve(response.id);
              } else {
                reject(new Error("No se obtuvo ID del archivo"));
              }
            } catch (err) {
              reject(err);
            }
          }
        });
        
        xhr.onerror = function() {
          reject(new Error("Error en la carga del archivo"));
        };
        
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&access_token=' + gdriveToken);
        xhr.setRequestHeader('Content-Type', 'multipart/related; boundary="314159265"');
        xhr.send(multipartBody);
      } catch (err) {
        reject(err);
      }
    };
    
    reader.onerror = () => reject(new Error("Error al leer archivo"));
    reader.readAsDataURL(archivo);
  });
}

// ── OBTENER URL DE DESCARGA DE GOOGLE DRIVE ────────────────────────
async function obtenerURLDescarga(archivoId) {
  return new Promise((resolve, reject) => {
    gapi.client.drive.files.get({
      'fileId': archivoId,
      'fields': 'webContentLink',
      'access_token': gdriveToken
    }).then(response => {
      const file = response.result;
      const downloadUrl = file.webContentLink;
      console.log("✅ URL de descarga obtenida");
      resolve(downloadUrl);
    }).catch(err => {
      console.error("Error al obtener URL:", err);
      reject(err);
    });
  });
}

// ── GUARDAR JUSTIFICACIÓN DE FALTA CON GOOGLE DRIVE ────────────────
async function guardarJustificacionFalta(cursoId, alumno) {
  const fechaDesde = document.getElementById("fecha-falta-desde").value;
  const fechaHasta = document.getElementById("fecha-falta-hasta").value;
  const motivo = document.getElementById("motivo-falta").value.trim();
  const archivo = document.getElementById("archivo-certificado").files[0];
  
  // Validaciones
  if (!fechaDesde) {
    alert("❌ Por favor selecciona la fecha desde");
    return;
  }
  
  if (fechaHasta && fechaHasta < fechaDesde) {
    alert("❌ La fecha hasta no puede ser anterior a la fecha desde");
    return;
  }
  
  if (!motivo) {
    alert("❌ Por favor ingresa el motivo de justificación");
    return;
  }
  
  if (archivo && archivo.size > 50 * 1024 * 1024) {
    alert("❌ El archivo no puede ser mayor a 50MB");
    return;
  }
  
  const cid = cursoId.replace(/[°\s]/g, "_");
  const alumnoId = alumno.toLowerCase().replace(/[^\w]/g, "_");
  const fechaKey = fechaHasta || fechaDesde;
  const path = dbPath(currentData.id, "cursos", cid, "estudiantes", alumnoId, "justificaciones", fechaKey);
  
  // Si hay archivo, subir a Google Drive
  if (archivo) {
    try {
      // Verificar que Google Drive está autenticado
      if (!gdriveToken) {
        alert("⏳ Autenticando con Google Drive...");
        // Usar función existente de autenticación
        autenticarDrive("certificados");
        // Esperar a que se complete la autenticación
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        if (!gdriveToken) {
          alert("❌ No se pudo autenticar con Google Drive");
          return;
        }
      }
      
      alert("⏳ Preparando carpeta de certificados...");
      
      // Obtener o crear carpeta Certificados
      const carpetaId = await obtenerCarpetaCertificados();
      
      alert("⏳ Subiendo archivo a Google Drive...");
      
      // Subir archivo a Drive
      const nombreArchivo = `${alumno}_${fechaKey}_${archivo.name}`;
      const archivoId = await subirArchivoADrive(archivo, nombreArchivo, carpetaId);
      
      // Obtener URL de descarga
      const urlDescarga = await obtenerURLDescarga(archivoId);
      
      // Guardar metadata en Database
      const justificacion = {
        fechaDesde: fechaDesde,
        fechaHasta: fechaHasta || null,
        motivo: motivo,
        guardado: new Date().toISOString(),
        tieneArchivo: true,
        nombreArchivo: archivo.name,
        tipoArchivo: archivo.type,
        tamanioArchivo: archivo.size,
        urlDescarga: urlDescarga,
        driveFileId: archivoId
      };
      
      await db.ref(path).set(justificacion);
      
      alert("✅ Justificación guardada correctamente\n📎 Archivo: " + archivo.name);
      
      // Limpiar campos
      document.getElementById("fecha-falta-desde").value = "";
      document.getElementById("fecha-falta-hasta").value = "";
      document.getElementById("motivo-falta").value = "";
      document.getElementById("archivo-certificado").value = "";
      document.getElementById("nombre-archivo").style.display = "none";
      document.getElementById("nombre-archivo").textContent = "";
      
      // Recargar lista
      cargarFaltasJustificadas(cid, alumno);
      
    } catch (err) {
      console.error("Error:", err);
      alert("❌ Error al guardar: " + err.message);
    }
    
  } else {
    // Sin archivo
    const justificacion = {
      fechaDesde: fechaDesde,
      fechaHasta: fechaHasta || null,
      motivo: motivo,
      guardado: new Date().toISOString(),
      tieneArchivo: false
    };
    
    db.ref(path).set(justificacion).then(() => {
      alert("✅ Justificación guardada correctamente");
      
      // Limpiar campos
      document.getElementById("fecha-falta-desde").value = "";
      document.getElementById("fecha-falta-hasta").value = "";
      document.getElementById("motivo-falta").value = "";
      document.getElementById("archivo-certificado").value = "";
      document.getElementById("nombre-archivo").style.display = "none";
      document.getElementById("nombre-archivo").textContent = "";
      
      // Recargar lista
      cargarFaltasJustificadas(cid, alumno);
    }).catch(err => {
      alert("❌ Error al guardar: " + err.message);
    });
  }
}

// ── DESCARGAR DESDE GOOGLE DRIVE ──────────────────────────────────
function descargarArchivo(nombreArchivo, urlDescarga) {
  console.log("Abriendo descarga:", nombreArchivo);
  
  if (!urlDescarga) {
    alert("❌ El archivo no está disponible");
    return;
  }
  
  try {
    // Abrir en nueva ventana (Drive maneja la descarga)
    window.open(urlDescarga, '_blank');
    console.log("✅ Descarga iniciada");
  } catch (err) {
    console.error("Error:", err);
    alert("❌ Error al descargar: " + err.message);
  }
}

// ── MOSTRAR NOMBRE DE ARCHIVO ───────────────────────────────────────
function mostrarNombreArchivo(input) {
  const nombreDiv = document.getElementById("nombre-archivo");
  if (input.files.length > 0) {
    const archivo = input.files[0];
    const tamanio = (archivo.size / 1024).toFixed(2);
    nombreDiv.textContent = "✅ " + archivo.name + " (" + tamanio + "KB)";
    nombreDiv.style.display = "block";
  } else {
    nombreDiv.style.display = "none";
  }
}

// ── TOGGLE FALTAS JUSTIFICADAS ─────────────────────────────────────
function toggleFaltasJustificadas(cursoId, alumno) {
  const lista = document.getElementById("faltas-justificadas-list");
  const btn = document.getElementById("btn-faltas-justificadas");
  const flecha = document.getElementById("flecha-faltas");
  
  if (lista.style.display === "none") {
    lista.style.display = "block";
    flecha.style.transform = "rotate(180deg)";
    cargarFaltasJustificadas(cursoId, alumno);
  } else {
    lista.style.display = "none";
    flecha.style.transform = "rotate(0deg)";
  }
}

// ── CARGAR FALTAS JUSTIFICADAS ──────────────────────────────────────
async function cargarFaltasJustificadas(cursoId, alumno) {
  const cid = cursoId.replace(/[°\s]/g, "_");
  const alumnoId = alumno.toLowerCase().replace(/[^\w]/g, "_");
  const path = dbPath(currentData.id, "cursos", cid, "estudiantes", alumnoId, "justificaciones");
  
  try {
    const snap = await db.ref(path).once("value");
    const justificaciones = snap.val() || {};
    const lista = document.getElementById("faltas-justificadas-list");
    
    if (Object.keys(justificaciones).length === 0) {
      lista.innerHTML = '<div style="padding: 12px; color: #94a3b8; text-align: center; font-size: 12px;">No hay faltas justificadas</div>';
      return;
    }
    
    let html = '';
    for (const [fecha, datos] of Object.entries(justificaciones)) {
      const fechaDesde = datos.fechaDesde || fecha;
      const fechaHasta = datos.fechaHasta ? ` - ${datos.fechaHasta}` : '';
      const icono = datos.tieneArchivo ? '📎' : '📅';
      
      let botonArchivo = '';
      if (datos.tieneArchivo && datos.nombreArchivo && datos.urlDescarga) {
        const nombreSafe = datos.nombreArchivo.replace(/'/g, "\\'");
        const urlSafe = datos.urlDescarga.replace(/'/g, "\\'");
        
        botonArchivo = `<button onclick="event.stopPropagation(); descargarArchivo('${nombreSafe}', '${urlSafe}')" style="
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          border: none;
          border-radius: 3px;
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 1px 4px rgba(16, 185, 129, 0.3);
          margin-right: 4px;
        " onmouseover="this.style.boxShadow='0 2px 8px rgba(16, 185, 129, 0.5)'; this.style.transform='scale(1.05)';" onmouseout="this.style.boxShadow='0 1px 4px rgba(16, 185, 129, 0.3)'; this.style.transform='scale(1)';">
          📥 Ver/Descargar
        </button>`;
      }
      
      html += `
        <div style="border-bottom: 1px solid #64748b; padding: 10px; transition: background 0.2s;" onmouseover="this.style.background='#0f172a';" onmouseout="this.style.background='transparent';">
          <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; margin-bottom: 8px;" onclick="toggleMotivo(this)">
            <span style="color: #93c5fd; font-weight: 500; font-size: 12px;">${icono} ${fechaDesde}${fechaHasta}</span>
            <div style="display: flex; gap: 8px; align-items: center;">
              <span style="color: #64748b; font-size: 10px; transition: transform 0.2s;">▶</span>
              <button onclick="event.stopPropagation(); eliminarJustificacion('${cid}', '${alumno}', '${fecha}')" style="
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                color: white;
                border: none;
                border-radius: 3px;
                padding: 4px 8px;
                font-size: 10px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                box-shadow: 0 1px 4px rgba(239, 68, 68, 0.3);
              " onmouseover="this.style.boxShadow='0 2px 8px rgba(239, 68, 68, 0.5)'; this.style.transform='scale(1.05)';" onmouseout="this.style.boxShadow='0 1px 4px rgba(239, 68, 68, 0.3)'; this.style.transform='scale(1)';">
                🗑️ Eliminar
              </button>
            </div>
          </div>
          <div style="display: none; padding: 8px 0; border-top: 1px solid #64748b; color: #e2e8f0; font-size: 11px; line-height: 1.4;">
            <div style="margin-bottom: 6px;"><strong>Motivo:</strong> ${datos.motivo}</div>
            ${datos.tieneArchivo ? '<div style="margin-bottom: 6px; padding: 6px; background: rgba(16, 185, 129, 0.1); border-radius: 4px;">' + botonArchivo + '<span style="color: #10b981;">📎 ' + (datos.nombreArchivo || 'archivo.pdf') + '</span></div>' : ''}
          </div>
        </div>
      `;
    }
    lista.innerHTML = html;
  } catch (err) {
    const lista = document.getElementById("faltas-justificadas-list");
    lista.innerHTML = '<div style="padding: 12px; color: #ef4444; text-align: center; font-size: 12px;">Error al cargar faltas</div>';
  }
}

// ── TOGGLE MOTIVO (mostrar/ocultar) ────────────────────────────────
function toggleMotivo(element) {
  const motivo = element.querySelector('[style*="display: none"]') || element.querySelector('div:last-child');
  const flecha = element.querySelector('span:first-child');
  
  if (motivo && (motivo.style.display === "none" || !motivo.style.display)) {
    motivo.style.display = "block";
    if (flecha) flecha.style.transform = "rotate(90deg)";
  } else {
    if (motivo) motivo.style.display = "none";
    if (flecha) flecha.style.transform = "rotate(0deg)";
  }
}

// ── ELIMINAR JUSTIFICACIÓN ──────────────────────────────────────────
function eliminarJustificacion(cursoId, alumno, fecha) {
  if (!confirm(`¿Estás seguro de que deseas eliminar la justificación del ${fecha}?`)) {
    return;
  }
  
  const alumnoId = alumno.toLowerCase().replace(/[^\w]/g, "_");
  const path = dbPath(currentData.id, "cursos", cursoId, "estudiantes", alumnoId, "justificaciones", fecha);
  
  db.ref(path).remove().then(() => {
    alert("✅ Justificación eliminada correctamente");
    cargarFaltasJustificadas(cursoId.replace(/_/g, "° "), alumno);
  }).catch(err => {
    alert("❌ Error al eliminar: " + err.message);
  });
}
