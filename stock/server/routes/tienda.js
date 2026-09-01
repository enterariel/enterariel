const express = require('express');
const db = require('../db');
const config = require('../lib/config');
const { asyncRuta } = require('../lib/ruta');
const { noEncontrado } = require('../lib/errors');

const router = express.Router();

// Catalogo publico sin login: no toca stock, cuenta corriente ni caja.
// El pedido se cierra por WhatsApp.
router.get(
  '/',
  asyncRuta(async (req, res) => {
    const cfg = await config.todo();
    if (cfg.tienda_activa !== '1') throw noEncontrado('La tienda no esta habilitada');

    const q = String(req.query.q || '').trim();
    const where = ['p.activo = 1', 'p.publicado = 1', 'p.stock > 0'];
    const params = [];
    if (q) { where.push('p.nombre LIKE ?'); params.push(`%${q}%`); }

    const productos = await db.query(
      `SELECT p.id, p.nombre, p.foto_url, c.nombre AS categoria
         FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE ${where.join(' AND ')} ORDER BY p.nombre LIMIT 200`,
      params
    );
    if (productos.length) {
      const ids = productos.map((p) => p.id);
      const presentaciones = await db.query(
        `SELECT id, producto_id, nombre, factor, precio FROM presentaciones
          WHERE activo = 1 AND producto_id IN (${ids.map(() => '?').join(',')}) ORDER BY factor`,
        ids
      );
      for (const p of productos) p.presentaciones = presentaciones.filter((x) => x.producto_id === p.id);
    }

    res.json({
      negocio: { nombre: cfg.negocio_nombre, telefono: cfg.negocio_telefono, whatsapp: cfg.tienda_whatsapp },
      productos,
    });
  })
);

module.exports = router;
