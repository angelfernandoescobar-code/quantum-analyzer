// frontend/auth.js
const API = 'https://quantum-analyzer.onrender.com/api';

// === VERIFICAR TOKEN EN CADA CARGA ===
function checkAuth() {
  const token = localStorage.getItem('token');
  
  if (!token) {
    redirectToLogin();
    return false;
  }

  // Verificar si el token está expirado
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);
    
    if (payload.exp && payload.exp < now) {
      alert('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      redirectToLogin();
      return false;
    }
  } catch (err) {
    console.error('Error al verificar token:', err);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    redirectToLogin();
    return false;
  }

  return true;
}

// === REDIRECCIÓN SEGURA A LOGIN ===
function redirectToLogin() {
  const isLoginPage = window.location.pathname.includes('login.html');
  if (!isLoginPage) {
    window.location.href = 'login.html';
  }
}

// === CERRAR SESIÓN (FUNCIONA EN PC Y MÓVIL) ===
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  redirectToLogin();
}

// === EJECUTAR AL CARGAR LA PÁGINA ===
document.addEventListener('DOMContentLoaded', () => {
  const currentPage = window.location.pathname;
  const isIndex = currentPage.includes('index.html') || currentPage === '/' || currentPage === '/index.html';
  const isLogin = currentPage.includes('login.html');

  // Si estamos en index.html → verificar auth
  if (isIndex && !isLogin) {
    if (!checkAuth()) return;
  }

  // Si estamos en login.html y ya hay token → ir a index
  if (isLogin && localStorage.getItem('token')) {
    try {
      const payload = JSON.parse(atob(localStorage.getItem('token').split('.')[1]));
      const now = Math.floor(Date.now() / 1000);
      if (!payload.exp || payload.exp > now) {
        window.location.href = 'index.html';
      }
    } catch (err) {
      // Token inválido → quedarse en login
    }
  }
});

// === PROTEGER RUTAS DINÁMICAMENTE ===
setInterval(() => {
  const currentPage = window.location.pathname;
  const isIndex = currentPage.includes('index.html') || currentPage === '/' || currentPage === '/index.html';
  
  if (isIndex && !localStorage.getItem('token')) {
    redirectToLogin();
  }
}, 3000);