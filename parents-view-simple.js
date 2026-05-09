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
    "<div style=\"display:flex;gap:8px;\">" +
    "<button class=\"btn-outline\" onclick=\"descargarExcelPadre()\">📊 Excel</button>" +
    "<button class=\"btn-outline\" onclick=\"location.reload()\">Actualizar</button>" +
    "</div>" +
    "</div>" +
    "<div id=\"parent-content\"></div>" +
    "</div>";

  loadParentOnlineView();
}

function loadParentOnlineView() {
  const container = document.getElementById("parent-content");
  const fechaHoy = getFechaHoy();

  container.innerHTML = "<div class=\"loading\">Buscando datos...</div>";

  buscarCursoEnPreceptor("jpoviedo1_gmail_com", fechaHoy, container, function(encontrado) {
    if (!encontrado) {
      buscarCursoEnPreceptor("corradilaura_hotmail_com", fechaHoy, container);
    }
  });
}

function buscarCursoEnPreceptor(precId, fechaHoy, container, callback) {
  db.ref(`preceptores/${precId}/datos/cursos`).once("value", function(snap) {
    const cursos = snap.val() || {};
    const nombreNormalizado = cursoActualPadre.toLowerCase().replace(/[°\s]/g, "").trim();
    
    let cursoEncontrado = null;
    Object.keys(cursos).forEach(nombreCurso => {
      const nombreNormalizadoCurso = nombreCurso.toLowerCase().replace(/[_]/g, "");
      if (nombreNormalizadoCurso === nombreNormalizado) {
        cursoEncontrado = nombreCurso;
      }
    });
    
    if (!cursoEncontrado) {
      if (callback) callback(false);
      return;
    }
    
    if (callback) callback(true);
    
    const ruta = `preceptores/${precId}/datos/cursos/${cursoEncontrado}/presentes/${fechaHoy}`;
    const ref = db.ref(ruta);
    parentListenerRef = ref;
    
    ref.on("value", function(snap) {
      const presentesHoy = snap.val() ? Object.values(snap.val()) : [];

      let html = "";
      html += "<div class=\"card\" style=\"margin-bottom:1.5rem;\">";
      html += "<div class=\"stats-grid\" style=\"margin-bottom:1rem;\">";
      html += "<div class=\"stat-card green\">";
      html += "<div class=\"stat-num\">" + presentesHoy.length + "</div>";
      html += "<div class=\"stat-lbl\">Presentes ahora</div>";
      html += "</div>";
      html += "</div>";

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
    });
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

window.addEventListener("beforeunload", function() {
  if (parentListenerRef) {
    parentListenerRef.off();
  }
});

function descargarExcelPadre() {
  db.ref(`preceptores/jpoviedo1_gmail_com/datos/cursos`).once("value", function(snap) {
    const cursos = snap.val() || {};
    const nombreNormalizado = cursoActualPadre.toLowerCase().replace(/[°\s]/g, "").trim();
    
    let cursoEncontrado = null;
    Object.keys(cursos).forEach(nombreCurso => {
      const nombreNormalizadoCurso = nombreCurso.toLowerCase().replace(/[_]/g, "");
      if (nombreNormalizadoCurso === nombreNormalizado) {
        cursoEncontrado = nombreCurso;
      }
    });
    
    if (cursoEncontrado) {
      db.ref(`preceptores/jpoviedo1_gmail_com/datos/cursos/${cursoEncontrado}`).once("value", function(snap2) {
        const datosDelCurso = snap2.val();
        if (datosDelCurso && datosDelCurso.presentes && datosDelCurso.alumnos) {
          const alumnos = datosDelCurso.alumnos || {};
          const presentes = datosDelCurso.presentes || {};
          generarExcelParaPadre(alumnos, presentes, cursoActualPadre);
          return;
        }
      });
      return;
    }
    
    db.ref(`preceptores/corradilaura_hotmail_com/datos/cursos`).once("value", function(snap3) {
      const cursos2 = snap3.val() || {};
      let cursoEncontrado2 = null;
      Object.keys(cursos2).forEach(nombreCurso => {
        const nombreNormalizadoCurso = nombreCurso.toLowerCase().replace(/[_]/g, "");
        if (nombreNormalizadoCurso === nombreNormalizado) {
          cursoEncontrado2 = nombreCurso;
        }
      });
      
      if (cursoEncontrado2) {
        db.ref(`preceptores/corradilaura_hotmail_com/datos/cursos/${cursoEncontrado2}`).once("value", function(snap4) {
          const datosDelCurso2 = snap4.val();
          if (datosDelCurso2 && datosDelCurso2.presentes && datosDelCurso2.alumnos) {
            const alumnos = datosDelCurso2.alumnos || {};
            const presentes = datosDelCurso2.presentes || {};
            generarExcelParaPadre(alumnos, presentes, cursoActualPadre);
            return;
          }
        });
        return;
      }
      
      alert("No hay datos disponibles para descargar.");
    });
  });
}

function generarExcelParaPadre(alumnos, presentes, nombreCurso) {
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const YEAR = new Date().getFullYear();
  const TURNO = "Tarde";
  const IFD_NOMBRE = "IFD N° 12";
  
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
  const alumnosList = Object.values(alumnos);

  for (const [mNum, mName] of meses) {
    const daysInMonth = new Date(YEAR, mNum, 0).getDate();
    const dayWd = {};
    for (let d = 1; d <= daysInMonth; d++) dayWd[d] = (new Date(YEAR, mNum - 1, d).getDay() + 6) % 7;
    
    const ws = {}; 
    const merges = []; 
    const colWidths = [];
    
    function setCell(r, c, v, style) { 
      const addr = XLSX.utils.encode_cell({r, c}); 
      ws[addr] = {v, s: style}; 
    }
    
    const totalCols = daysInMonth + 5;
    
    setCell(0, 0, IFD_NOMBRE + "  REGISTRO DE ASISTENCIA " + YEAR, S.hdr);
    merges.push({s:{r:0,c:0},e:{r:0,c:totalCols-1}});
    
    setCell(1, 0, mName.toUpperCase() + "  CURSO: " + nombreCurso + "  TURNO: " + TURNO, S.sub);
    merges.push({s:{r:1,c:0},e:{r:1,c:totalCols-1}});
    
    setCell(2, 0, "N°", S.dayHdr); 
    setCell(2, 1, "APELLIDO Y NOMBRE", S.dayHdr);
    
    for (let d = 1; d <= daysInMonth; d++) {
      setCell(2, d + 1, d, dayWd[d] >= 5 ? S.wkd : S.dayHdr);
    }
    
    setCell(2, daysInMonth + 2, "P", {...S.dayHdr, fill:{fgColor:{rgb:"1A3A5C"}}});
    setCell(2, daysInMonth + 3, "A", {...S.dayHdr, fill:{fgColor:{rgb:"1A3A5C"}}});
    setCell(2, daysInMonth + 4, "T", {...S.dayHdr, fill:{fgColor:{rgb:"1A3A5C"}}});
    
    setCell(3, 0, "", S.meta); 
    setCell(3, 1, "", S.meta);
    
    for (let d = 1; d <= daysInMonth; d++) {
      setCell(3, d + 1, dayNames[(new Date(YEAR, mNum - 1, d).getDay() + 6) % 7], dayWd[d] >= 5 ? S.wkd : S.meta);
    }
    
    for (let o = 0; o < 3; o++) setCell(3, daysInMonth + 2 + o, "", S.meta);

    for (let i = 0; i < Math.max(alumnosList.length, 24); i++) {
      const r = i + 4; 
      const nombre = alumnosList[i] || ""; 
      const base = i % 2 !== 0 ? S.bodyAlt : S.body;
      
      setCell(r, 0, nombre ? i + 1 : "", S.num); 
      setCell(r, 1, nombre, base);
      
      let tP = 0, tA = 0;
      
      for (let d = 1; d <= daysInMonth; d++) {
        const wd = dayWd[d];
        const fid = YEAR + "-" + String(mNum).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        
        if (wd >= 5) {
          setCell(r, d + 1, "-", S.wkd);
          continue;
        }
        
        if (!nombre) {
          setCell(r, d + 1, "", {...base, alignment:{horizontal:"center",vertical:"center"}});
          continue;
        }
        
        if (!presentes[fid] || Object.keys(presentes[fid]).length === 0) {
          setCell(r, d + 1, "", {...base, alignment:{horizontal:"center",vertical:"center"}});
          continue;
        }
        
        const pd = presentes[fid] ? Object.values(presentes[fid]) : [];
        const np = pd.map(function(p) { return p.nombre.trim().toLowerCase(); });
        const nn = nombre.trim().toLowerCase();
        const ok = np.some(function(p) { 
          return p === nn || nn.split(" ").some(function(pt) { 
            return pt.length > 2 && p.includes(pt); 
          }); 
        });
        
        if (ok) {
          setCell(r, d + 1, "P", S.pres);
          tP++;
        } else {
          setCell(r, d + 1, "A", S.aus);
          tA++;
        }
      }
      
      if (nombre) {
        const dataStart = XLSX.utils.encode_cell({r, c: 2});
        const dataEnd = XLSX.utils.encode_cell({r, c: daysInMonth + 1});
        const pColL = XLSX.utils.encode_col(daysInMonth + 2);
        const aColL = XLSX.utils.encode_col(daysInMonth + 3);
        const rowNum = r + 1; 
        const rangeRef = dataStart + ":" + dataEnd;
        
        ws[XLSX.utils.encode_cell({r, c: daysInMonth + 2})] = {v: tP, f: 'COUNTIF(' + rangeRef + ',"P")', t: 'n', s: S.pres};
        ws[XLSX.utils.encode_cell({r, c: daysInMonth + 3})] = {v: tA, f: 'COUNTIF(' + rangeRef + ',"A")', t: 'n', s: S.aus};
        ws[XLSX.utils.encode_cell({r, c: daysInMonth + 4})] = {v: tP + tA, f: pColL + rowNum + '+' + aColL + rowNum, t: 'n', s: S.tot};
      } else {
        for (let o = 0; o < 3; o++) setCell(r, daysInMonth + 2 + o, "", S.tot);
      }
    }
    
    colWidths.push({wch: 5}, {wch: 28});
    for (let d = 0; d < daysInMonth; d++) colWidths.push({wch: 3.5});
    colWidths.push({wch: 5}, {wch: 5}, {wch: 5});
    
    ws["!ref"] = XLSX.utils.encode_range({s:{r:0,c:0},e:{r:29,c:totalCols-1}});
    ws["!merges"] = merges; 
    ws["!cols"] = colWidths;
    ws["!rows"] = [{hpt:22},{hpt:16},{hpt:16},{hpt:13},...Array(26).fill({hpt:15})];
    
    XLSX.utils.book_append_sheet(wb, ws, mName);
  }
  
  const wbOut = XLSX.write(wb, {bookType:"xlsx", type:"array"});
  const blob = new Blob([wbOut], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  
  const nombreArchivo = `Asistencia_${nombreCurso.replace(/[°\s]/g, "_")}_${YEAR}.xlsx`;
  XLSX.writeFile(blob, nombreArchivo);
}