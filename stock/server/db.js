const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'stock',
  password: process.env.DB_PASSWORD || 'stock',
  database: process.env.DB_NAME || 'stock',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: 'local',
  decimalNumbers: true,
  multipleStatements: false,
});

const ERRORES_CONEXION = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ER_LOCK_DEADLOCK',
]);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Solo se reintentan lecturas: repetir una escritura podria duplicar la operacion.
async function query(sql, params = []) {
  let ultimoError;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const [filas] = await pool.query(sql, params);
      return filas;
    } catch (err) {
      ultimoError = err;
      if (!ERRORES_CONEXION.has(err.code)) throw err;
      await esperar(100 * (intento + 1));
    }
  }
  throw ultimoError;
}

async function uno(sql, params = []) {
  const filas = await query(sql, params);
  return filas[0] || null;
}

async function ejecutar(sql, params = []) {
  const [resultado] = await pool.execute(sql, params);
  return resultado;
}

// Toda operacion que toca stock o cuenta corriente pasa por aca: si algo falla,
// no queda nada grabado.
async function transaccion(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await fn(conn);
    await conn.commit();
    return resultado;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      // la conexion ya estaba caida
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function cerrar() {
  await pool.end();
}

module.exports = { pool, query, uno, ejecutar, transaccion, cerrar };
