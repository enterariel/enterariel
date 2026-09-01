const express = require('express');
const db = require('../db');
const { asyncRuta } = require('../lib/ruta');

const router = express.Router();

router.get(
  '/',
  asyncRuta(async (req, res) => {
    const [ventasDia, ventasMes, porCobrar, libretas, porPagar, inventario, criticos, cajaAbierta] = await Promise.all([
      db.uno(
        "SELECT COUNT(*) AS tickets, COALESCE(SUM(total), 0) AS total FROM ventas WHERE estado = 'activa' AND DATE(fecha) = CURDATE()"
      ),
      db.uno(
        `SELECT COUNT(*) AS tickets, COALESCE(SUM(total), 0) AS total FROM ventas
          WHERE estado = 'activa' AND YEAR(fecha) = YEAR(CURDATE()) AND MONTH(fecha) = MONTH(CURDATE())`
      ),
      db.uno('SELECT COALESCE(SUM(saldo), 0) AS total FROM clientes'),
      db.uno("SELECT COALESCE(SUM(total - pagado), 0) AS total FROM libretas WHERE estado = 'abierta'"),
      db.uno('SELECT COALESCE(SUM(saldo), 0) AS total FROM proveedores'),
      db.uno('SELECT COALESCE(SUM(stock * costo_unitario), 0) AS total FROM productos WHERE activo = 1'),
      db.query(
        'SELECT id, nombre, stock, stock_minimo FROM productos WHERE activo = 1 AND stock <= stock_minimo ORDER BY (stock - stock_minimo) LIMIT 20'
      ),
      db.uno("SELECT * FROM cajas WHERE usuario_id = ? AND estado = 'abierta' ORDER BY id DESC LIMIT 1", [req.usuario.id]),
    ]);

    res.json({
      ventas_dia: { tickets: Number(ventasDia.tickets), total: Number(ventasDia.total) },
      ventas_mes: { tickets: Number(ventasMes.tickets), total: Number(ventasMes.total) },
      por_cobrar: Number(porCobrar.total),
      libretas_abiertas: Number(libretas.total),
      por_pagar: Number(porPagar.total),
      valor_inventario: Math.round(Number(inventario.total)),
      productos_criticos: criticos,
      caja_abierta: cajaAbierta ? { id: cajaAbierta.id, abierta_en: cajaAbierta.abierta_en } : null,
    });
  })
);

module.exports = router;
