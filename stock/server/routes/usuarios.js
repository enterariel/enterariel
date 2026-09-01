const express = require('express');
const db = require('../db');
const passwords = require('../lib/passwords');
const auditoria = require('../lib/auditoria');
const { asyncRuta } = require('../lib/ruta');
const { malPedido, noEncontrado } = require('../lib/errors');
const { soloAdmin } = require('../middleware/auth');

const router = express.Router();

const MENUS = [
  'tablero', 'pos', 'ventas', 'presupuestos', 'stock', 'catalogo', 'compras', 'proveedores',
  'clientes', 'creditos', 'caja', 'gastos', 'reportes', 'usuarios', 'config',
];

router.get('/menus-disponibles', (req, res) => res.json(MENUS));

router.get(
  '/',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const filas = await db.query('SELECT id, usuario, nombre, rol, activo, creado_en FROM usuarios ORDER BY nombre');
    const menus = await db.query('SELECT usuario_id, menu FROM usuario_menus');
    res.json(
      filas.map((u) => ({ ...u, menus: menus.filter((m) => m.usuario_id === u.id).map((m) => m.menu) }))
    );
  })
);

router.post(
  '/',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const { usuario, nombre, rol = 'vendedor', password, menus = [] } = req.body || {};
    if (!usuario || !nombre || !password) throw malPedido('Usuario, nombre y contrasena son obligatorios');
    if (!['admin', 'vendedor', 'deposito'].includes(rol)) throw malPedido('Rol invalido');

    const sal = passwords.generarSal();
    const hash = passwords.hashear(password, sal);
    const resultado = await db.ejecutar(
      'INSERT INTO usuarios (usuario, nombre, rol, pass_hash, salt) VALUES (?, ?, ?, ?, ?)',
      [String(usuario).trim(), nombre, rol, hash, sal]
    );
    for (const menu of menus.filter((m) => MENUS.includes(m))) {
      await db.ejecutar('INSERT IGNORE INTO usuario_menus (usuario_id, menu) VALUES (?, ?)', [resultado.insertId, menu]);
    }
    await auditoria.registrar(req, 'usuario_crear', 'usuario', resultado.insertId, { usuario, rol });
    res.status(201).json({ id: resultado.insertId });
  })
);

router.put(
  '/:id',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const actual = await db.uno('SELECT * FROM usuarios WHERE id = ?', [id]);
    if (!actual) throw noEncontrado('Usuario no encontrado');

    const { nombre = actual.nombre, rol = actual.rol, activo = actual.activo, password, menus } = req.body || {};
    await db.ejecutar('UPDATE usuarios SET nombre = ?, rol = ?, activo = ? WHERE id = ?', [
      nombre,
      rol,
      activo ? 1 : 0,
      id,
    ]);
    if (password) {
      const sal = passwords.generarSal();
      await db.ejecutar('UPDATE usuarios SET salt = ?, pass_hash = ? WHERE id = ?', [
        sal,
        passwords.hashear(password, sal),
        id,
      ]);
      await db.ejecutar('UPDATE sesiones SET cerrada = 1 WHERE usuario_id = ?', [id]);
    }
    if (Array.isArray(menus)) {
      await db.ejecutar('DELETE FROM usuario_menus WHERE usuario_id = ?', [id]);
      for (const menu of menus.filter((m) => MENUS.includes(m))) {
        await db.ejecutar('INSERT IGNORE INTO usuario_menus (usuario_id, menu) VALUES (?, ?)', [id, menu]);
      }
    }
    await auditoria.registrar(req, 'usuario_editar', 'usuario', id, { nombre, rol, activo });
    res.json({ ok: true });
  })
);

router.get(
  '/auditoria',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const { desde, hasta, usuario_id } = req.query;
    const where = ['1=1'];
    const params = [];
    if (desde) { where.push('a.creado_en >= ?'); params.push(`${desde} 00:00:00`); }
    if (hasta) { where.push('a.creado_en <= ?'); params.push(`${hasta} 23:59:59`); }
    if (usuario_id) { where.push('a.usuario_id = ?'); params.push(Number(usuario_id)); }
    const filas = await db.query(
      `SELECT a.*, u.nombre AS usuario_nombre FROM auditoria a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
        WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT 500`,
      params
    );
    res.json(filas);
  })
);

module.exports = router;
