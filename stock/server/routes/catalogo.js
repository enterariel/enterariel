const express = require('express');
const db = require('../db');
const stockLib = require('../lib/stock');
const auditoria = require('../lib/auditoria');
const { asyncRuta } = require('../lib/ruta');
const { malPedido, noEncontrado } = require('../lib/errors');
const { soloAdmin, requiereRol } = require('../middleware/auth');
const { gs } = require('../lib/money');

const router = express.Router();

async function armarProducto(producto) {
  const presentaciones = await db.query(
    'SELECT * FROM presentaciones WHERE producto_id = ? ORDER BY factor',
    [producto.id]
  );
  return {
    ...producto,
    presentaciones,
    desglose: stockLib.desglosar(producto.stock, presentaciones, producto.unidad_base),
    bajo_minimo: Number(producto.stock) <= Number(producto.stock_minimo),
  };
}

async function armarLista(productos) {
  if (!productos.length) return [];
  const ids = productos.map((p) => p.id);
  const presentaciones = await db.query(
    `SELECT * FROM presentaciones WHERE producto_id IN (${ids.map(() => '?').join(',')}) ORDER BY factor`,
    ids
  );
  return productos.map((p) => {
    const suyas = presentaciones.filter((x) => x.producto_id === p.id);
    return {
      ...p,
      presentaciones: suyas,
      desglose: stockLib.desglosar(p.stock, suyas, p.unidad_base),
      bajo_minimo: Number(p.stock) <= Number(p.stock_minimo),
    };
  });
}

// --- categorias ---------------------------------------------------------
router.get('/categorias', asyncRuta(async (req, res) => {
  res.json(await db.query('SELECT * FROM categorias ORDER BY nombre'));
}));

router.post('/categorias', asyncRuta(async (req, res) => {
  const { nombre } = req.body || {};
  if (!nombre) throw malPedido('El nombre es obligatorio');
  const r = await db.ejecutar('INSERT INTO categorias (nombre) VALUES (?)', [nombre.trim()]);
  res.status(201).json({ id: r.insertId, nombre: nombre.trim() });
}));

router.delete('/categorias/:id', soloAdmin, asyncRuta(async (req, res) => {
  await db.ejecutar('DELETE FROM categorias WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
}));

// --- busqueda unica del POS --------------------------------------------
// Acepta codigo de barras de cualquier presentacion, codigo interno o nombre.
router.get(
  '/buscar',
  asyncRuta(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const limite = Math.min(Number(req.query.limite) || 20, 100);
    if (!q) {
      const productos = await db.query('SELECT * FROM productos WHERE activo = 1 ORDER BY nombre LIMIT ?', [limite]);
      return res.json(await armarLista(productos));
    }

    const exacto = await db.uno(
      `SELECT p.* FROM presentaciones pr JOIN productos p ON p.id = pr.producto_id
        WHERE pr.codigo_barras = ? AND p.activo = 1 LIMIT 1`,
      [q]
    );
    if (exacto) {
      const armado = await armarProducto(exacto);
      const presentacion = armado.presentaciones.find((pr) => pr.codigo_barras === q);
      return res.json([{ ...armado, presentacion_sugerida_id: presentacion ? presentacion.id : null }]);
    }

    const like = `%${q}%`;
    const productos = await db.query(
      `SELECT * FROM productos
        WHERE activo = 1 AND (codigo_interno = ? OR codigo_interno LIKE ? OR nombre LIKE ?)
        ORDER BY (codigo_interno = ?) DESC, nombre LIMIT ?`,
      [q, like, like, q, limite]
    );
    res.json(await armarLista(productos));
  })
);

// --- productos ----------------------------------------------------------
router.get(
  '/productos',
  asyncRuta(async (req, res) => {
    const { categoria_id, bajo_minimo, incluir_inactivos } = req.query;
    const where = [];
    const params = [];
    if (!incluir_inactivos) where.push('activo = 1');
    if (categoria_id) { where.push('categoria_id = ?'); params.push(Number(categoria_id)); }
    if (bajo_minimo) where.push('stock <= stock_minimo');
    const productos = await db.query(
      `SELECT * FROM productos ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY nombre`,
      params
    );
    res.json(await armarLista(productos));
  })
);

