// ── Firebase ──────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBz3NQoRkQhUEGUPyHBZruIf-BzhnH3ozg",
  authDomain: "asistencia-ifd12.firebaseapp.com",
  databaseURL: "https://asistencia-ifd12-default-rtdb.firebaseio.com",
  projectId: "asistencia-ifd12",
  storageBucket: "asistencia-ifd12.firebasestorage.app",
  messagingSenderId: "781408242345",
  appId: "1:781408242345:web:f0209c269144e9477737b8"
};
firebase.initializeApp(firebaseConfig);
const db   = firebase.database();
const auth = firebase.auth();

// ── Constantes ────────────────────────────────────────────
const IFD        = "IFD N° 12";
const TURNO      = "Tarde";
const ADMIN_UID  = ""; // Se completa automáticamente al primer login del admin
const ADMIN_MAIL = "adminsanma@gmail.com";

// ── Google Drive ──────────────────────────────────────────
window.GDRIVE_CLIENT_ID = "781408242345-r1eilre8tc2i94dv2ughj17jgcikcr35.apps.googleusercontent.com";
const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
let gdriveToken = null;
