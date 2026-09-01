const express = require('express');
const db = require('../db');
const config = require('../lib/config');
const auditoria = require('../lib/auditoria');
const { asyncRuta } = require('../lib/ruta');
const { malPedido } = require('../lib/errors');
const { soloAdmin } = require('../middleware/auth');

const router = express.Router();

router.get(
  '/',
  asyncRuta(async (req, res) => {
    const valores = await config.todo();
    const tramos = await db.query('SELECT * FROM recargo_tramos ORDER BY cuotas_desde');
    res.json({ valores, tramos_recargo: tramos });
  })
);

router.put(
  '/',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const cambios = req.body || {};
    if (cambios.modalidad_credito && !['cuotas_fijas', 'libreta'].includes(cambios.modalidad_credito)) {
      throw malPedido('Modalidad de credito invalida');
    }
    const permitidas = Object.keys(config.DEFAULTS);
    const filtrados = {};
    for (const [k, v] of Object.entries(cambios)) if (permitidas.includes(k)) filtrados[k] = v;
    const valores = await config.guardar(filtrados);
    await auditoria.registrar(req, 'config_editar', 'config', null, filtrados);
    res.json(valores);
  })
);

router.put(
  '/tramos-recargo',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const tramos = Array.isArray(req.body) ? req.body : req.body.tramos;
    if (!Array.isArray(tramos)) throw malPedido('Se espera una lista de tramos');
    await db.transaccion(async (conn) => {
      await conn.query('DELETE FROM recargo_tramos');
      for (const t of tramos) {
        await conn.query(
          'INSERT INTO recargo_tramos (cuotas_desde, cuotas_hasta, porcentaje) VALUES (?, ?, ?)',
          [Number(t.cuotas_desde), Number(t.cuotas_hasta), Number(t.porcentaje)]
        );
      }
    });
    await auditoria.registrar(req, 'config_tramos', 'recargo_tramos', null, { cantidad: tramos.length });
    res.json(await db.query('SELECT * FROM recargo_tramos ORDER BY cuotas_desde'));
  })
);

// Backup logico: volcado de las tablas de datos en JSON (solo admin). Va por
// POST para que no se dispare con una simple navegacion desde otro sitio.
router.post(
  '/backup',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const tablas = [
      'config', 'usuarios', 'usuario_menus', 'categorias', 'productos', 'presentaciones',
      'movimientos_stock', 'clientes', 'proveedores', 'cc_movimientos', 'ventas', 'venta_items',
      'cuotas', 'libretas', 'libreta_movimientos', 'pagos', 'pago_aplicaciones', 'compras',
      'compra_items', 'categorias_gasto', 'gastos', 'presupuestos', 'presupuesto_items',
      'devoluciones', 'devolucion_items', 'cajas', 'caja_movimientos', 'timbrados', 'facturas',
      'recargo_tramos',
    ];
    const backup = { generado_en: new Date().toISOString(), tablas: {} };
    for (const tabla of tablas) backup.tablas[tabla] = await db.query(`SELECT * FROM ${tabla}`);
    await auditoria.registrar(req, 'backup', 'config');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${Date.now()}.json"`);
    res.json(backup);
  })
);

module.exports = router;
