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
  const cid = cursoActualPadre.replace(/[°\s]/g, "_").replace(/__/g, "_");;
  const fechaHoy = getFechaHoy();

  container.innerHTML = "<div class=\"loading\">Cargando datos en tiempo real...</div>";

  // Intentar primero con jpoviedo01_gmail_com
  const ruta1 = `preceptores/jpoviedo01_gmail_com/datos/cursos/${cid}/presentes/${fechaHoy}`;
  const ruta2 = `preceptores/corradilaura_hotmail_com/datos/cursos/${cid}/presentes/${fechaHoy}`;
  
  buscarPresentesEnTiempoReal(ruta1, container, function(encontrado) {
    if (!encontrado) {
      // Si no encontró en la primera, intentar con la segunda
      buscarPresentesEnTiempoReal(ruta2, container);
    }
  });
}

function buscarPresentesEnTiempoReal(ruta, container, callback) {
  const ref = db.ref(ruta);
  
  // Verificar si existe primero
  ref.once("value", function(snap) {
    if (!snap.exists()) {
      if (callback) callback(false);
      return;
    }
    
    if (callback) callback(true);
    
    // Guardar referencia para limpiar después
    parentListenerRef = ref;
    
    // Escuchar cambios en tiempo real
    ref.on("value", function(snap) {
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

// ══════════════════════════════════════════════════════════════
// DESCARGAR EXCEL COMPLETO (como preceptor)
// ══════════════════════════════════════════════════════════════

function descargarExcelPadre() {
  const cid = cursoActualPadre.replace(/[°\s]/g, "_");
  
  // Intentar con primer preceptor
  db.ref(`preceptores/jpoviedo01_gmail_com/datos/cursos/${cid}`).once("value", function(snap) {
    const datosDelCurso = snap.val();
    
    if (datosDelCurso && datosDelCurso.presentes && datosDelCurso.alumnos) {
      const alumnos = datosDelCurso.alumnos || {};
      const presentes = datosDelCurso.presentes || {};
      generarExcelParaPadre(alumnos, presentes, cursoActualPadre);
      return;
    }
    
    // Si no encontró, intentar con segundo preceptor
    db.ref(`preceptores/corradilaura_hotmail_com/datos/cursos/${cid}`).once("value", function(snap2) {
      const datosDelCurso2 = snap2.val();
      
      if (datosDelCurso2 && datosDelCurso2.presentes && datosDelCurso2.alumnos) {
        const alumnos = datosDelCurso2.alumnos || {};
        const presentes = datosDelCurso2.presentes || {};
        generarExcelParaPadre(alumnos, presentes, cursoActualPadre);
        return;
      }
      
      // Si no encontró en ninguno
      alert("No hay datos disponibles para descargar.");
    });
  });
}

function generarExcelParaPadre(alumnos, presentes, nombreCurso) {
  const wb = XLSX.utils.book_new();
  
  // Array de meses
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
                 "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  
  // Crear hoja para cada mes
  for (let mesNum = 1; mesNum <= 12; mesNum++) {
    const nombreMes = meses[mesNum - 1];
    const datosDelMes = generarDatosDelMes(alumnos, presentes, mesNum);
    
    if (datosDelMes.data.length > 0) {
      const ws = XLSX.utils.aoa_to_sheet(datosDelMes.data);
      
      // Aplicar estilos
      aplicarEstilosExcel(ws, datosDelMes.data);
      
      XLSX.utils.book_append_sheet(wb, ws, nombreMes);
    }
  }
  
  // Descargar
  const nombreArchivo = `Asistencia_${nombreCurso.replace(/[°\s]/g, "_")}_${new Date().getFullYear()}.xlsx`;
  XLSX.writeFile(wb, nombreArchivo);
}

function generarDatosDelMes(alumnos, presentes, mesNum) {
  const año = new Date().getFullYear();
  const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
                        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  
  // Header
  const data = [
    ["ASISTENCIA - " + nombresMeses[mesNum - 1] + " " + año],
    [],
    ["Alumno", "Total Presentes"]
  ];
  
  // Obtener todas las fechas del mes
  const fechasDelMes = new Set();
  Object.keys(presentes).forEach(fecha => {
    const [año2, mes, día] = fecha.split("-");
    if (parseInt(mes) === mesNum) {
      fechasDelMes.add(fecha);
    }
  });
  
  const fechasOrdenadas = Array.from(fechasDelMes).sort();
  
  // Agregar fechas al header
  fechasOrdenadas.forEach(fecha => {
    data[2].push(fecha);
  });
  
  // Agregar alumnos
  Object.entries(alumnos).forEach(([, nombre]) => {
    const fila = [nombre, 0];
    
    // Contar presentes
    fechasOrdenadas.forEach(fecha => {
      const presentesDelDia = presentes[fecha] || {};
      const presenteHoy = Object.values(presentesDelDia).some(p => 
        p.nombre.toLowerCase() === nombre.toLowerCase() ||
        nombre.toLowerCase().includes(p.nombre.toLowerCase()) ||
        p.nombre.toLowerCase().includes(nombre.toLowerCase())
      );
      
      fila.push(presenteHoy ? "P" : "A");
      if (presenteHoy) fila[1]++;
    });
    
    data.push(fila);
  });
  
  return { data, fechasOrdenadas };
}

function aplicarEstilosExcel(ws, data) {
  // Estilos básicos
  ws["A1"].s = {
    font: { bold: true, size: 14 },
    alignment: { horizontal: "center", vertical: "center" }
  };
  
  // Header de alumnos
  for (let col = 0; col < data[2].length; col++) {
    const celda = XLSX.utils.encode_col(col) + "3";
    ws[celda].s = {
      font: { bold: true, color: "FFFFFF" },
      fill: { fgColor: { rgb: "003366" } },
      alignment: { horizontal: "center" }
    };
  }
  
  // Ancho de columnas
  ws["!cols"] = [{ wch: 25 }, { wch: 12 }];
}