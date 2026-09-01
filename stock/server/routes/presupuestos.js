const express = require('express');
const db = require('../db');
const ventasLib = require('../lib/ventas');
const auditoria = require('../lib/auditoria');
const { asyncRuta } = require('../lib/ruta');
const { malPedido, noEncontrado } = require('../lib/errors');
const { gs } = require('../lib/money');

const router = express.Router();

router.post(
  '/',
  asyncRuta(async (req, res) => {
    const { cliente_id = null, items = [], validez_dias = 7 } = req.body || {};
    if (!items.length) throw malPedido('El presupuesto no tiene items');

    const resultado = await db.transaccion(async (conn) => {
      // No reserva stock: solo cotiza con los precios y presentaciones actuales.
      const { lineas } = await ventasLib.resolverItems(conn, items, { bloquear: false });
      const total = lineas.reduce((acc, l) => acc + l.importe, 0);
      const [maxRow] = await conn.query('SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM presupuestos');
      const numero = Number(maxRow[0].siguiente);
      const [r] = await conn.query(
        'INSERT INTO presupuestos (numero, cliente_id, usuario_id, total, validez_dias) VALUES (?, ?, ?, ?, ?)',
        [numero, cliente_id, req.usuario.id, gs(total), Number(validez_dias)]
      );
      for (const l of lineas) {
        await conn.query(
          `INSERT INTO presupuesto_items
            (presupuesto_id, producto_id, presentacion_id, producto_nombre, presentacion_nombre, factor, cantidad, precio_unitario, importe)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.insertId, l.producto.id, l.presentacion.id, l.producto.nombre, l.presentacion.nombre, l.factor,
            l.cantidad, l.precio_unitario, l.importe]
        );
      }
      return { presupuesto_id: r.insertId, numero, total: gs(total) };
    });

    await auditoria.registrar(req, 'presupuesto_crear', 'presupuesto', resultado.presupuesto_id, resultado);
    res.status(201).json(resultado);
  })
);

router.get(
  '/',
  asyncRuta(async (req, res) => {
    const { estado, desde, hasta } = req.query;
    const where = ['1=1'];
    const params = [];
    if (estado) { where.push('p.estado = ?'); params.push(estado); }
    if (desde) { where.push('p.fecha >= ?'); params.push(`${desde} 00:00:00`); }
    if (hasta) { where.push('p.fecha <= ?'); params.push(`${hasta} 23:59:59`); }
    res.json(
      await db.query(
        `SELECT p.*, c.nombre AS cliente_nombre, u.nombre AS vendedor FROM presupuestos p
           LEFT JOIN clientes c ON c.id = p.cliente_id
           LEFT JOIN usuarios u ON u.id = p.usuario_id
          WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT 200`,
        params
      )
    );
  })
);

router.get(
  '/:id',
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const presupuesto = await db.uno(
      `SELECT p.*, c.nombre AS cliente_nombre FROM presupuestos p
         LEFT JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?`,
      [id]
    );
    if (!presupuesto) throw noEncontrado('Presupuesto no encontrado');
    presupuesto.items = await db.query('SELECT * FROM presupuesto_items WHERE presupuesto_id = ? ORDER BY id', [id]);
    res.json(presupuesto);
  })
);

router.post(
  '/:id/aprobar',
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const presupuesto = await db.uno('SELECT * FROM presupuestos WHERE id = ?', [id]);
    if (!presupuesto) throw noEncontrado('Presupuesto no encontrado');
    if (presupuesto.estado !== 'pendiente') throw malPedido('Solo se puede aprobar un presupuesto pendiente');
    await db.ejecutar("UPDATE presupuestos SET estado = 'aprobado' WHERE id = ?", [id]);
    await auditoria.registrar(req, 'presupuesto_aprobar', 'presupuesto', id);
    res.json({ ok: true });
  })
);

router.post(
  '/:id/anular',
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    await db.ejecutar("UPDATE presupuestos SET estado = 'anulado' WHERE id = ? AND estado <> 'convertido'", [id]);
    await auditoria.registrar(req, 'presupuesto_anular', 'presupuesto', id);
    res.json({ ok: true });
  })
);

// Convierte el presupuesto en venta real (recien ahi se descuenta stock).
router.post(
  '/:id/convertir',
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const caja = await db.uno("SELECT * FROM cajas WHERE usuario_id = ? AND estado = 'abierta' ORDER BY id DESC LIMIT 1", [
      req.usuario.id,
    ]);

    const resultado = await db.transaccion(async (conn) => {
      const [filas] = await conn.query('SELECT * FROM presupuestos WHERE id = ? FOR UPDATE', [id]);
      if (!filas.length) throw noEncontrado('Presupuesto no encontrado');
      const presupuesto = filas[0];
      if (presupuesto.estado === 'convertido') throw malPedido('El presupuesto ya se convirtio en venta');
      if (presupuesto.estado === 'anulado') throw malPedido('El presupuesto esta anulado');

      const [items] = await conn.query('SELECT * FROM presupuesto_items WHERE presupuesto_id = ?', [id]);
      return ventasLib.crear(
        conn,
        {
          ...req.body,
          cliente_id: req.body.cliente_id || presupuesto.cliente_id,
          items: items.map((i) => ({
            presentacion_id: i.presentacion_id,
            cantidad: i.cantidad,
            precio_unitario: i.precio_unitario,
          })),
          caja_id: caja ? caja.id : null,
          presupuesto_id: id,
        },
        req.usuario
      );
    });

    await auditoria.registrar(req, 'presupuesto_convertir', 'presupuesto', id, { venta_id: resultado.venta_id });
    res.status(201).json(resultado);
  })
);

module.exports = router;
