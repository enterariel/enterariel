const express = require('express');
const db = require('../db');
const cuenta = require('../lib/cuenta');
const auditoria = require('../lib/auditoria');
const config = require('../lib/config');
const { asyncRuta } = require('../lib/ruta');
const { malPedido, noEncontrado } = require('../lib/errors');
const { gs } = require('../lib/money');

const router = express.Router();

router.get(
  '/',
  asyncRuta(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const conDeuda = req.query.con_deuda;
    const where = ['activo = 1'];
    const params = [];
    if (q) { where.push('(nombre LIKE ? OR documento LIKE ? OR telefono LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (conDeuda) where.push('saldo > 0');
    res.json(await db.query(`SELECT * FROM clientes WHERE ${where.join(' AND ')} ORDER BY nombre LIMIT 300`, params));
  })
);

router.post(
  '/',
  asyncRuta(async (req, res) => {
    const { nombre, documento = null, telefono = null, direccion = null, limite_credito = 0 } = req.body || {};
    if (!nombre) throw malPedido('El nombre es obligatorio');
    const r = await db.ejecutar(
      'INSERT INTO clientes (nombre, documento, telefono, direccion, limite_credito) VALUES (?, ?, ?, ?, ?)',
      [nombre.trim(), documento, telefono, direccion, gs(limite_credito)]
    );
    await auditoria.registrar(req, 'cliente_crear', 'cliente', r.insertId, { nombre });
    res.status(201).json(await db.uno('SELECT * FROM clientes WHERE id = ?', [r.insertId]));
  })
);

router.put(
  '/:id',
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const actual = await db.uno('SELECT * FROM clientes WHERE id = ?', [id]);
    if (!actual) throw noEncontrado('Cliente no encontrado');
    const b = req.body || {};
    await db.ejecutar(
      'UPDATE clientes SET nombre = ?, documento = ?, telefono = ?, direccion = ?, limite_credito = ?, activo = ? WHERE id = ?',
      [
        b.nombre ?? actual.nombre,
        b.documento === undefined ? actual.documento : b.documento,
        b.telefono === undefined ? actual.telefono : b.telefono,
        b.direccion === undefined ? actual.direccion : b.direccion,
        gs(b.limite_credito ?? actual.limite_credito),
        (b.activo ?? actual.activo) ? 1 : 0,
        id,
      ]
    );
    await auditoria.registrar(req, 'cliente_editar', 'cliente', id, b);
    res.json(await db.uno('SELECT * FROM clientes WHERE id = ?', [id]));
  })
);

router.get(
  '/:id',
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const cliente = await db.uno('SELECT * FROM clientes WHERE id = ?', [id]);
    if (!cliente) throw noEncontrado('Cliente no encontrado');

    const cuotas = await db.query(
      `SELECT c.*, v.numero AS venta_numero FROM cuotas c
         JOIN ventas v ON v.id = c.venta_id
        WHERE v.cliente_id = ? AND c.estado = 'pendiente' AND v.estado = 'activa'
        ORDER BY c.vencimiento`,
      [id]
    );
    const libreta = await db.uno(
      "SELECT * FROM libretas WHERE cliente_id = ? AND estado = 'abierta' ORDER BY id DESC LIMIT 1",
      [id]
    );
    const ultimasVentas = await db.query(
      'SELECT id, numero, fecha, total, condicion, estado FROM ventas WHERE cliente_id = ? ORDER BY id DESC LIMIT 20',
      [id]
    );
    res.json({
      ...cliente,
      cuotas_pendientes: cuotas,
      libreta: libreta ? { ...libreta, saldo: Number(libreta.total) - Number(libreta.pagado) } : null,
      ultimas_ventas: ultimasVentas,
      modalidad_credito: await config.obtener('modalidad_credito'),
    });
  })
);

// Libro mayor del cliente: debe/haber con saldo acumulado por asiento.
router.get(
  '/:id/cuenta',
  asyncRuta(async (req, res) => {
    res.json(
      await db.query(
        "SELECT * FROM cc_movimientos WHERE persona_tipo = 'cliente' AND persona_id = ? ORDER BY id",
        [Number(req.params.id)]
      )
    );
  })
);

