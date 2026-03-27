// Configuración Firebase — asistencia-ifd12
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
