const express = require('express');
const db = require('../db');
const ventasLib = require('../lib/ventas');
const devolucionesLib = require('../lib/devoluciones');
const credito = require('../lib/credito');
const facturacion = require('../lib/facturacion');
const config = require('../lib/config');
const auditoria = require('../lib/auditoria');
const { asyncRuta } = require('../lib/ruta');
const { malPedido, noEncontrado } = require('../lib/errors');

const router = express.Router();

async function cajaAbierta(usuarioId) {
  return db.uno("SELECT * FROM cajas WHERE usuario_id = ? AND estado = 'abierta' ORDER BY id DESC LIMIT 1", [usuarioId]);
}

// Previsualizacion del plan de credito. El servidor la recalcula al confirmar.
router.post(
  '/simular-credito',
  asyncRuta(async (req, res) => {
    const { total, entrega = 0, cuotas = 1, frecuencia = null } = req.body || {};
    res.json(await credito.simular({ total, entrega, cuotas, frecuencia }));
  })
);

router.post(
  '/',
  asyncRuta(async (req, res) => {
    const caja = await cajaAbierta(req.usuario.id);
    const resultado = await db.transaccion((conn) =>
      ventasLib.crear(conn, { ...req.body, caja_id: caja ? caja.id : null }, req.usuario)
    );
    await auditoria.registrar(req, 'venta_crear', 'venta', resultado.venta_id, {
      numero: resultado.numero,
      total: resultado.total,
    });
    res.status(201).json(resultado);
  })
);

router.get(
  '/',
  asyncRuta(async (req, res) => {
    const { desde, hasta, cliente_id, usuario_id, estado, condicion, limite = 200 } = req.query;
    const where = ['1=1'];
    const params = [];
    if (desde) { where.push('v.fecha >= ?'); params.push(`${desde} 00:00:00`); }
    if (hasta) { where.push('v.fecha <= ?'); params.push(`${hasta} 23:59:59`); }
    if (cliente_id) { where.push('v.cliente_id = ?'); params.push(Number(cliente_id)); }
    if (usuario_id) { where.push('v.usuario_id = ?'); params.push(Number(usuario_id)); }
    if (estado) { where.push('v.estado = ?'); params.push(estado); }
    if (condicion) { where.push('v.condicion = ?'); params.push(condicion); }
    res.json(
      await db.query(
        `SELECT v.*, c.nombre AS cliente_nombre, u.nombre AS vendedor, f.numero_formateado AS factura
           FROM ventas v
           LEFT JOIN clientes c ON c.id = v.cliente_id
           LEFT JOIN usuarios u ON u.id = v.usuario_id
           LEFT JOIN facturas f ON f.venta_id = v.id
          WHERE ${where.join(' AND ')} ORDER BY v.id DESC LIMIT ?`,
        [...params, Number(limite)]
      )
    );
  })
);

// Datos completos del ticket / factura.
router.get(
  '/:id',
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const venta = await db.uno(
      `SELECT v.*, c.nombre AS cliente_nombre, c.documento AS cliente_documento, c.direccion AS cliente_direccion,
              u.nombre AS vendedor
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN usuarios u ON u.id = v.usuario_id
        WHERE v.id = ?`,
      [id]
    );
    if (!venta) throw noEncontrado('Venta no encontrada');

    const items = await db.query('SELECT * FROM venta_items WHERE venta_id = ? ORDER BY id', [id]);
    const cuotas = await db.query('SELECT * FROM cuotas WHERE venta_id = ? ORDER BY numero', [id]);
    const factura = await db.uno('SELECT * FROM facturas WHERE venta_id = ?', [id]);
    const devoluciones = await db.query('SELECT * FROM devoluciones WHERE venta_id = ? ORDER BY id', [id]);
    for (const d of devoluciones) {
      d.items = await db.query(
        `SELECT di.*, vi.producto_nombre, vi.presentacion_nombre
           FROM devolucion_items di JOIN venta_items vi ON vi.id = di.venta_item_id
          WHERE di.devolucion_id = ?`,
        [d.id]
      );
    }

    // Discriminacion de IVA congelada al momento de la venta.
    const iva = { 10: 0, 5: 0, 0: 0 };
    for (const i of items) iva[Number(i.iva)] = (iva[Number(i.iva)] || 0) + Number(i.iva_monto);

    const cfg = await config.todo();
    res.json({
      ...venta,
      items,
      cuotas,
      factura,
      devoluciones,
      iva,
      negocio: {
        nombre: cfg.negocio_nombre,
        ruc: cfg.negocio_ruc,
        direccion: cfg.negocio_direccion,
        telefono: cfg.negocio_telefono,
      },
    });
  })
);

router.post(
  '/:id/anular',
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const caja = await cajaAbierta(req.usuario.id);
    const resultado = await db.transaccion(async (conn) => {
      const [filas] = await conn.query('SELECT * FROM ventas WHERE id = ? FOR UPDATE', [id]);
      if (!filas.length) throw noEncontrado('Venta no encontrada');
      const venta = filas[0];
      devolucionesLib.verificarPermiso(venta, req.usuario);
      return devolucionesLib.anular(conn, venta, req.body ? req.body.motivo : null, req.usuario, caja ? caja.id : null);
    });
    await auditoria.registrar(req, 'venta_anular', 'venta', id, req.body);
    res.json(resultado);
  })
);

router.post(
  '/:id/devoluciones',
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const { items, motivo = null } = req.body || {};
    if (!items) throw malPedido('Faltan los items a devolver');
    const caja = await cajaAbierta(req.usuario.id);
    const resultado = await db.transaccion(async (conn) => {
      const [filas] = await conn.query('SELECT * FROM ventas WHERE id = ? FOR UPDATE', [id]);
      if (!filas.length) throw noEncontrado('Venta no encontrada');
      const venta = filas[0];
      devolucionesLib.verificarPermiso(venta, req.usuario);
      return devolucionesLib.devolverParcial(conn, venta, items, motivo, req.usuario, caja ? caja.id : null);
    });
    await auditoria.registrar(req, 'venta_devolucion', 'venta', id, { motivo, items });
    res.status(201).json(resultado);
  })
);

// Emite factura legal sobre una venta ya grabada (si hay timbrado vigente).
router.post(
  '/:id/facturar',
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const resultado = await db.transaccion(async (conn) => {
      const [filas] = await conn.query('SELECT * FROM ventas WHERE id = ? FOR UPDATE', [id]);
      if (!filas.length) throw noEncontrado('Venta no encontrada');
      if (filas[0].estado !== 'activa') throw malPedido('La venta esta anulada');
      const [ya] = await conn.query('SELECT id FROM facturas WHERE venta_id = ?', [id]);
      if (ya.length) throw malPedido('La venta ya tiene factura emitida');
      return facturacion.emitir(conn, id);
    });
    await auditoria.registrar(req, 'venta_facturar', 'venta', id, resultado);
    res.status(201).json(resultado);
  })
);

module.exports = router;
