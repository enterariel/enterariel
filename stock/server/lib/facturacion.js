const { malPedido } = require('./errors');
const { iso } = require('./fechas');

// Timbrado preimpreso cargado a mano: el sistema solo numera correlativo
// respetando rango, vigencia y cupo. No hay factura electronica.
async function emitir(conn, ventaId, fecha = new Date()) {
  const hoy = iso(fecha);
  const [filas] = await conn.query(
    'SELECT * FROM timbrados WHERE activo = 1 AND vigencia_desde <= ? AND vigencia_hasta >= ? ORDER BY id LIMIT 1 FOR UPDATE',
    [hoy, hoy]
  );
  if (!filas.length) throw malPedido('No hay timbrado vigente: la venta puede emitirse como comprobante interno');
  const timbrado = filas[0];

  const numero = Number(timbrado.actual) + 1;
  if (numero > Number(timbrado.hasta)) throw malPedido('Se agoto el cupo del timbrado');

  const formateado = `${timbrado.establecimiento}-${timbrado.punto_expedicion}-${String(numero).padStart(7, '0')}`;
  await conn.query('UPDATE timbrados SET actual = ? WHERE id = ?', [numero, timbrado.id]);
  await conn.query(
    `INSERT INTO facturas (venta_id, timbrado_id, numero, numero_formateado, timbrado_numero)
     VALUES (?, ?, ?, ?, ?)`,
    [ventaId, timbrado.id, numero, formateado, timbrado.numero]
  );
  return { numero, numero_formateado: formateado, timbrado_numero: timbrado.numero };
}

module.exports = { emitir };
