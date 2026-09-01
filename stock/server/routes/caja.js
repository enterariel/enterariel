const express = require('express');
const db = require('../db');
const auditoria = require('../lib/auditoria');
const { asyncRuta } = require('../lib/ruta');
const { malPedido, noEncontrado, prohibido } = require('../lib/errors');
const { gs } = require('../lib/money');
const { soloAdmin } = require('../middleware/auth');

const router = express.Router();

// Esperado = fondo + entregas del admin + ventas contado en efectivo
//          + entregas iniciales de credito en efectivo - devoluciones - gastos.
// Las cobranzas de cuenta corriente quedan deliberadamente fuera del arqueo.
async function calcularEsperado(cajaId) {
  const fila = await db.uno(
    `SELECT
        COALESCE(SUM(CASE WHEN tipo IN ('fondo','entrega','venta','entrega_inicial') THEN monto ELSE 0 END), 0) AS entradas,
        COALESCE(SUM(CASE WHEN tipo IN ('devolucion','gasto') THEN monto ELSE 0 END), 0) AS salidas
       FROM caja_movimientos WHERE caja_id = ?`,
    [cajaId]
  );
  return gs(Number(fila.entradas) - Number(fila.salidas));
}

async function detalleCaja(caja) {
  const movimientos = await db.query('SELECT * FROM caja_movimientos WHERE caja_id = ? ORDER BY id', [caja.id]);
  const resumen = {};
  for (const m of movimientos) resumen[m.tipo] = gs((resumen[m.tipo] || 0) + Number(m.monto));
  return {
    ...caja,
    movimientos,
    resumen,
    esperado_actual: caja.estado === 'abierta' ? await calcularEsperado(caja.id) : Number(caja.esperado),
  };
}

router.get(
  '/actual',
  asyncRuta(async (req, res) => {
    const caja = await db.uno("SELECT * FROM cajas WHERE usuario_id = ? AND estado = 'abierta' ORDER BY id DESC LIMIT 1", [
      req.usuario.id,
    ]);
    if (!caja) return res.json(null);
    res.json(await detalleCaja(caja));
  })
);

router.post(
  '/abrir',
  asyncRuta(async (req, res) => {
    const { fondo_inicial = 0 } = req.body || {};
    const abierta = await db.uno("SELECT id FROM cajas WHERE usuario_id = ? AND estado = 'abierta'", [req.usuario.id]);
    if (abierta) throw malPedido('Ya tenes una caja abierta');

    const caja = await db.transaccion(async (conn) => {
      const [r] = await conn.query('INSERT INTO cajas (usuario_id, fondo_inicial) VALUES (?, ?)', [
        req.usuario.id, gs(fondo_inicial),
      ]);
      if (gs(fondo_inicial) > 0) {
        await conn.query(
          "INSERT INTO caja_movimientos (caja_id, tipo, monto, detalle, usuario_id) VALUES (?, 'fondo', ?, 'Fondo inicial', ?)",
          [r.insertId, gs(fondo_inicial), req.usuario.id]
        );
      }
      return r.insertId;
    });
    await auditoria.registrar(req, 'caja_abrir', 'caja', caja, { fondo_inicial });
    res.status(201).json(await detalleCaja(await db.uno('SELECT * FROM cajas WHERE id = ?', [caja])));
  })
);

// El admin le entrega plata al vendedor durante el turno (para vuelto).
router.post(
  '/:id/entregas',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const cajaId = Number(req.params.id);
    const { monto, detalle = 'Entrega de efectivo' } = req.body || {};
    if (gs(monto) <= 0) throw malPedido('El monto debe ser mayor a cero');
    const caja = await db.uno('SELECT * FROM cajas WHERE id = ?', [cajaId]);
    if (!caja) throw noEncontrado('Caja no encontrada');
    if (caja.estado !== 'abierta') throw malPedido('La caja ya esta cerrada');
    await db.ejecutar(
      "INSERT INTO caja_movimientos (caja_id, tipo, monto, detalle, usuario_id) VALUES (?, 'entrega', ?, ?, ?)",
      [cajaId, gs(monto), detalle, req.usuario.id]
    );
    await auditoria.registrar(req, 'caja_entrega', 'caja', cajaId, { monto });
    res.status(201).json(await detalleCaja(await db.uno('SELECT * FROM cajas WHERE id = ?', [cajaId])));
  })
);

router.post(
  '/:id/cerrar',
  asyncRuta(async (req, res) => {
    const cajaId = Number(req.params.id);
    const { contado, observacion = null } = req.body || {};
    if (contado === undefined) throw malPedido('Falta el efectivo contado');

    const caja = await db.uno('SELECT * FROM cajas WHERE id = ?', [cajaId]);
    if (!caja) throw noEncontrado('Caja no encontrada');
    if (caja.estado !== 'abierta') throw malPedido('La caja ya esta cerrada');
    if (Number(caja.usuario_id) !== Number(req.usuario.id) && req.usuario.rol !== 'admin') {
      throw prohibido('Solo el dueno de la caja o un administrador puede cerrarla');
    }

    const esperado = await calcularEsperado(cajaId);
    const diferencia = gs(Number(contado) - esperado);
    await db.ejecutar(
      "UPDATE cajas SET estado = 'cerrada', cerrada_en = NOW(), esperado = ?, contado = ?, diferencia = ?, observacion = ? WHERE id = ?",
      [esperado, gs(contado), diferencia, observacion, cajaId]
    );
    await auditoria.registrar(req, 'caja_cerrar', 'caja', cajaId, { esperado, contado: gs(contado), diferencia });
    res.json(await detalleCaja(await db.uno('SELECT * FROM cajas WHERE id = ?', [cajaId])));
  })
);

router.get(
  '/',
  asyncRuta(async (req, res) => {
    const { usuario_id, desde, hasta } = req.query;
    const where = ['1=1'];
    const params = [];
    if (usuario_id) { where.push('c.usuario_id = ?'); params.push(Number(usuario_id)); }
    else if (req.usuario.rol !== 'admin') { where.push('c.usuario_id = ?'); params.push(req.usuario.id); }
    if (desde) { where.push('c.abierta_en >= ?'); params.push(`${desde} 00:00:00`); }
    if (hasta) { where.push('c.abierta_en <= ?'); params.push(`${hasta} 23:59:59`); }
    res.json(
      await db.query(
        `SELECT c.*, u.nombre AS usuario_nombre FROM cajas c JOIN usuarios u ON u.id = c.usuario_id
          WHERE ${where.join(' AND ')} ORDER BY c.id DESC LIMIT 200`,
        params
      )
    );
  })
);

router.get(
  '/:id',
  asyncRuta(async (req, res) => {
    const caja = await db.uno('SELECT * FROM cajas WHERE id = ?', [Number(req.params.id)]);
    if (!caja) throw noEncontrado('Caja no encontrada');
    res.json(await detalleCaja(caja));
  })
);

module.exports = router;
