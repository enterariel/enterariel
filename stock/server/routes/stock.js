const express = require('express');
const db = require('../db');
const stockLib = require('../lib/stock');
const csv = require('../lib/csv');
const auditoria = require('../lib/auditoria');
const { asyncRuta } = require('../lib/ruta');
const { malPedido } = require('../lib/errors');
const { soloAdmin, requiereRol } = require('../middleware/auth');

const router = express.Router();

// Kardex: libro mayor de un producto con antes/despues.
router.get(
  '/kardex/:productoId',
  asyncRuta(async (req, res) => {
    const { desde, hasta } = req.query;
    const where = ['producto_id = ?'];
    const params = [Number(req.params.productoId)];
    if (desde) { where.push('fecha >= ?'); params.push(`${desde} 00:00:00`); }
    if (hasta) { where.push('fecha <= ?'); params.push(`${hasta} 23:59:59`); }
    const filas = await db.query(
      `SELECT m.*, u.nombre AS usuario_nombre FROM movimientos_stock m
         LEFT JOIN usuarios u ON u.id = m.usuario_id
        WHERE ${where.join(' AND ')} ORDER BY m.id DESC LIMIT 1000`,
      params
    );
    res.json(filas);
  })
);

router.get(
  '/movimientos',
  asyncRuta(async (req, res) => {
    const { desde, hasta, origen } = req.query;
    const where = ['1=1'];
    const params = [];
    if (desde) { where.push('m.fecha >= ?'); params.push(`${desde} 00:00:00`); }
    if (hasta) { where.push('m.fecha <= ?'); params.push(`${hasta} 23:59:59`); }
    if (origen) { where.push('m.origen = ?'); params.push(origen); }
    res.json(
      await db.query(
        `SELECT m.*, p.nombre AS producto_nombre, u.nombre AS usuario_nombre
           FROM movimientos_stock m
           JOIN productos p ON p.id = m.producto_id
           LEFT JOIN usuarios u ON u.id = m.usuario_id
          WHERE ${where.join(' AND ')} ORDER BY m.id DESC LIMIT 500`,
        params
      )
    );
  })
);

// Ajuste manual (solo admin): fija el stock a un valor contado.
router.post(
  '/ajustes',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const { producto_id, cantidad_final, motivo = 'Ajuste manual' } = req.body || {};
    if (!producto_id || cantidad_final === undefined) throw malPedido('Producto y cantidad final son obligatorios');

    const resultado = await db.transaccion(async (conn) => {
      const productos = await stockLib.bloquear(conn, [producto_id]);
      const producto = productos.get(Number(producto_id));
      const delta = Math.trunc(Number(cantidad_final)) - Number(producto.stock);
      if (delta === 0) return { sin_cambios: true, stock: Number(producto.stock) };
      const mov = await stockLib.aplicar(conn, {
        productoId: producto.id,
        cantidad: delta,
        origen: 'ajuste',
        referenciaTipo: 'ajuste',
        usuarioId: req.usuario.id,
        detalle: motivo,
        permitirNegativo: false,
        productoBloqueado: producto,
      });
      return { sin_cambios: false, ...mov };
    });

    await auditoria.registrar(req, 'stock_ajuste', 'producto', Number(producto_id), { cantidad_final, motivo });
    res.json(resultado);
  })
);

// --- conteo fisico ------------------------------------------------------
// Plantilla con todos los productos y la columna de cantidad vacia.
router.get(
  '/conteo/plantilla',
  requiereRol('admin', 'deposito'),
  asyncRuta(async (req, res) => {
    const productos = await db.query(
      'SELECT codigo_interno, nombre, unidad_base, stock FROM productos WHERE activo = 1 ORDER BY nombre'
    );
    const texto = csv.generar(
      [
        { campo: 'codigo_interno', titulo: 'codigo' },
        { campo: 'nombre', titulo: 'nombre' },
        { campo: 'unidad_base', titulo: 'unidad' },
        { campo: 'contado', titulo: 'contado', valor: () => '' },
      ],
      productos
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="conteo-plantilla.csv"');
    res.send(texto);
  })
);

async function analizarConteo(texto) {
  const filas = csv.parsear(texto);
  if (!filas.length) throw malPedido('El archivo no tiene filas');
  const lineas = [];
  for (const fila of filas) {
    const codigo = fila.codigo || fila.codigo_interno || '';
    const crudo = fila.contado ?? fila.cantidad ?? '';
    if (!codigo) { lineas.push({ codigo, estado: 'error', mensaje: 'Fila sin codigo' }); continue; }
    if (String(crudo).trim() === '') { lineas.push({ codigo, estado: 'omitido', mensaje: 'Sin cantidad contada' }); continue; }
    const contado = Number(String(crudo).replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(contado) || contado < 0) {
      lineas.push({ codigo, estado: 'error', mensaje: `Cantidad invalida: ${crudo}` });
      continue;
    }
    const producto = await db.uno('SELECT * FROM productos WHERE codigo_interno = ?', [codigo]);
    if (!producto) { lineas.push({ codigo, estado: 'error', mensaje: 'Producto inexistente' }); continue; }
    const actual = Number(producto.stock);
    const final = Math.trunc(contado);
    lineas.push({
      codigo,
      producto_id: producto.id,
      nombre: producto.nombre,
      stock_actual: actual,
      contado: final,
      diferencia: final - actual,
      estado: final === actual ? 'igual' : 'ajusta',
    });
  }
  return {
    lineas,
    resumen: {
      total: lineas.length,
      ajusta: lineas.filter((l) => l.estado === 'ajusta').length,
      igual: lineas.filter((l) => l.estado === 'igual').length,
      omitido: lineas.filter((l) => l.estado === 'omitido').length,
      error: lineas.filter((l) => l.estado === 'error').length,
    },
  };
}

// Primero se simula; recien despues se aplica.
router.post(
  '/conteo/simular',
  requiereRol('admin', 'deposito'),
  asyncRuta(async (req, res) => {
    const texto = typeof req.body === 'string' ? req.body : req.body.csv;
    if (!texto) throw malPedido('Falta el contenido del CSV');
    res.json(await analizarConteo(texto));
  })
);

router.post(
  '/conteo/aplicar',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const texto = typeof req.body === 'string' ? req.body : req.body.csv;
    if (!texto) throw malPedido('Falta el contenido del CSV');
    const analisis = await analizarConteo(texto);
    if (analisis.resumen.error > 0) throw malPedido('El archivo tiene errores: corregilos antes de aplicar');

    const aplicar = analisis.lineas.filter((l) => l.estado === 'ajusta');
    await db.transaccion(async (conn) => {
      const productos = await stockLib.bloquear(conn, aplicar.map((l) => l.producto_id));
      for (const linea of aplicar) {
        const producto = productos.get(Number(linea.producto_id));
        const delta = linea.contado - Number(producto.stock);
        if (delta === 0) continue;
        await stockLib.aplicar(conn, {
          productoId: producto.id,
          cantidad: delta,
          origen: 'ajuste',
          referenciaTipo: 'conteo',
          usuarioId: req.usuario.id,
          detalle: 'Conteo fisico importado',
          productoBloqueado: producto,
        });
      }
    });

    await auditoria.registrar(req, 'conteo_aplicar', 'stock', null, analisis.resumen);
    res.json({ ok: true, aplicados: aplicar.length, resumen: analisis.resumen });
  })
);

module.exports = router;