router.get(
  '/:id/libretas',
  asyncRuta(async (req, res) => {
    const libretas = await db.query('SELECT * FROM libretas WHERE cliente_id = ? ORDER BY id DESC', [
      Number(req.params.id),
    ]);
    for (const l of libretas) {
      l.saldo = Number(l.total) - Number(l.pagado);
      l.movimientos = await db.query('SELECT * FROM libreta_movimientos WHERE libreta_id = ? ORDER BY id', [l.id]);
    }
    res.json(libretas);
  })
);

// Cobranza: se imputa a las cuotas mas viejas o a la libreta abierta.
// Nunca se puede cobrar mas de lo adeudado (no hay adelantos).
router.post(
  '/:id/pagos',
  asyncRuta(async (req, res) => {
    const clienteId = Number(req.params.id);
    const { monto, medio = 'efectivo', observacion = null } = req.body || {};
    const importe = gs(monto);
    if (importe <= 0) throw malPedido('El monto debe ser mayor a cero');

    const resultado = await db.transaccion(async (conn) => {
      const [filas] = await conn.query('SELECT * FROM clientes WHERE id = ? FOR UPDATE', [clienteId]);
      if (!filas.length) throw noEncontrado('Cliente no encontrado');
      const cliente = filas[0];
      if (importe > Number(cliente.saldo)) {
        throw malPedido(`El cliente debe ${cliente.saldo}: no se admiten pagos a cuenta por encima de la deuda`);
      }

      const [pagoRes] = await conn.query(
        'INSERT INTO pagos (persona_tipo, persona_id, monto, medio, usuario_id, observacion) VALUES (?, ?, ?, ?, ?, ?)',
        ['cliente', clienteId, importe, medio, req.usuario.id, observacion]
      );
      const pagoId = pagoRes.insertId;

      let restante = importe;
      const aplicaciones = [];

      const [cuotas] = await conn.query(
        `SELECT c.* FROM cuotas c JOIN ventas v ON v.id = c.venta_id
          WHERE v.cliente_id = ? AND c.estado = 'pendiente' AND v.estado = 'activa'
          ORDER BY c.vencimiento, c.id FOR UPDATE`,
        [clienteId]
      );
      for (const cuota of cuotas) {
        if (restante <= 0) break;
        const pendiente = Number(cuota.monto) - Number(cuota.pagado);
        if (pendiente <= 0) continue;
        const aplicado = Math.min(pendiente, restante);
        restante -= aplicado;
        const nuevoPagado = Number(cuota.pagado) + aplicado;
        await conn.query('UPDATE cuotas SET pagado = ?, estado = ? WHERE id = ?', [
          nuevoPagado,
          nuevoPagado >= Number(cuota.monto) ? 'pagada' : 'pendiente',
          cuota.id,
        ]);
        await conn.query('INSERT INTO pago_aplicaciones (pago_id, cuota_id, monto) VALUES (?, ?, ?)', [
          pagoId, cuota.id, aplicado,
        ]);
        aplicaciones.push({ tipo: 'cuota', cuota_id: cuota.id, numero: cuota.numero, monto: aplicado });
      }

      if (restante > 0) {
        const libreta = await cuenta.libretaAbierta(conn, clienteId, false);
        if (libreta) {
          const pendiente = Number(libreta.total) - Number(libreta.pagado);
          const aplicado = Math.min(pendiente, restante);
          if (aplicado > 0) {
            restante -= aplicado;
            await cuenta.libretaAsentar(conn, libreta.id, {
              concepto: 'Pago de libreta',
              abono: aplicado,
              referenciaTipo: 'pago',
              referenciaId: pagoId,
            });
            await conn.query('INSERT INTO pago_aplicaciones (pago_id, libreta_id, monto) VALUES (?, ?, ?)', [
              pagoId, libreta.id, aplicado,
            ]);
            aplicaciones.push({ tipo: 'libreta', libreta_id: libreta.id, monto: aplicado });
          }
        }
      }

      const saldo = await cuenta.asentar(conn, {
        personaTipo: 'cliente',
        personaId: clienteId,
        concepto: `Pago ${medio}`,
        haber: importe,
        referenciaTipo: 'pago',
        referenciaId: pagoId,
        usuarioId: req.usuario.id,
      });

      return { pago_id: pagoId, aplicaciones, sin_imputar: restante, saldo };
    });

    await auditoria.registrar(req, 'cliente_pago', 'cliente', clienteId, { monto: importe, medio });
    res.status(201).json(resultado);
  })
);

module.exports = router;
