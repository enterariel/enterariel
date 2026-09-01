const { malPedido } = require('./errors');
const { gs } = require('./money');

// ---------------------------------------------------------------------------
// Punto unico de escritura de stock.
// Nadie mas hace UPDATE productos SET stock: todo pasa por aca, siempre dentro
// de una transaccion, con la fila del producto bloqueada y dejando asiento en
// el libro mayor con el antes/despues.
// ---------------------------------------------------------------------------

// Bloquea en orden de id para que dos cajas simultaneas no se traben entre si.
async function bloquear(conn, productoIds) {
  const ids = [...new Set(productoIds.map(Number))].sort((a, b) => a - b);
  const productos = new Map();
  for (const id of ids) {
    const [filas] = await conn.query('SELECT * FROM productos WHERE id = ? FOR UPDATE', [id]);
    if (!filas.length) throw malPedido(`El producto ${id} no existe`);
    productos.set(id, filas[0]);
  }
  return productos;
}

// cantidad va en unidades base y con signo: negativa descuenta, positiva repone.
async function aplicar(conn, opciones) {
  const {
    productoId,
    cantidad,
    origen,
    referenciaTipo = null,
    referenciaId = null,
    usuarioId = null,
    detalle = null,
    permitirNegativo = false,
    productoBloqueado = null,
  } = opciones;

  const delta = Math.trunc(Number(cantidad));
  if (!Number.isFinite(delta) || delta === 0) return null;

  let producto = productoBloqueado;
  if (!producto) {
    const [filas] = await conn.query('SELECT * FROM productos WHERE id = ? FOR UPDATE', [productoId]);
    if (!filas.length) throw malPedido(`El producto ${productoId} no existe`);
    producto = filas[0];
  }

  const antes = Number(producto.stock);
  const despues = antes + delta;
  if (despues < 0 && !permitirNegativo) {
    throw malPedido(
      `Stock insuficiente de ${producto.nombre}: hay ${antes} ${producto.unidad_base} y se piden ${Math.abs(delta)}`
    );
  }

  await conn.query('UPDATE productos SET stock = ? WHERE id = ?', [despues, producto.id]);
  const [res] = await conn.query(
    `INSERT INTO movimientos_stock
      (producto_id, origen, referencia_tipo, referencia_id, cantidad, stock_antes, stock_despues, usuario_id, detalle)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [producto.id, origen, referenciaTipo, referenciaId, delta, antes, despues, usuarioId, detalle]
  );

  producto.stock = despues;
  return { movimientoId: res.insertId, antes, despues };
}

// Descompone el stock en lenguaje de mostrador: "6 Cajon x24 + 1 Pack x6 + 4 Latas".
function desglosar(stockBase, presentaciones, unidadBase = 'Unidad') {
  let resto = Math.max(0, Math.trunc(Number(stockBase) || 0));
  const ordenadas = presentaciones
    .filter((p) => Number(p.factor) > 1 && Number(p.activo) !== 0)
    .sort((a, b) => Number(b.factor) - Number(a.factor));

  const partes = [];
  for (const p of ordenadas) {
    const factor = Number(p.factor);
    const cuantos = Math.floor(resto / factor);
    if (cuantos > 0) {
      partes.push(`${cuantos} ${p.nombre}`);
      resto -= cuantos * factor;
    }
  }
  if (resto > 0 || partes.length === 0) {
    const base = presentaciones.find((p) => Number(p.factor) === 1);
    partes.push(`${resto} ${base ? base.nombre : unidadBase}`);
  }
  return partes.join(' + ');
}

// Si el producto tiene margen configurado, el precio de cada presentacion se
// recalcula desde el costo por unidad base y su factor.
async function repreciar(conn, producto) {
  const margen = producto.margen === null || producto.margen === undefined ? null : Number(producto.margen);
  if (margen === null) return [];
  const [presentaciones] = await conn.query('SELECT * FROM presentaciones WHERE producto_id = ?', [producto.id]);
  const cambios = [];
  for (const p of presentaciones) {
    const nuevo = gs(Number(producto.costo_unitario) * (1 + margen / 100) * Number(p.factor));
    if (nuevo !== Number(p.precio)) {
      await conn.query('UPDATE presentaciones SET precio = ? WHERE id = ?', [nuevo, p.id]);
      cambios.push({ presentacion_id: p.id, nombre: p.nombre, antes: Number(p.precio), despues: nuevo });
    }
  }
  return cambios;
}

module.exports = { bloquear, aplicar, desglosar, repreciar };
