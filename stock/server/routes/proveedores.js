const express = require('express');
const db = require('../db');
const cuenta = require('../lib/cuenta');
const auditoria = require('../lib/auditoria');
const { asyncRuta } = require('../lib/ruta');
const { malPedido, noEncontrado } = require('../lib/errors');
const { gs } = require('../lib/money');

const router = express.Router();

router.get(
  '/',
  asyncRuta(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const where = ['activo = 1'];
    const params = [];
    if (q) { where.push('(nombre LIKE ? OR ruc LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    res.json(await db.query(`SELECT * FROM proveedores WHERE ${where.join(' AND ')} ORDER BY nombre`, params));
  })
);

router.post(
  '/',
  asyncRuta(async (req, res) => {
    const { nombre, ruc = null, telefono = null } = req.body || {};
    if (!nombre) throw malPedido('El nombre es obligatorio');
    const r = await db.ejecutar('INSERT INTO proveedores (nombre, ruc, telefono) VALUES (?, ?, ?)', [
      nombre.trim(), ruc, telefono,
    ]);
    await auditoria.registrar(req, 'proveedor_crear', 'proveedor', r.insertId, { nombre });
    res.status(201).json(await db.uno('SELECT * FROM proveedores WHERE id = ?', [r.insertId]));
  })
);

router.put(
  '/:id',
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const actual = await db.uno('SELECT * FROM proveedores WHERE id = ?', [id]);
    if (!actual) throw noEncontrado('Proveedor no encontrado');
    const b = req.body || {};
    await db.ejecutar('UPDATE proveedores SET nombre = ?, ruc = ?, telefono = ?, activo = ? WHERE id = ?', [
      b.nombre ?? actual.nombre,
      b.ruc === undefined ? actual.ruc : b.ruc,
      b.telefono === undefined ? actual.telefono : b.telefono,
      (b.activo ?? actual.activo) ? 1 : 0,
      id,
    ]);
    await auditoria.registrar(req, 'proveedor_editar', 'proveedor', id, b);
    res.json(await db.uno('SELECT * FROM proveedores WHERE id = ?', [id]));
  })
);

router.get(
  '/:id',
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const proveedor = await db.uno('SELECT * FROM proveedores WHERE id = ?', [id]);
    if (!proveedor) throw noEncontrado('Proveedor no encontrado');
    const impagas = await db.query(
      "SELECT * FROM compras WHERE proveedor_id = ? AND estado = 'activa' AND pagado < total ORDER BY fecha",
      [id]
    );
    res.json({ ...proveedor, comprobantes_impagos: impagas });
  })
);

router.get(
  '/:id/cuenta',
  asyncRuta(async (req, res) => {
    res.json(
      await db.query(
        "SELECT * FROM cc_movimientos WHERE persona_tipo = 'proveedor' AND persona_id = ? ORDER BY id",
        [Number(req.params.id)]
      )
    );
  })
);

router.post(
  '/:id/pagos',
  asyncRuta(async (req, res) => {
    const proveedorId = Number(req.params.id);
    const { monto, medio = 'efectivo', observacion = null } = req.body || {};
    const importe = gs(monto);
    if (importe <= 0) throw malPedido('El monto debe ser mayor a cero');

    const resultado = await db.transaccion(async (conn) => {
      const [filas] = await conn.query('SELECT * FROM proveedores WHERE id = ? FOR UPDATE', [proveedorId]);
      if (!filas.length) throw noEncontrado('Proveedor no encontrado');
      if (importe > Number(filas[0].saldo)) throw malPedido('No se puede pagar mas de lo adeudado');

      const [pagoRes] = await conn.query(
        'INSERT INTO pagos (persona_tipo, persona_id, monto, medio, usuario_id, observacion) VALUES (?, ?, ?, ?, ?, ?)',
        ['proveedor', proveedorId, importe, medio, req.usuario.id, observacion]
      );
      const pagoId = pagoRes.insertId;

      let restante = importe;
      const [compras] = await conn.query(
        "SELECT * FROM compras WHERE proveedor_id = ? AND estado = 'activa' AND pagado < total ORDER BY fecha, id FOR UPDATE",
        [proveedorId]
      );
      for (const compra of compras) {
        if (restante <= 0) break;
        const pendiente = Number(compra.total) - Number(compra.pagado);
        const aplicado = Math.min(pendiente, restante);
        restante -= aplicado;
        await conn.query('UPDATE compras SET pagado = pagado + ? WHERE id = ?', [aplicado, compra.id]);
        await conn.query('INSERT INTO pago_aplicaciones (pago_id, compra_id, monto) VALUES (?, ?, ?)', [
          pagoId, compra.id, aplicado,
        ]);
      }

      const saldo = await cuenta.asentar(conn, {
        personaTipo: 'proveedor',
        personaId: proveedorId,
        concepto: `Pago a proveedor ${medio}`,
        haber: importe,
        referenciaTipo: 'pago',
        referenciaId: pagoId,
        usuarioId: req.usuario.id,
      });
      return { pago_id: pagoId, saldo, sin_imputar: restante };
    });

    await auditoria.registrar(req, 'proveedor_pago', 'proveedor', proveedorId, { monto: importe, medio });
    res.status(201).json(resultado);
  })
);

module.exports = router;
