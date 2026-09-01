const express = require('express');
const db = require('../db');
const stockLib = require('../lib/stock');
const cuenta = require('../lib/cuenta');
const auditoria = require('../lib/auditoria');
const { asyncRuta } = require('../lib/ruta');
const { malPedido, noEncontrado } = require('../lib/errors');
const { gs } = require('../lib/money');
const { soloAdmin } = require('../middleware/auth');

const router = express.Router();

// Ingreso de mercaderia: actualiza stock, costo por unidad base y, si el producto
// tiene margen, reprecia todas sus presentaciones segun el factor de cada una.
router.post(
  '/',
  asyncRuta(async (req, res) => {
    const { proveedor_id, comprobante = null, condicion = 'contado', items = [] } = req.body || {};
    if (!proveedor_id) throw malPedido('Falta el proveedor');
    if (!Array.isArray(items) || !items.length) throw malPedido('La compra no tiene items');

    const resultado = await db.transaccion(async (conn) => {
      const [prov] = await conn.query('SELECT * FROM proveedores WHERE id = ? FOR UPDATE', [Number(proveedor_id)]);
      if (!prov.length) throw malPedido('El proveedor no existe');

      const detalles = [];
      for (const item of items) {
        const [presRows] = await conn.query('SELECT * FROM presentaciones WHERE id = ?', [Number(item.presentacion_id)]);
        if (!presRows.length) throw malPedido('Presentacion inexistente en una linea');
        const presentacion = presRows[0];
        const cantidad = Math.trunc(Number(item.cantidad));
        if (cantidad <= 0) throw malPedido('Cantidad invalida en una linea');
        const costoPresentacion = gs(item.costo_presentacion);
        detalles.push({
          presentacion,
          cantidad,
          costoPresentacion,
          costoBase: Number((costoPresentacion / Number(presentacion.factor)).toFixed(2)),
          importe: gs(costoPresentacion * cantidad),
        });
      }

      const total = detalles.reduce((acc, d) => acc + d.importe, 0);
      const [compraRes] = await conn.query(
        'INSERT INTO compras (proveedor_id, comprobante, condicion, total, pagado, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
        [Number(proveedor_id), comprobante, condicion, total, condicion === 'contado' ? total : 0, req.usuario.id]
      );
      const compraId = compraRes.insertId;

      const productos = await stockLib.bloquear(conn, detalles.map((d) => Number(d.presentacion.producto_id)));
      const repricing = [];
      for (const d of detalles) {
        const producto = productos.get(Number(d.presentacion.producto_id));
        await conn.query(
          `INSERT INTO compra_items
            (compra_id, producto_id, presentacion_id, presentacion_nombre, factor, cantidad, costo_presentacion, costo_base, importe)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [compraId, producto.id, d.presentacion.id, d.presentacion.nombre, d.presentacion.factor,
            d.cantidad, d.costoPresentacion, d.costoBase, d.importe]
        );
        await stockLib.aplicar(conn, {
          productoId: producto.id,
          cantidad: d.cantidad * Number(d.presentacion.factor),
          origen: 'compra',
          referenciaTipo: 'compra',
          referenciaId: compraId,
          usuarioId: req.usuario.id,
          detalle: `Compra ${compraId} - ${d.cantidad} ${d.presentacion.nombre}`,
          productoBloqueado: producto,
        });
        await conn.query('UPDATE productos SET costo_unitario = ? WHERE id = ?', [d.costoBase, producto.id]);
        producto.costo_unitario = d.costoBase;
        const cambios = await stockLib.repreciar(conn, producto);
        if (cambios.length) repricing.push({ producto_id: producto.id, nombre: producto.nombre, cambios });
      }

      if (condicion === 'credito') {
        await cuenta.asentar(conn, {
          personaTipo: 'proveedor',
          personaId: Number(proveedor_id),
          concepto: `Compra ${comprobante || compraId}`,
          debe: total,
          referenciaTipo: 'compra',
          referenciaId: compraId,
          usuarioId: req.usuario.id,
        });
      }

      return { compra_id: compraId, total, repricing };
    });

    await auditoria.registrar(req, 'compra_crear', 'compra', resultado.compra_id, { total: resultado.total });
    res.status(201).json(resultado);
  })
);

router.get(
  '/',
  asyncRuta(async (req, res) => {
    const { desde, hasta, proveedor_id, estado } = req.query;
    const where = ['1=1'];
    const params = [];
    if (desde) { where.push('c.fecha >= ?'); params.push(`${desde} 00:00:00`); }
    if (hasta) { where.push('c.fecha <= ?'); params.push(`${hasta} 23:59:59`); }
    if (proveedor_id) { where.push('c.proveedor_id = ?'); params.push(Number(proveedor_id)); }
    if (estado) { where.push('c.estado = ?'); params.push(estado); }
    res.json(
      await db.query(
        `SELECT c.*, p.nombre AS proveedor_nombre FROM compras c
           JOIN proveedores p ON p.id = c.proveedor_id
          WHERE ${where.join(' AND ')} ORDER BY c.id DESC LIMIT 200`,
        params
      )
    );
  })
);

router.get(
  '/:id',
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const compra = await db.uno(
      'SELECT c.*, p.nombre AS proveedor_nombre FROM compras c JOIN proveedores p ON p.id = c.proveedor_id WHERE c.id = ?',
      [id]
    );
    if (!compra) throw noEncontrado('Compra no encontrada');
    const items = await db.query(
      `SELECT ci.*, pr.nombre AS producto_nombre FROM compra_items ci
         JOIN productos pr ON pr.id = ci.producto_id WHERE ci.compra_id = ?`,
      [id]
    );
    res.json({ ...compra, items });
  })
);

router.post(
  '/:id/anular',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const resultado = await db.transaccion(async (conn) => {
      const [filas] = await conn.query('SELECT * FROM compras WHERE id = ? FOR UPDATE', [id]);
      if (!filas.length) throw noEncontrado('Compra no encontrada');
      const compra = filas[0];
      if (compra.estado !== 'activa') throw malPedido('La compra ya esta anulada');

      const [items] = await conn.query('SELECT * FROM compra_items WHERE compra_id = ?', [id]);
      const productos = await stockLib.bloquear(conn, items.map((i) => Number(i.producto_id)));
      for (const item of items) {
        await stockLib.aplicar(conn, {
          productoId: item.producto_id,
          cantidad: -Number(item.cantidad) * Number(item.factor),
          origen: 'anulacion',
          referenciaTipo: 'compra',
          referenciaId: id,
          usuarioId: req.usuario.id,
          detalle: `Anulacion de compra ${id}`,
          productoBloqueado: productos.get(Number(item.producto_id)),
        });
      }

      if (compra.condicion === 'credito') {
        const pendiente = Number(compra.total) - Number(compra.pagado);
        if (pendiente > 0) {
          await cuenta.asentar(conn, {
            personaTipo: 'proveedor',
            personaId: compra.proveedor_id,
            concepto: `Anulacion compra ${compra.comprobante || id}`,
            haber: pendiente,
            referenciaTipo: 'compra',
            referenciaId: id,
            usuarioId: req.usuario.id,
          });
        }
      }

      await conn.query("UPDATE compras SET estado = 'anulada', anulada_en = NOW() WHERE id = ?", [id]);
      return { anulada: true };
    });
    await auditoria.registrar(req, 'compra_anular', 'compra', id, req.body);
    res.json(resultado);
  })
);

module.exports = router;