router.get(
  '/productos/:id',
  asyncRuta(async (req, res) => {
    const producto = await db.uno('SELECT * FROM productos WHERE id = ?', [Number(req.params.id)]);
    if (!producto) throw noEncontrado('Producto no encontrado');
    res.json(await armarProducto(producto));
  })
);

router.post(
  '/productos',
  requiereRol('admin', 'deposito'),
  asyncRuta(async (req, res) => {
    const {
      codigo_interno, nombre, categoria_id = null, unidad_base = 'Unidad', stock_minimo = 0,
      costo_unitario = 0, margen = null, iva = 10, foto_url = null, publicado = 1,
      stock_inicial = 0, presentaciones = [],
    } = req.body || {};
    if (!codigo_interno || !nombre) throw malPedido('Codigo interno y nombre son obligatorios');

    const id = await db.transaccion(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO productos
          (codigo_interno, nombre, categoria_id, unidad_base, stock, stock_minimo, costo_unitario, margen, iva, foto_url, publicado)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
        [String(codigo_interno).trim(), nombre.trim(), categoria_id || null, unidad_base,
          Number(stock_minimo), Number(costo_unitario), margen === null || margen === '' ? null : Number(margen),
          Number(iva), foto_url, publicado ? 1 : 0]
      );
      const productoId = r.insertId;

      const lista = presentaciones.length
        ? presentaciones
        : [{ nombre: unidad_base, factor: 1, precio: 0, es_base: 1 }];
      let hayBase = false;
      for (const p of lista) {
        const factor = Math.max(1, Number(p.factor) || 1);
        if (factor === 1) hayBase = true;
        await conn.query(
          `INSERT INTO presentaciones (producto_id, nombre, factor, codigo_barras, precio, es_base)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [productoId, p.nombre || unidad_base, factor, p.codigo_barras || null, gs(p.precio || 0), factor === 1 ? 1 : 0]
        );
      }
      if (!hayBase) {
        await conn.query(
          'INSERT INTO presentaciones (producto_id, nombre, factor, precio, es_base) VALUES (?, ?, 1, 0, 1)',
          [productoId, unidad_base]
        );
      }

      if (Number(stock_inicial) > 0) {
        const [prod] = await conn.query('SELECT * FROM productos WHERE id = ? FOR UPDATE', [productoId]);
        await stockLib.aplicar(conn, {
          productoId,
          cantidad: Number(stock_inicial),
          origen: 'inicial',
          referenciaTipo: 'producto',
          referenciaId: productoId,
          usuarioId: req.usuario.id,
          detalle: 'Carga inicial',
          productoBloqueado: prod[0],
        });
      }
      return productoId;
    });

    await auditoria.registrar(req, 'producto_crear', 'producto', id, { codigo_interno, nombre });
    const producto = await db.uno('SELECT * FROM productos WHERE id = ?', [id]);
    res.status(201).json(await armarProducto(producto));
  })
);

router.put(
  '/productos/:id',
  requiereRol('admin', 'deposito'),
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const actual = await db.uno('SELECT * FROM productos WHERE id = ?', [id]);
    if (!actual) throw noEncontrado('Producto no encontrado');
    const b = req.body || {};
    // El stock no se toca desde aca: se ajusta por movimiento (compra, ajuste, venta).
    await db.ejecutar(
      `UPDATE productos SET codigo_interno = ?, nombre = ?, categoria_id = ?, unidad_base = ?,
              stock_minimo = ?, costo_unitario = ?, margen = ?, iva = ?, foto_url = ?, publicado = ?, activo = ?
        WHERE id = ?`,
      [
        b.codigo_interno ?? actual.codigo_interno,
        b.nombre ?? actual.nombre,
        b.categoria_id === undefined ? actual.categoria_id : (b.categoria_id || null),
        b.unidad_base ?? actual.unidad_base,
        Number(b.stock_minimo ?? actual.stock_minimo),
        Number(b.costo_unitario ?? actual.costo_unitario),
        b.margen === undefined ? actual.margen : (b.margen === null || b.margen === '' ? null : Number(b.margen)),
        Number(b.iva ?? actual.iva),
        b.foto_url === undefined ? actual.foto_url : b.foto_url,
        (b.publicado ?? actual.publicado) ? 1 : 0,
        (b.activo ?? actual.activo) ? 1 : 0,
        id,
      ]
    );
    await auditoria.registrar(req, 'producto_editar', 'producto', id, b);
    const producto = await db.uno('SELECT * FROM productos WHERE id = ?', [id]);
    res.json(await armarProducto(producto));
  })
);

router.delete(
  '/productos/:id',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const vendido = await db.uno('SELECT COUNT(*) AS n FROM venta_items WHERE producto_id = ?', [id]);
    if (Number(vendido.n) > 0) {
      // Nada se borra si tiene historia: se desactiva.
      await db.ejecutar('UPDATE productos SET activo = 0 WHERE id = ?', [id]);
      await auditoria.registrar(req, 'producto_desactivar', 'producto', id);
      return res.json({ ok: true, desactivado: true });
    }
    await db.ejecutar('DELETE FROM productos WHERE id = ?', [id]);
    await auditoria.registrar(req, 'producto_borrar', 'producto', id);
    res.json({ ok: true, borrado: true });
  })
);

// --- presentaciones -----------------------------------------------------
router.post(
  '/productos/:id/presentaciones',
  requiereRol('admin', 'deposito'),
  asyncRuta(async (req, res) => {
    const productoId = Number(req.params.id);
    const { nombre, factor, codigo_barras = null, precio = 0 } = req.body || {};
    if (!nombre || !factor) throw malPedido('Nombre y factor son obligatorios');
    const r = await db.ejecutar(
      'INSERT INTO presentaciones (producto_id, nombre, factor, codigo_barras, precio, es_base) VALUES (?, ?, ?, ?, ?, ?)',
      [productoId, nombre, Math.max(1, Number(factor)), codigo_barras || null, gs(precio), Number(factor) === 1 ? 1 : 0]
    );
    await auditoria.registrar(req, 'presentacion_crear', 'presentacion', r.insertId, { productoId, nombre, factor });
    res.status(201).json({ id: r.insertId });
  })
);

router.put(
  '/presentaciones/:id',
  requiereRol('admin', 'deposito'),
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const actual = await db.uno('SELECT * FROM presentaciones WHERE id = ?', [id]);
    if (!actual) throw noEncontrado('Presentacion no encontrada');
    const b = req.body || {};
    await db.ejecutar(
      'UPDATE presentaciones SET nombre = ?, factor = ?, codigo_barras = ?, precio = ?, activo = ? WHERE id = ?',
      [
        b.nombre ?? actual.nombre,
        Math.max(1, Number(b.factor ?? actual.factor)),
        b.codigo_barras === undefined ? actual.codigo_barras : (b.codigo_barras || null),
        gs(b.precio ?? actual.precio),
        (b.activo ?? actual.activo) ? 1 : 0,
        id,
      ]
    );
    await auditoria.registrar(req, 'presentacion_editar', 'presentacion', id, b);
    res.json({ ok: true });
  })
);

router.delete(
  '/presentaciones/:id',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const pres = await db.uno('SELECT * FROM presentaciones WHERE id = ?', [id]);
    if (!pres) throw noEncontrado('Presentacion no encontrada');
    if (Number(pres.factor) === 1) throw malPedido('No se puede borrar la presentacion de unidad base');
    await db.ejecutar('UPDATE presentaciones SET activo = 0 WHERE id = ?', [id]);
    await auditoria.registrar(req, 'presentacion_baja', 'presentacion', id);
    res.json({ ok: true });
  })
);

module.exports = router;
