const db = require('../db');
const config = require('../lib/config');
const { noAutorizado, prohibido } = require('../lib/errors');

const COOKIE = 'sid';

// Login obligatorio para toda la API salvo login y health-check.
async function sesionActual(req) {
  const token = req.cookies ? req.cookies[COOKIE] : null;
  if (!token) return null;

  const sesion = await db.uno(
    `SELECT s.*, u.usuario, u.nombre, u.rol, u.activo
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token = ? AND s.cerrada = 0`,
    [token]
  );
  if (!sesion || !sesion.activo) return null;

  const ahora = Date.now();
  if (new Date(sesion.expira_en).getTime() < ahora) {
    await db.ejecutar('UPDATE sesiones SET cerrada = 1 WHERE token = ?', [token]);
    return null;
  }

  // Cierre por inactividad, aunque no haya vencido el limite absoluto.
  const minutos = Number(await config.obtener('inactividad_minutos'));
  const inactivo = ahora - new Date(sesion.ultima_actividad).getTime();
  if (minutos > 0 && inactivo > minutos * 60 * 1000) {
    await db.ejecutar('UPDATE sesiones SET cerrada = 1 WHERE token = ?', [token]);
    return null;
  }

  await db.ejecutar('UPDATE sesiones SET ultima_actividad = NOW() WHERE token = ?', [token]);
  const menus = await db.query('SELECT menu FROM usuario_menus WHERE usuario_id = ?', [sesion.usuario_id]);
  return {
    id: sesion.usuario_id,
    usuario: sesion.usuario,
    nombre: sesion.nombre,
    rol: sesion.rol,
    menus: menus.map((m) => m.menu),
    token,
  };
}

async function requiereSesion(req, res, next) {
  try {
    const usuario = await sesionActual(req);
    if (!usuario) return next(noAutorizado());
    req.usuario = usuario;
    next();
  } catch (err) {
    next(err);
  }
}

function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return next(noAutorizado());
    if (!roles.includes(req.usuario.rol)) return next(prohibido());
    next();
  };
}

const soloAdmin = requiereRol('admin');

module.exports = { COOKIE, sesionActual, requiereSesion, requiereRol, soloAdmin };
