const stockLib = require('./stock');
const cuenta = require('./cuenta');
const { gs } = require('./money');
const { malPedido, prohibido } = require('./errors');

// Cuanto de esta venta ya se le acredito al cliente (por devoluciones previas).
async function acreditadoPrevio(conn, venta) {
  if (venta.modalidad_credito === 'libreta') {
    const [filas] = await conn.query(
      "SELECT COALESCE(SUM(abono), 0) AS total FROM libreta_movimientos WHERE referencia_tipo = 'venta' AND referencia_id = ?",
      [venta.id]
    );
    return Number(filas[0].total);
  }
  const [filas] = await conn.query(
    "SELECT COALESCE(SUM(haber), 0) AS total FROM cc_movimientos WHERE referencia_tipo = 'venta' AND referencia_id = ? AND persona_tipo = 'cliente'",
    [venta.id]
  );
  return Number(filas[0].total);
}

async function efectivoDevuelto(conn, ventaId) {
  const [filas] = await conn.query(
    "SELECT COALESCE(SUM(monto), 0) AS total FROM caja_movimientos WHERE tipo = 'devolucion' AND referencia_tipo = 'venta' AND referencia_id = ?",
    [ventaId]
  );
  return Number(filas[0].total);
}

// Deuda viva de esta venta: lo que todavia debe el cliente por ella, ya
// descontados los pagos que hizo y las devoluciones anteriores.
async function deudaPendiente(conn, venta) {
  if (venta.modalidad_credito === 'libreta') {
    const libreta = await cuenta.libretaAbierta(conn, venta.cliente_id, false);
    if (!libreta) return 0;
    const [filas] = await conn.query(
      'SELECT COALESCE(SUM(cargo) - SUM(abono), 0) AS saldo FROM libreta_movimientos WHERE libreta_id = ?',
      [libreta.id]
    );
    const [propios] = await conn.query(
      "SELECT COALESCE(SUM(cargo) - SUM(abono), 0) AS saldo FROM libreta_movimientos WHERE libreta_id = ? AND referencia_tipo = 'venta' AND referencia_id = ?",
      [libreta.id, venta.id]
    );
    // Los pagos de libreta no se imputan a una venta puntual: se topea contra
    // el saldo de la libreta para no acreditar mas de lo que se debe.
    return Math.max(0, Math.min(Number(filas[0].saldo), Number(propios[0].saldo)));
  }
  const [filas] = await conn.query(
    "SELECT COALESCE(SUM(monto - pagado), 0) AS saldo FROM cuotas WHERE venta_id = ? AND estado = 'pendiente'",
    [venta.id]
  );
  return Math.max(0, Number(filas[0].saldo));
}

