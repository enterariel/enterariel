const { gs } = require('./money');
const { malPedido } = require('./errors');

const TABLAS = { cliente: 'clientes', proveedor: 'proveedores' };

// Cada asiento guarda el saldo acumulado y sincroniza la ficha; la consulta del
// historial nunca recalcula todo el libro.
async function asentar(conn, opciones) {
  const {
    personaTipo,
    personaId,
    concepto,
    debe = 0,
    haber = 0,
    referenciaTipo = null,
    referenciaId = null,
    usuarioId = null,
  } = opciones;

  const tabla = TABLAS[personaTipo];
  if (!tabla) throw malPedido('Tipo de cuenta invalido');

  const [filas] = await conn.query(`SELECT * FROM ${tabla} WHERE id = ? FOR UPDATE`, [personaId]);
  if (!filas.length) throw malPedido('La persona de la cuenta corriente no existe');
  const persona = filas[0];

  const saldo = gs(Number(persona.saldo) + gs(debe) - gs(haber));
  if (saldo < 0) throw malPedido('No se puede acreditar mas de lo que se debe');

  await conn.query(
    `INSERT INTO cc_movimientos
      (persona_tipo, persona_id, concepto, referencia_tipo, referencia_id, debe, haber, saldo, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [personaTipo, personaId, concepto, referenciaTipo, referenciaId, gs(debe), gs(haber), saldo, usuarioId]
  );
  await conn.query(`UPDATE ${tabla} SET saldo = ? WHERE id = ?`, [saldo, personaId]);
  return saldo;
}

async function verificarLimite(conn, clienteId, montoAFinanciar) {
  const [filas] = await conn.query('SELECT * FROM clientes WHERE id = ? FOR UPDATE', [clienteId]);
  if (!filas.length) throw malPedido('El cliente no existe');
  const cliente = filas[0];
  const limite = Number(cliente.limite_credito);
  if (limite > 0 && Number(cliente.saldo) + gs(montoAFinanciar) > limite) {
    throw malPedido(
      `Supera el limite de credito de ${cliente.nombre}: saldo ${cliente.saldo} + ${gs(montoAFinanciar)} > ${limite}`
    );
  }
  return cliente;
}

// Una libreta abierta por cliente; se cierra sola al llegar a cero.
async function libretaAbierta(conn, clienteId, crear = true) {
  const [filas] = await conn.query(
    "SELECT * FROM libretas WHERE cliente_id = ? AND estado = 'abierta' ORDER BY id DESC LIMIT 1 FOR UPDATE",
    [clienteId]
  );
  if (filas.length) return filas[0];
  if (!crear) return null;
  const [res] = await conn.query('INSERT INTO libretas (cliente_id) VALUES (?)', [clienteId]);
  const [nuevas] = await conn.query('SELECT * FROM libretas WHERE id = ?', [res.insertId]);
  return nuevas[0];
}

async function libretaAsentar(conn, libretaId, { concepto, cargo = 0, abono = 0, referenciaTipo = null, referenciaId = null }) {
  await conn.query(
    `INSERT INTO libreta_movimientos (libreta_id, concepto, cargo, abono, referencia_tipo, referencia_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [libretaId, concepto, gs(cargo), gs(abono), referenciaTipo, referenciaId]
  );
  await conn.query('UPDATE libretas SET total = total + ?, pagado = pagado + ? WHERE id = ?', [
    gs(cargo),
    gs(abono),
    libretaId,
  ]);
  const [filas] = await conn.query('SELECT * FROM libretas WHERE id = ?', [libretaId]);
  const libreta = filas[0];
  const saldo = Number(libreta.total) - Number(libreta.pagado);
  if (saldo <= 0 && Number(libreta.total) > 0) {
    await conn.query("UPDATE libretas SET estado = 'cerrada', cerrada_en = NOW() WHERE id = ?", [libretaId]);
  }
  return { ...libreta, saldo };
}

module.exports = { asentar, verificarLimite, libretaAbierta, libretaAsentar };
