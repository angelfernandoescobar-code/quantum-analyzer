// frontend/auth.js
const API = 'https://quantum-analyzer.onrender.com/api';

// === VERIFICAR SI ESTÁ LOGUEADO ===
function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// === CERRAR SESIÓN (FUNCIONA EN TELÉFONO) ===
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

// === EJECUTAR AL CARGAR ===
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
    if (!checkAuth()) return;
  }
});