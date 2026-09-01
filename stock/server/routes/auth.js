const express = require('express');
const db = require('../db');
const config = require('../lib/config');
const passwords = require('../lib/passwords');
const auditoria = require('../lib/auditoria');
const { asyncRuta } = require('../lib/ruta');
const { malPedido, noAutorizado } = require('../lib/errors');
const { COOKIE, sesionActual, requiereSesion } = require('../middleware/auth');

const router = express.Router();

const INTENTOS_MAX = 5;
const BLOQUEO_MINUTOS = 5;
const enProduccion = () => process.env.NODE_ENV === 'production';

router.post(
  '/login',
  asyncRuta(async (req, res) => {
    const { usuario, password } = req.body || {};
    if (!usuario || !password) throw malPedido('Usuario y contrasena son obligatorios');

    const fila = await db.uno('SELECT * FROM usuarios WHERE usuario = ?', [String(usuario).trim()]);
    if (!fila || !fila.activo) throw noAutorizado('Usuario o contrasena incorrectos');

    // El freno a fuerza bruta solo corre en produccion para no estorbar en desarrollo.
    if (enProduccion() && fila.bloqueado_hasta && new Date(fila.bloqueado_hasta) > new Date()) {
      throw noAutorizado(`Cuenta bloqueada temporalmente. Reintenta en unos minutos.`);
    }

    if (!passwords.verificar(password, fila.salt, fila.pass_hash)) {
      const intentos = Number(fila.intentos_fallidos) + 1;
      const bloquear = enProduccion() && intentos >= INTENTOS_MAX;
      await db.ejecutar(
        'UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?',
        [bloquear ? 0 : intentos, bloquear ? new Date(Date.now() + BLOQUEO_MINUTOS * 60000) : null, fila.id]
      );
      throw noAutorizado('Usuario o contrasena incorrectos');
    }

    const horas = Number(await config.obtener('sesion_horas')) || 12;
    const token = passwords.tokenSesion();
    await db.ejecutar('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?', [fila.id]);
    await db.ejecutar('INSERT INTO sesiones (token, usuario_id, expira_en) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))', [
      token,
      fila.id,
      horas,
    ]);

    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: enProduccion(),
      maxAge: horas * 3600 * 1000,
    });

    req.usuario = { id: fila.id };
    await auditoria.registrar(req, 'login', 'usuario', fila.id);

    const menus = await db.query('SELECT menu FROM usuario_menus WHERE usuario_id = ?', [fila.id]);
    res.json({
      usuario: { id: fila.id, usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol, menus: menus.map((m) => m.menu) },
    });
  })
);

router.get(
  '/yo',
  asyncRuta(async (req, res) => {
    const usuario = await sesionActual(req);
    if (!usuario) return res.status(401).json({ error: 'Sesion no valida' });
    const cfg = await config.todo();
    res.json({
      usuario,
      config: {
        negocio_nombre: cfg.negocio_nombre,
        modalidad_credito: cfg.modalidad_credito,
        moneda_simbolo: cfg.moneda_simbolo,
        inactividad_minutos: Number(cfg.inactividad_minutos),
      },
    });
  })
);

router.post(
  '/logout',
  requiereSesion,
  asyncRuta(async (req, res) => {
    await db.ejecutar('UPDATE sesiones SET cerrada = 1 WHERE token = ?', [req.usuario.token]);
    await auditoria.registrar(req, 'logout', 'usuario', req.usuario.id);
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  })
);

module.exports = router;
