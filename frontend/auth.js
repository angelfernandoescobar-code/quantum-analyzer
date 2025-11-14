// frontend/auth.js
const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:5000/api'
  : 'https://quantum-analyzer.onrender.com/api';

// === VERIFICAR TOKEN AL CARGAR index.html ===
function checkAuth() {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  if (!token || !user) {
    window.location.href = 'login.html';
    return;
  }

  // Opcional: validar token con backend
  fetch(`${API}/auth/validate`, {
    headers: { 'x-auth-token': token }
  }).catch(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
  });
}

// === CERRAR SESIÓN ===
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

// Ejecutar al cargar
if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
  document.addEventListener('DOMContentLoaded', checkAuth);
}