// Le devuelve plata al cliente: baja la deuda viva si la venta fue a credito y
// el resto sale por el mismo medio con que pago (efectivo, de la caja).
async function acreditar(conn, venta, monto, concepto, usuario, cajaId) {
  const importe = gs(monto);
  if (importe <= 0) return { acreditado: 0 };
  const enEfectivoLaVenta = venta.medio_pago === 'efectivo' || venta.medio_pago === 'mixto';

  if (venta.condicion === 'credito') {
    const pendiente = await deudaPendiente(conn, venta);
    const aAcreditar = Math.min(importe, pendiente);
    const enEfectivo = importe - aAcreditar;

    if (aAcreditar > 0) {
      if (venta.modalidad_credito === 'libreta') {
        const libreta = await cuenta.libretaAbierta(conn, venta.cliente_id, false);
        if (libreta) {
          await cuenta.libretaAsentar(conn, libreta.id, {
            concepto,
            abono: aAcreditar,
            referenciaTipo: 'venta',
            referenciaId: venta.id,
          });
        }
      } else {
        // Se descuenta de las cuotas pendientes empezando por la ultima.
        let resto = aAcreditar;
        const [cuotas] = await conn.query(
          "SELECT * FROM cuotas WHERE venta_id = ? AND estado = 'pendiente' ORDER BY numero DESC FOR UPDATE",
          [venta.id]
        );
        for (const cuota of cuotas) {
          if (resto <= 0) break;
          const pendienteCuota = Number(cuota.monto) - Number(cuota.pagado);
          const baja = Math.min(pendienteCuota, resto);
          resto -= baja;
          const nuevoMonto = Number(cuota.monto) - baja;
          await conn.query('UPDATE cuotas SET monto = ?, estado = ? WHERE id = ?', [
            nuevoMonto,
            nuevoMonto <= Number(cuota.pagado) ? 'pagada' : 'pendiente',
            cuota.id,
          ]);
        }
      }
      await cuenta.asentar(conn, {
        personaTipo: 'cliente',
        personaId: venta.cliente_id,
        concepto,
        haber: aAcreditar,
        referenciaTipo: 'venta',
        referenciaId: venta.id,
        usuarioId: usuario.id,
      });
    }

    if (enEfectivo > 0 && cajaId && enEfectivoLaVenta) {
      await conn.query(
        `INSERT INTO caja_movimientos (caja_id, tipo, monto, referencia_tipo, referencia_id, detalle, usuario_id)
         VALUES (?, 'devolucion', ?, 'venta', ?, ?, ?)`,
        [cajaId, enEfectivo, venta.id, concepto, usuario.id]
      );
    }
    return { acreditado: aAcreditar, efectivo: enEfectivoLaVenta ? enEfectivo : 0, medio: venta.medio_pago };
  }

  // Si la venta se cobro con tarjeta o transferencia la devolucion se hace por
  // ese mismo medio: no puede salir plata de la caja.
  if (cajaId && enEfectivoLaVenta) {
    await conn.query(
      `INSERT INTO caja_movimientos (caja_id, tipo, monto, referencia_tipo, referencia_id, detalle, usuario_id)
       VALUES (?, 'devolucion', ?, 'venta', ?, ?, ?)`,
      [cajaId, importe, venta.id, concepto, usuario.id]
    );
  }
  return { acreditado: 0, efectivo: enEfectivoLaVenta ? importe : 0, medio: venta.medio_pago };
}

// El vendedor puede tocar su propia venta el mismo dia; despues, solo admin.
function verificarPermiso(venta, usuario) {
  if (usuario.rol === 'admin') return;
  const mismoDia = new Date(venta.fecha).toDateString() === new Date().toDateString();
  if (Number(venta.usuario_id) !== Number(usuario.id) || !mismoDia) {
    throw prohibido('Solo un administrador puede anular o devolver ventas de otro usuario o de otro dia');
  }
}

async function devolverParcial(conn, venta, items, motivo, usuario, cajaId) {
  if (venta.estado !== 'activa') throw malPedido('La venta ya esta anulada');
  if (!Array.isArray(items) || !items.length) throw malPedido('No hay items para devolver');

  const [ventaItems] = await conn.query('SELECT * FROM venta_items WHERE venta_id = ? FOR UPDATE', [venta.id]);
  const porId = new Map(ventaItems.map((i) => [Number(i.id), i]));

  // Se suman las cantidades por linea antes de validar: si el pedido repite una
  // linea, el total no puede pasarse de lo vendido.
  const pedido = new Map();
  for (const item of items) {
    const id = Number(item.venta_item_id);
    const cantidad = Math.trunc(Number(item.cantidad));
    if (!Number.isFinite(cantidad) || cantidad <= 0) throw malPedido('Cantidad de devolucion invalida');
    pedido.set(id, (pedido.get(id) || 0) + cantidad);
  }

  // El descuento de la venta se reparte proporcionalmente entre las lineas para
  // no devolver mas de lo que el cliente pago.
  const subtotal = Number(venta.subtotal) || 0;
  const proporcion = subtotal > 0 ? (subtotal - Number(venta.descuento)) / subtotal : 1;

  const aDevolver = [];
  for (const [id, cantidad] of pedido) {
    const original = porId.get(id);
    if (!original) throw malPedido('La linea no pertenece a esta venta');
    const disponible = Number(original.cantidad) - Number(original.devuelto);
    if (cantidad > disponible) {
      throw malPedido(`No se puede devolver ${cantidad} de ${original.producto_nombre}: quedan ${disponible}`);
    }
    aDevolver.push({
      original,
      cantidad,
      importe: gs(Number(original.precio_unitario) * cantidad * proporcion),
    });
  }

  const total = aDevolver.reduce((acc, d) => acc + d.importe, 0);
  const [devRes] = await conn.query(
    'INSERT INTO devoluciones (venta_id, usuario_id, total, motivo) VALUES (?, ?, ?, ?)',
    [venta.id, usuario.id, total, motivo]
  );
  const devolucionId = devRes.insertId;

  const productos = await stockLib.bloquear(conn, aDevolver.map((d) => Number(d.original.producto_id)));
  for (const d of aDevolver) {
    await conn.query('INSERT INTO devolucion_items (devolucion_id, venta_item_id, cantidad, importe) VALUES (?, ?, ?, ?)', [
      devolucionId, d.original.id, d.cantidad, d.importe,
    ]);
    await conn.query('UPDATE venta_items SET devuelto = devuelto + ? WHERE id = ?', [d.cantidad, d.original.id]);
    await stockLib.aplicar(conn, {
      productoId: d.original.producto_id,
      cantidad: d.cantidad * Number(d.original.factor),
      origen: 'devolucion',
      referenciaTipo: 'devolucion',
      referenciaId: devolucionId,
      usuarioId: usuario.id,
      detalle: `Devolucion de venta ${venta.numero}`,
      productoBloqueado: productos.get(Number(d.original.producto_id)),
    });
  }

  const credito = await acreditar(conn, venta, total, `Devolucion venta ${venta.numero}`, usuario, cajaId);
  return { devolucion_id: devolucionId, total, ...credito };
}

