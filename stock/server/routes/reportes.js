const express = require('express');
const db = require('../db');
const csv = require('../lib/csv');
const { asyncRuta } = require('../lib/ruta');
const { malPedido } = require('../lib/errors');
const { hoyIso } = require('../lib/fechas');

const router = express.Router();

const rango = (req) => {
  const desde = req.query.desde || hoyIso();
  const hasta = req.query.hasta || hoyIso();
  return [`${desde} 00:00:00`, `${hasta} 23:59:59`];
};

const num = (columnas) => columnas;

// Cada reporte devuelve columnas + filas; la fila de totales se calcula sumando
// las columnas marcadas como numericas.
const REPORTES = {
  ventas_por_dia: {
    titulo: 'Ventas por dia',
    columnas: num([
      { campo: 'dia', titulo: 'Dia' },
      { campo: 'tickets', titulo: 'Tickets', suma: true },
      { campo: 'total', titulo: 'Total', suma: true, moneda: true },
      { campo: 'contado', titulo: 'Contado', suma: true, moneda: true },
      { campo: 'credito', titulo: 'Credito', suma: true, moneda: true },
    ]),
    consulta: (r) => [
      `SELECT DATE(fecha) AS dia, COUNT(*) AS tickets, SUM(total) AS total,
              SUM(CASE WHEN condicion = 'contado' THEN total ELSE 0 END) AS contado,
              SUM(CASE WHEN condicion = 'credito' THEN total ELSE 0 END) AS credito
         FROM ventas WHERE estado = 'activa' AND fecha BETWEEN ? AND ?
        GROUP BY DATE(fecha) ORDER BY dia`,
      r,
    ],
  },

  ranking_productos: {
    titulo: 'Ranking de productos',
    columnas: [
      { campo: 'producto', titulo: 'Producto' },
      { campo: 'unidades_base', titulo: 'Unidades base', suma: true },
      { campo: 'importe', titulo: 'Importe', suma: true, moneda: true },
    ],
    consulta: (r) => [
      `SELECT vi.producto_nombre AS producto, SUM(vi.cantidad * vi.factor) AS unidades_base, SUM(vi.importe) AS importe
         FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
        WHERE v.estado = 'activa' AND v.fecha BETWEEN ? AND ?
        GROUP BY vi.producto_nombre ORDER BY importe DESC`,
      r,
    ],
  },

  por_presentacion: {
    titulo: 'Ventas por presentacion (suelto vs pack vs cajon)',
    columnas: [
      { campo: 'presentacion', titulo: 'Presentacion' },
      { campo: 'factor', titulo: 'Factor' },
      { campo: 'cantidad', titulo: 'Cantidad', suma: true },
      { campo: 'unidades_base', titulo: 'Unidades base', suma: true },
      { campo: 'importe', titulo: 'Importe', suma: true, moneda: true },
    ],
    consulta: (r) => [
      `SELECT vi.presentacion_nombre AS presentacion, vi.factor, SUM(vi.cantidad) AS cantidad,
              SUM(vi.cantidad * vi.factor) AS unidades_base, SUM(vi.importe) AS importe
         FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
        WHERE v.estado = 'activa' AND v.fecha BETWEEN ? AND ?
        GROUP BY vi.presentacion_nombre, vi.factor ORDER BY importe DESC`,
      r,
    ],
  },

  por_categoria: {
    titulo: 'Ventas por categoria',
    columnas: [
      { campo: 'categoria', titulo: 'Categoria' },
      { campo: 'importe', titulo: 'Importe', suma: true, moneda: true },
    ],
    consulta: (r) => [
      `SELECT COALESCE(c.nombre, 'Sin categoria') AS categoria, SUM(vi.importe) AS importe
         FROM venta_items vi
         JOIN ventas v ON v.id = vi.venta_id
         JOIN productos p ON p.id = vi.producto_id
         LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE v.estado = 'activa' AND v.fecha BETWEEN ? AND ?
        GROUP BY categoria ORDER BY importe DESC`,
      r,
    ],
  },

  por_cliente: {
    titulo: 'Ventas por cliente',
    columnas: [
      { campo: 'cliente', titulo: 'Cliente' },
      { campo: 'tickets', titulo: 'Tickets', suma: true },
      { campo: 'total', titulo: 'Total', suma: true, moneda: true },
    ],
    consulta: (r) => [
      `SELECT COALESCE(c.nombre, 'Consumidor final') AS cliente, COUNT(*) AS tickets, SUM(v.total) AS total
         FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id
        WHERE v.estado = 'activa' AND v.fecha BETWEEN ? AND ?
        GROUP BY cliente ORDER BY total DESC`,
      r,
    ],
  },

  por_medio_pago: {
    titulo: 'Ventas por medio de pago',
    columnas: [
      { campo: 'medio_pago', titulo: 'Medio' },
      { campo: 'tickets', titulo: 'Tickets', suma: true },
      { campo: 'total', titulo: 'Total', suma: true, moneda: true },
    ],
    consulta: (r) => [
      `SELECT medio_pago, COUNT(*) AS tickets, SUM(total) AS total FROM ventas
        WHERE estado = 'activa' AND fecha BETWEEN ? AND ? GROUP BY medio_pago ORDER BY total DESC`,
      r,
    ],
  },

  por_hora: {
    titulo: 'Ventas por hora',
    columnas: [
      { campo: 'hora', titulo: 'Hora' },
      { campo: 'tickets', titulo: 'Tickets', suma: true },
      { campo: 'total', titulo: 'Total', suma: true, moneda: true },
    ],
    consulta: (r) => [
      `SELECT HOUR(fecha) AS hora, COUNT(*) AS tickets, SUM(total) AS total FROM ventas
        WHERE estado = 'activa' AND fecha BETWEEN ? AND ? GROUP BY HOUR(fecha) ORDER BY hora`,
      r,
    ],
  },

  rentabilidad: {
    titulo: 'Rentabilidad por producto',
    columnas: [
      { campo: 'producto', titulo: 'Producto' },
      { campo: 'venta', titulo: 'Venta', suma: true, moneda: true },
      { campo: 'costo', titulo: 'Costo', suma: true, moneda: true },
      { campo: 'ganancia', titulo: 'Ganancia', suma: true, moneda: true },
      { campo: 'margen_pct', titulo: 'Margen %' },
    ],
    consulta: (r) => [
      `SELECT vi.producto_nombre AS producto,
              SUM(vi.importe) AS venta,
              ROUND(SUM(vi.cantidad * vi.factor * vi.costo_base)) AS costo,
              ROUND(SUM(vi.importe) - SUM(vi.cantidad * vi.factor * vi.costo_base)) AS ganancia,
              ROUND(CASE WHEN SUM(vi.importe) = 0 THEN 0
                    ELSE (SUM(vi.importe) - SUM(vi.cantidad * vi.factor * vi.costo_base)) * 100 / SUM(vi.importe) END, 1) AS margen_pct
         FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
        WHERE v.estado = 'activa' AND v.fecha BETWEEN ? AND ?
        GROUP BY vi.producto_nombre ORDER BY ganancia DESC`,
      r,
    ],
  },

  compras_por_proveedor: {
    titulo: 'Compras por proveedor',
    columnas: [
      { campo: 'proveedor', titulo: 'Proveedor' },
      { campo: 'comprobantes', titulo: 'Comprobantes', suma: true },
      { campo: 'total', titulo: 'Total', suma: true, moneda: true },
    ],
    consulta: (r) => [
      `SELECT p.nombre AS proveedor, COUNT(*) AS comprobantes, SUM(c.total) AS total
         FROM compras c JOIN proveedores p ON p.id = c.proveedor_id
        WHERE c.estado = 'activa' AND c.fecha BETWEEN ? AND ?
        GROUP BY p.nombre ORDER BY total DESC`,
      r,
    ],
  },

  evolucion_costo: {
    titulo: 'Evolucion de costo por producto',
    columnas: [
      { campo: 'fecha', titulo: 'Fecha' },
      { campo: 'producto', titulo: 'Producto' },
      { campo: 'presentacion', titulo: 'Presentacion' },
      { campo: 'costo_presentacion', titulo: 'Costo bulto', moneda: true },
      { campo: 'costo_base', titulo: 'Costo unidad base', moneda: true },
    ],
    consulta: (r) => [
      `SELECT c.fecha, p.nombre AS producto, ci.presentacion_nombre AS presentacion,
              ci.costo_presentacion, ci.costo_base
         FROM compra_items ci JOIN compras c ON c.id = ci.compra_id JOIN productos p ON p.id = ci.producto_id
        WHERE c.estado = 'activa' AND c.fecha BETWEEN ? AND ?
        ORDER BY p.nombre, c.fecha`,
      r,
    ],
  },

  lista_precios: {
    titulo: 'Lista de precios con margen',
    sinFecha: true,
    columnas: [
      { campo: 'producto', titulo: 'Producto' },
      { campo: 'presentacion', titulo: 'Presentacion' },
      { campo: 'factor', titulo: 'Factor' },
      { campo: 'codigo_barras', titulo: 'Codigo de barras' },
      { campo: 'costo', titulo: 'Costo', moneda: true },
      { campo: 'precio', titulo: 'Precio', moneda: true },
      { campo: 'margen_pct', titulo: 'Margen %' },
    ],
    consulta: () => [
      `SELECT p.nombre AS producto, pr.nombre AS presentacion, pr.factor, pr.codigo_barras,
              ROUND(p.costo_unitario * pr.factor) AS costo, pr.precio,
              ROUND(CASE WHEN p.costo_unitario = 0 THEN 0
                    ELSE (pr.precio - p.costo_unitario * pr.factor) * 100 / (p.costo_unitario * pr.factor) END, 1) AS margen_pct
         FROM presentaciones pr JOIN productos p ON p.id = pr.producto_id
        WHERE p.activo = 1 AND pr.activo = 1 ORDER BY p.nombre, pr.factor`,
      [],
    ],
  },

  inventario_valorizado: {
    titulo: 'Inventario valorizado',
    sinFecha: true,
    columnas: [
      { campo: 'producto', titulo: 'Producto' },
      { campo: 'stock', titulo: 'Stock (unidad base)', suma: true },
      { campo: 'costo_unitario', titulo: 'Costo unitario', moneda: true },
      { campo: 'valor_costo', titulo: 'Valor a costo', suma: true, moneda: true },
      { campo: 'valor_venta', titulo: 'Valor a venta', suma: true, moneda: true },
    ],
    consulta: () => [
      `SELECT p.nombre AS producto, p.stock, p.costo_unitario,
              ROUND(p.stock * p.costo_unitario) AS valor_costo,
              ROUND(p.stock * COALESCE((SELECT pr.precio / pr.factor FROM presentaciones pr
                                          WHERE pr.producto_id = p.id AND pr.factor = 1 LIMIT 1), 0)) AS valor_venta
         FROM productos p WHERE p.activo = 1 ORDER BY valor_costo DESC`,
      [],
    ],
  },

  reposicion: {
    titulo: 'Reposicion urgente',
    sinFecha: true,
    columnas: [
      { campo: 'producto', titulo: 'Producto' },
      { campo: 'stock', titulo: 'Stock', suma: true },
      { campo: 'stock_minimo', titulo: 'Minimo' },
      { campo: 'faltante', titulo: 'Faltante', suma: true },
    ],
    consulta: () => [
      `SELECT nombre AS producto, stock, stock_minimo, GREATEST(stock_minimo - stock, 0) AS faltante
         FROM productos WHERE activo = 1 AND stock <= stock_minimo ORDER BY faltante DESC`,
      [],
    ],
  },

  rotacion: {
    titulo: 'Rotacion de productos',
    columnas: [
      { campo: 'producto', titulo: 'Producto' },
      { campo: 'vendidas', titulo: 'Unidades vendidas', suma: true },
      { campo: 'stock', titulo: 'Stock actual', suma: true },
      { campo: 'rotacion', titulo: 'Rotacion (vendidas/stock)' },
    ],
    consulta: (r) => [
      `SELECT p.nombre AS producto,
              COALESCE(SUM(vi.cantidad * vi.factor), 0) AS vendidas,
              p.stock,
              ROUND(CASE WHEN p.stock = 0 THEN COALESCE(SUM(vi.cantidad * vi.factor), 0)
                    ELSE COALESCE(SUM(vi.cantidad * vi.factor), 0) / p.stock END, 2) AS rotacion
         FROM productos p
         LEFT JOIN venta_items vi ON vi.producto_id = p.id
         LEFT JOIN ventas v ON v.id = vi.venta_id AND v.estado = 'activa' AND v.fecha BETWEEN ? AND ?
        WHERE p.activo = 1 GROUP BY p.id ORDER BY rotacion DESC`,
      r,
    ],
  },

  capital_inmovilizado: {
    titulo: 'Capital inmovilizado (sin ventas en el periodo)',
    columnas: [
      { campo: 'producto', titulo: 'Producto' },
      { campo: 'stock', titulo: 'Stock', suma: true },
      { campo: 'valor_costo', titulo: 'Valor a costo', suma: true, moneda: true },
    ],
    consulta: (r) => [
      `SELECT p.nombre AS producto, p.stock, ROUND(p.stock * p.costo_unitario) AS valor_costo
         FROM productos p
        WHERE p.activo = 1 AND p.stock > 0
          AND p.id NOT IN (
            SELECT vi.producto_id FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
             WHERE v.estado = 'activa' AND v.fecha BETWEEN ? AND ?
          )
        ORDER BY valor_costo DESC`,
      r,
    ],
  },

  antiguedad_cobrar: {
    titulo: 'Antiguedad de saldos por cobrar',
    sinFecha: true,
    columnas: [
      { campo: 'cliente', titulo: 'Cliente' },
      { campo: 'venta', titulo: 'Venta' },
      { campo: 'vencimiento', titulo: 'Vencimiento' },
      { campo: 'dias_vencida', titulo: 'Dias vencida' },
      { campo: 'pendiente', titulo: 'Pendiente', suma: true, moneda: true },
    ],
    consulta: () => [
      `SELECT c.nombre AS cliente, v.numero AS venta, cu.vencimiento,
              GREATEST(DATEDIFF(CURDATE(), cu.vencimiento), 0) AS dias_vencida,
              (cu.monto - cu.pagado) AS pendiente
         FROM cuotas cu JOIN ventas v ON v.id = cu.venta_id JOIN clientes c ON c.id = v.cliente_id
        WHERE cu.estado = 'pendiente' AND v.estado = 'activa' AND cu.monto > cu.pagado
        UNION ALL
       SELECT c.nombre AS cliente, CONCAT('Libreta ', l.id) AS venta, DATE(l.abierta_en) AS vencimiento,
              DATEDIFF(CURDATE(), DATE(l.abierta_en)) AS dias_vencida, (l.total - l.pagado) AS pendiente
         FROM libretas l JOIN clientes c ON c.id = l.cliente_id
        WHERE l.estado = 'abierta' AND l.total > l.pagado
        ORDER BY dias_vencida DESC`,
      [],
    ],
  },

  antiguedad_pagar: {
    titulo: 'Antiguedad de saldos por pagar',
    sinFecha: true,
    columnas: [
      { campo: 'proveedor', titulo: 'Proveedor' },
      { campo: 'comprobante', titulo: 'Comprobante' },
      { campo: 'fecha', titulo: 'Fecha' },
      { campo: 'dias', titulo: 'Dias' },
      { campo: 'pendiente', titulo: 'Pendiente', suma: true, moneda: true },
    ],
    consulta: () => [
      `SELECT p.nombre AS proveedor, COALESCE(c.comprobante, c.id) AS comprobante, DATE(c.fecha) AS fecha,
              DATEDIFF(CURDATE(), DATE(c.fecha)) AS dias, (c.total - c.pagado) AS pendiente
         FROM compras c JOIN proveedores p ON p.id = c.proveedor_id
        WHERE c.estado = 'activa' AND c.total > c.pagado ORDER BY dias DESC`,
      [],
    ],
  },

  caja_ingresos_egresos: {
    titulo: 'Ingresos y egresos del periodo',
    columnas: [
      { campo: 'concepto', titulo: 'Concepto' },
      { campo: 'ingresos', titulo: 'Ingresos', suma: true, moneda: true },
      { campo: 'egresos', titulo: 'Egresos', suma: true, moneda: true },
    ],
    consulta: (_r) => [
      `SELECT 'Ventas de contado' AS concepto, COALESCE(SUM(total), 0) AS ingresos, 0 AS egresos
         FROM ventas WHERE estado = 'activa' AND condicion = 'contado' AND fecha BETWEEN ? AND ?
        UNION ALL
       SELECT 'Entregas iniciales de credito', COALESCE(SUM(entrega_inicial), 0), 0
         FROM ventas WHERE estado = 'activa' AND condicion = 'credito' AND fecha BETWEEN ? AND ?
        UNION ALL
       SELECT 'Cobranzas de cuenta corriente', COALESCE(SUM(monto), 0), 0
         FROM pagos WHERE persona_tipo = 'cliente' AND fecha BETWEEN ? AND ?
        UNION ALL
       SELECT 'Compras a proveedor', 0, COALESCE(SUM(total), 0)
         FROM compras WHERE estado = 'activa' AND fecha BETWEEN ? AND ?
        UNION ALL
       SELECT 'Gastos generales', 0, COALESCE(SUM(monto), 0)
         FROM gastos WHERE fecha BETWEEN ? AND ?`,
      (r2) => [...r2, ...r2, ...r2, ...r2, ...r2],
    ],
  },

  presupuestos_conversion: {
    titulo: 'Efectividad de presupuestos',
    columnas: [
      { campo: 'estado', titulo: 'Estado' },
      { campo: 'cantidad', titulo: 'Cantidad', suma: true },
      { campo: 'total', titulo: 'Total', suma: true, moneda: true },
    ],
    consulta: (r) => [
      `SELECT estado, COUNT(*) AS cantidad, SUM(total) AS total FROM presupuestos
        WHERE fecha BETWEEN ? AND ? GROUP BY estado`,
      r,
    ],
  },
};

router.get('/', (req, res) => {
  res.json(
    Object.entries(REPORTES).map(([clave, r]) => ({ clave, titulo: r.titulo, sin_fecha: !!r.sinFecha }))
  );
});

router.get(
  '/:clave',
  asyncRuta(async (req, res) => {
    const definicion = REPORTES[req.params.clave];
    if (!definicion) throw malPedido('Reporte inexistente');

    const r = rango(req);
    let [sql, params] = definicion.consulta(r);
    if (typeof params === 'function') params = params(r);
    const filas = await db.query(sql, params);

    const totales = {};
    for (const col of definicion.columnas.filter((c) => c.suma)) {
      totales[col.campo] = filas.reduce((acc, f) => acc + Number(f[col.campo] || 0), 0);
    }

    if (req.query.formato === 'csv') {
      const texto = csv.generar(definicion.columnas, [...filas, { ...totales, [definicion.columnas[0].campo]: 'TOTAL' }]);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.clave}.csv"`);
      return res.send(texto);
    }

    res.json({ clave: req.params.clave, titulo: definicion.titulo, columnas: definicion.columnas, filas, totales });
  })
);

module.exports = router;
