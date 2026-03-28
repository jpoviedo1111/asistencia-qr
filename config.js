// =====================================================
//  Configuración Firebase
// =====================================================
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
const db = firebase.database();

// =====================================================
//  Configuración Google Drive
// =====================================================
window.GDRIVE_CLIENT_ID = "781408242345-r1eilre8tc2i94dv2ughj17jgcikcr35.apps.googleusercontent.com";