async function anular(conn, venta, motivo, usuario, cajaId) {
  if (venta.estado !== 'activa') throw malPedido('La venta ya esta anulada');

  const [items] = await conn.query('SELECT * FROM venta_items WHERE venta_id = ? FOR UPDATE', [venta.id]);
  const pendientes = items.filter((i) => Number(i.cantidad) - Number(i.devuelto) > 0);

  // Lo ya devuelto parcialmente no se repone de nuevo.
  const productos = await stockLib.bloquear(conn, pendientes.map((i) => Number(i.producto_id)));
  for (const item of pendientes) {
    const cantidad = Number(item.cantidad) - Number(item.devuelto);
    await stockLib.aplicar(conn, {
      productoId: item.producto_id,
      cantidad: cantidad * Number(item.factor),
      origen: 'anulacion',
      referenciaTipo: 'venta',
      referenciaId: venta.id,
      usuarioId: usuario.id,
      detalle: `Anulacion de venta ${venta.numero}`,
      productoBloqueado: productos.get(Number(item.producto_id)),
    });
  }

  let credito = { acreditado: 0, efectivo: 0 };
  if (venta.condicion === 'credito') {
    const pendienteDeuda = await deudaPendiente(conn, venta);
    if (pendienteDeuda > 0) {
      credito = await acreditar(conn, venta, pendienteDeuda, `Anulacion venta ${venta.numero}`, usuario, cajaId);
    }
    await conn.query("UPDATE cuotas SET estado = 'anulada' WHERE venta_id = ? AND estado = 'pendiente'", [venta.id]);
    // La entrega inicial que hizo el cliente vuelve en efectivo.
    if (Number(venta.entrega_inicial) > 0 && cajaId && venta.medio_pago !== 'transferencia' && venta.medio_pago !== 'tarjeta') {
      await conn.query(
        `INSERT INTO caja_movimientos (caja_id, tipo, monto, referencia_tipo, referencia_id, detalle, usuario_id)
         VALUES (?, 'devolucion', ?, 'venta', ?, ?, ?)`,
        [cajaId, Number(venta.entrega_inicial), venta.id, `Anulacion venta ${venta.numero}`, usuario.id]
      );
      credito.efectivo = Number(credito.efectivo || 0) + Number(venta.entrega_inicial);
    }
  } else {
    const yaEnEfectivo = await efectivoDevuelto(conn, venta.id);
    const pendienteEfectivo = Math.max(0, Number(venta.total) - yaEnEfectivo);
    if (pendienteEfectivo > 0) {
      credito = await acreditar(conn, venta, pendienteEfectivo, `Anulacion venta ${venta.numero}`, usuario, cajaId);
    }
  }

  await conn.query(
    "UPDATE ventas SET estado = 'anulada', anulada_en = NOW(), anulada_por = ?, observacion = CONCAT(COALESCE(observacion, ''), ?) WHERE id = ?",
    [usuario.id, ` [ANULADA: ${motivo || 'sin motivo'}]`, venta.id]
  );

  return { anulada: true, ...credito };
}

module.exports = { devolverParcial, anular, verificarPermiso, acreditadoPrevio, deudaPendiente };
