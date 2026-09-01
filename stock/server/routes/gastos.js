const express = require('express');
const db = require('../db');
const auditoria = require('../lib/auditoria');
const { asyncRuta } = require('../lib/ruta');
const { malPedido } = require('../lib/errors');
const { gs } = require('../lib/money');
const { soloAdmin } = require('../middleware/auth');

const router = express.Router();

// Gastos generales del negocio: no tocan stock ni cuenta corriente.
router.get('/categorias', asyncRuta(async (req, res) => {
  res.json(await db.query('SELECT * FROM categorias_gasto ORDER BY nombre'));
}));

router.post('/categorias', asyncRuta(async (req, res) => {
  const { nombre } = req.body || {};
  if (!nombre) throw malPedido('El nombre es obligatorio');
  const r = await db.ejecutar('INSERT INTO categorias_gasto (nombre) VALUES (?)', [nombre.trim()]);
  res.status(201).json({ id: r.insertId, nombre: nombre.trim() });
}));

router.delete('/categorias/:id', soloAdmin, asyncRuta(async (req, res) => {
  await db.ejecutar('DELETE FROM categorias_gasto WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
}));

router.get(
  '/',
  asyncRuta(async (req, res) => {
    const { desde, hasta, categoria_id } = req.query;
    const where = ['1=1'];
    const params = [];
    if (desde) { where.push('g.fecha >= ?'); params.push(`${desde} 00:00:00`); }
    if (hasta) { where.push('g.fecha <= ?'); params.push(`${hasta} 23:59:59`); }
    if (categoria_id) { where.push('g.categoria_id = ?'); params.push(Number(categoria_id)); }
    res.json(
      await db.query(
        `SELECT g.*, c.nombre AS categoria_nombre, u.nombre AS usuario_nombre FROM gastos g
           LEFT JOIN categorias_gasto c ON c.id = g.categoria_id
           LEFT JOIN usuarios u ON u.id = g.usuario_id
          WHERE ${where.join(' AND ')} ORDER BY g.id DESC LIMIT 300`,
        params
      )
    );
  })
);

router.post(
  '/',
  asyncRuta(async (req, res) => {
    const { descripcion, monto, categoria_id = null, medio = 'efectivo' } = req.body || {};
    if (!descripcion) throw malPedido('La descripcion es obligatoria');
    if (gs(monto) <= 0) throw malPedido('El monto debe ser mayor a cero');

    const caja = await db.uno("SELECT * FROM cajas WHERE usuario_id = ? AND estado = 'abierta' ORDER BY id DESC LIMIT 1", [
      req.usuario.id,
    ]);
    const cajaId = medio === 'efectivo' && caja ? caja.id : null;

    const id = await db.transaccion(async (conn) => {
      const [r] = await conn.query(
        'INSERT INTO gastos (categoria_id, descripcion, monto, medio, caja_id, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
        [categoria_id || null, descripcion, gs(monto), medio, cajaId, req.usuario.id]
      );
      if (cajaId) {
        await conn.query(
          `INSERT INTO caja_movimientos (caja_id, tipo, monto, referencia_tipo, referencia_id, detalle, usuario_id)
           VALUES (?, 'gasto', ?, 'gasto', ?, ?, ?)`,
          [cajaId, gs(monto), r.insertId, descripcion, req.usuario.id]
        );
      }
      return r.insertId;
    });

    await auditoria.registrar(req, 'gasto_crear', 'gasto', id, { descripcion, monto: gs(monto) });
    res.status(201).json({ id });
  })
);

router.delete(
  '/:id',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    await db.transaccion(async (conn) => {
      await conn.query("DELETE FROM caja_movimientos WHERE referencia_tipo = 'gasto' AND referencia_id = ?", [id]);
      await conn.query('DELETE FROM gastos WHERE id = ?', [id]);
    });
    await auditoria.registrar(req, 'gasto_borrar', 'gasto', id);
    res.json({ ok: true });
  })
);

module.exports = router;
