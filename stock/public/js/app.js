import { api } from './api.js';
import { el, aviso } from './ui.js';

const MENUS = [
  { clave: 'tablero', titulo: 'Tablero', modulo: () => import('./vistas/tablero.js') },
  { clave: 'pos', titulo: 'Mostrador (POS)', modulo: () => import('./vistas/pos.js') },
  { clave: 'ventas', titulo: 'Ventas', modulo: () => import('./vistas/ventas.js') },
  { clave: 'presupuestos', titulo: 'Presupuestos', modulo: () => import('./vistas/presupuestos.js') },
  { clave: 'catalogo', titulo: 'Productos', modulo: () => import('./vistas/catalogo.js') },
  { clave: 'stock', titulo: 'Stock y conteo', modulo: () => import('./vistas/stock.js') },
  { clave: 'compras', titulo: 'Compras', modulo: () => import('./vistas/compras.js') },
  { clave: 'proveedores', titulo: 'Proveedores', modulo: () => import('./vistas/proveedores.js') },
  { clave: 'clientes', titulo: 'Clientes', modulo: () => import('./vistas/clientes.js') },
  { clave: 'creditos', titulo: 'Créditos y cobranzas', modulo: () => import('./vistas/creditos.js') },
  { clave: 'caja', titulo: 'Caja', modulo: () => import('./vistas/caja.js') },
  { clave: 'gastos', titulo: 'Gastos', modulo: () => import('./vistas/gastos.js') },
  { clave: 'reportes', titulo: 'Reportes', modulo: () => import('./vistas/reportes.js') },
  { clave: 'usuarios', titulo: 'Usuarios', modulo: () => import('./vistas/usuarios.js') },
  { clave: 'config', titulo: 'Configuración', modulo: () => import('./vistas/config.js') },
];

export const sesion = { usuario: null, config: {} };

const nodos = {
  login: document.getElementById('login'),
  app: document.getElementById('app'),
  nav: document.getElementById('nav'),
  contenido: document.getElementById('contenido'),
};

function permitidos() {
  if (!sesion.usuario) return [];
  // El admin ve todo; los demas ven los menus que tengan asignados.
  if (sesion.usuario.rol === 'admin') return MENUS;
  return MENUS.filter((m) => sesion.usuario.menus.includes(m.clave));
}

function dibujarMenu() {
  nodos.nav.textContent = '';
  for (const menu of permitidos()) {
    nodos.nav.appendChild(el('a', { href: `#/${menu.clave}`, text: menu.titulo, 'data-clave': menu.clave }));
  }
  document.getElementById('usuario-nombre').textContent = `${sesion.usuario.nombre} (${sesion.usuario.rol})`;
  document.getElementById('negocio').textContent = sesion.config.negocio_nombre || 'Sistema de Stock';
}

let limpiezaVista = null;

async function navegar() {
  const clave = (location.hash.replace('#/', '') || '').split('?')[0];
  const disponibles = permitidos();
  const menu = disponibles.find((m) => m.clave === clave) || disponibles[0];
  if (!menu) {
    nodos.contenido.textContent = 'No tenés módulos habilitados. Pedile acceso a un administrador.';
    return;
  }
  if (menu.clave !== clave) { location.hash = `#/${menu.clave}`; return; }

  for (const enlace of nodos.nav.querySelectorAll('a')) {
    enlace.classList.toggle('activo', enlace.dataset.clave === menu.clave);
  }
  if (typeof limpiezaVista === 'function') limpiezaVista();
  limpiezaVista = null;
  nodos.contenido.textContent = 'Cargando…';
  try {
    const modulo = await menu.modulo();
    nodos.contenido.textContent = '';
    limpiezaVista = await modulo.render(nodos.contenido);
  } catch (err) {
    nodos.contenido.textContent = '';
    nodos.contenido.appendChild(el('p', { class: 'error', text: err.message }));
  }
}

// Cierre por inactividad: el servidor tambien lo controla, la pantalla solo acompana.
let temporizadorInactividad;
function vigilarInactividad() {
  const minutos = Number(sesion.config.inactividad_minutos) || 20;
  const reiniciar = () => {
    clearTimeout(temporizadorInactividad);
    temporizadorInactividad = setTimeout(async () => {
      await api.post('/auth/logout').catch(() => {});
      mostrarLogin('Sesión cerrada por inactividad');
    }, minutos * 60000);
  };
  for (const evento of ['click', 'keydown', 'mousemove']) document.addEventListener(evento, reiniciar);
  reiniciar();
}

function mostrarLogin(mensaje = '') {
  sesion.usuario = null;
  clearTimeout(temporizadorInactividad);
  nodos.app.classList.add('oculto');
  nodos.login.classList.remove('oculto');
  document.getElementById('login-error').textContent = mensaje;
}

async function entrar(usuario, config) {
  sesion.usuario = usuario;
  sesion.config = config || {};
  nodos.login.classList.add('oculto');
  nodos.app.classList.remove('oculto');
  dibujarMenu();
  vigilarInactividad();
  await navegar();
}

document.getElementById('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const datos = new FormData(ev.target);
  try {
    await api.post('/auth/login', { usuario: datos.get('usuario'), password: datos.get('password') });
    const yo = await api.get('/auth/yo');
    ev.target.reset();
    await entrar(yo.usuario, yo.config);
  } catch (err) {
    document.getElementById('login-error').textContent = err.message;
  }
});

document.getElementById('salir').addEventListener('click', async () => {
  await api.post('/auth/logout').catch(() => {});
  mostrarLogin();
});

document.addEventListener('sesion-caida', () => mostrarLogin('Tu sesión venció. Ingresá de nuevo.'));
window.addEventListener('hashchange', () => { if (sesion.usuario) navegar(); });
window.addEventListener('unhandledrejection', (ev) => {
  if (ev.reason && ev.reason.message) aviso(ev.reason.message, 'error');
});

(async function iniciar() {
  try {
    const yo = await api.get('/auth/yo');
    await entrar(yo.usuario, yo.config);
  } catch (_) {
    mostrarLogin();
  }
})();
