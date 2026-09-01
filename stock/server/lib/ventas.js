const stockLib = require('./stock');
const cuenta = require('./cuenta');
const credito = require('./credito');
const config = require('./config');
const facturacion = require('./facturacion');
const { gs, ivaIncluido } = require('./money');
const { malPedido } = require('./errors');

// Resuelve items contra el catalogo y valida disponibilidad sumando las unidades
// base de TODAS las lineas del mismo producto (vender 1 pack x6 + 4 sueltas son
// dos lineas que descuentan del mismo pozo).
async function resolverItems(conn, items, { bloquear = true } = {}) {
  if (!Array.isArray(items) || !items.length) throw malPedido('La venta no tiene items');

  const productoIds = [];
  const resueltos = [];
  for (const item of items) {
    const cantidad = Math.trunc(Number(item.cantidad));
    if (!cantidad || cantidad <= 0) throw malPedido('Cantidad invalida en una linea');

    const [presRows] = await conn.query('SELECT * FROM presentaciones WHERE id = ?', [Number(item.presentacion_id)]);
    if (!presRows.length) throw malPedido('Presentacion inexistente en una linea');
    const presentacion = presRows[0];
    productoIds.push(presentacion.producto_id);
    resueltos.push({
      presentacion,
      cantidad,
      precio_unitario: item.precio_unitario === undefined ? Number(presentacion.precio) : gs(item.precio_unitario),
    });
  }

  const productos = bloquear
    ? await stockLib.bloquear(conn, productoIds)
    : new Map(
        (
          await conn.query(
            `SELECT * FROM productos WHERE id IN (${[...new Set(productoIds)].map(() => '?').join(',')})`,
            [...new Set(productoIds)]
          )
        )[0].map((p) => [p.id, p])
      );

  const lineas = resueltos.map((r) => {
    const producto = productos.get(Number(r.presentacion.producto_id));
    const factor = Number(r.presentacion.factor);
    return {
      producto,
      presentacion: r.presentacion,
      factor,
      cantidad: r.cantidad,
      unidades_base: r.cantidad * factor,
      precio_unitario: r.precio_unitario,
      importe: gs(r.precio_unitario * r.cantidad),
      iva: Number(producto.iva),
    };
  });

  const porProducto = new Map();
  for (const l of lineas) {
    porProducto.set(l.producto.id, (porProducto.get(l.producto.id) || 0) + l.unidades_base);
  }
  for (const [productoId, requeridas] of porProducto) {
    const producto = productos.get(Number(productoId));
    if (requeridas > Number(producto.stock)) {
      throw malPedido(
        `Stock insuficiente de ${producto.nombre}: se piden ${requeridas} ${producto.unidad_base} y hay ${producto.stock}`
      );
    }
  }

  return { lineas, productos, porProducto };
}

function totales(lineas, descuento = 0) {
  const subtotal = lineas.reduce((acc, l) => acc + l.importe, 0);
  const desc = Math.min(gs(descuento), subtotal);
  return { subtotal: gs(subtotal), descuento: desc, total: gs(subtotal - desc) };
}

// Crea la venta completa: stock, cuenta corriente, cuotas/libreta, caja y factura,
// todo dentro de la misma transaccion que recibe.
async function crear(conn, datos, usuario) {
  const {
    cliente_id = null,
    items,
    condicion = 'contado',
    descuento = 0,
    entrega_inicial = 0,
    cuotas: cantidadCuotas = 1,
    frecuencia = null,
    medio_pago = 'efectivo',
    con_factura = false,
    observacion = null,
    caja_id = null,
    presupuesto_id = null,
  } = datos;

  const { lineas } = await resolverItems(conn, items);
  const { subtotal, descuento: desc, total } = totales(lineas, descuento);
  if (total <= 0) throw malPedido('El total de la venta debe ser mayor a cero');

  const cfg = await config.todo();
  let clasificacion = 'contado';
  let recargo = 0;
  let financiado = 0;
  let entrega = gs(entrega_inicial);
  let plan = null;

  if (condicion === 'credito') {
    if (!cliente_id) throw malPedido('Una venta a credito necesita cliente');
    // El servidor recalcula el plan aunque la pantalla ya lo haya simulado.
    plan = await credito.simular({ total, entrega, cuotas: cantidadCuotas, frecuencia });
    clasificacion = plan.clasificacion;
    recargo = plan.recargo;
    financiado = plan.financiado;
    entrega = plan.entrega;
    if (financiado > 0) await cuenta.verificarLimite(conn, cliente_id, financiado);
  } else {
    entrega = total;
  }

  const [maxRow] = await conn.query('SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM ventas');
  const numero = Number(maxRow[0].siguiente);

  const [ventaRes] = await conn.query(
    `INSERT INTO ventas
      (numero, cliente_id, usuario_id, caja_id, condicion, modalidad_credito, clasificacion,
       subtotal, descuento, recargo, total, entrega_inicial, financiado, medio_pago, observacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      numero, cliente_id, usuario.id, caja_id, condicion,
      condicion === 'credito' ? (cfg.modalidad_credito === 'libreta' ? 'libreta' : 'cuotas_fijas') : null,
      clasificacion, subtotal, desc, recargo, gs(total + recargo), entrega, financiado, medio_pago, observacion,
    ]
  );
  const ventaId = ventaRes.insertId;

  for (const l of lineas) {
    // El IVA queda congelado al momento de la venta.
    const ivaMonto = ivaIncluido(l.importe, l.iva);
    await conn.query(
      `INSERT INTO venta_items
        (venta_id, producto_id, presentacion_id, producto_nombre, presentacion_nombre, factor,
         cantidad, precio_unitario, importe, iva, iva_monto, costo_base)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ventaId, l.producto.id, l.presentacion.id, l.producto.nombre, l.presentacion.nombre, l.factor,
        l.cantidad, l.precio_unitario, l.importe, l.iva, ivaMonto, Number(l.producto.costo_unitario),
      ]
    );
    await stockLib.aplicar(conn, {
      productoId: l.producto.id,
      cantidad: -l.unidades_base,
      origen: 'venta',
      referenciaTipo: 'venta',
      referenciaId: ventaId,
      usuarioId: usuario.id,
      detalle: `Venta ${numero} - ${l.cantidad} ${l.presentacion.nombre}`,
      productoBloqueado: l.producto,
    });
  }

  const resultado = { venta_id: ventaId, numero, subtotal, descuento: desc, recargo, total: gs(total + recargo), clasificacion, plan };

  if (condicion === 'credito' && financiado > 0) {
    if (cfg.modalidad_credito === 'libreta') {
      const libreta = await cuenta.libretaAbierta(conn, cliente_id);
      await cuenta.libretaAsentar(conn, libreta.id, {
        concepto: `Venta ${numero}`,
        cargo: financiado,
        referenciaTipo: 'venta',
        referenciaId: ventaId,
      });
      resultado.libreta_id = libreta.id;
    } else {
      for (const cuota of plan.cuotas) {
        await conn.query('INSERT INTO cuotas (venta_id, numero, vencimiento, monto) VALUES (?, ?, ?, ?)', [
          ventaId, cuota.numero, cuota.vencimiento, cuota.monto,
        ]);
      }
      resultado.cuotas = plan.cuotas;
    }
    await cuenta.asentar(conn, {
      personaTipo: 'cliente',
      personaId: cliente_id,
      concepto: `Venta ${numero} a credito`,
      debe: financiado,
      referenciaTipo: 'venta',
      referenciaId: ventaId,
      usuarioId: usuario.id,
    });
  }

  // Caja: entra el efectivo de la venta de contado y la entrega inicial del credito.
  if (caja_id && medio_pago === 'efectivo') {
    const enCaja = condicion === 'contado' ? gs(total) : entrega;
    if (enCaja > 0) {
      await conn.query(
        `INSERT INTO caja_movimientos (caja_id, tipo, monto, referencia_tipo, referencia_id, detalle, usuario_id)
         VALUES (?, ?, ?, 'venta', ?, ?, ?)`,
        [
          caja_id,
          condicion === 'contado' ? 'venta' : 'entrega_inicial',
          enCaja,
          ventaId,
          `Venta ${numero}`,
          usuario.id,
        ]
      );
    }
  }

  if (con_factura) {
    resultado.factura = await facturacion.emitir(conn, ventaId);
  }

  if (presupuesto_id) {
    await conn.query("UPDATE presupuestos SET estado = 'convertido', venta_id = ? WHERE id = ?", [
      ventaId, presupuesto_id,
    ]);
  }

  return resultado;
}

module.exports = { crear, resolverItems, totales };
