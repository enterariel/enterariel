require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const db = require('./db');
const config = require('./lib/config');
const passwords = require('./lib/passwords');

async function crearBaseSiFalta() {
  const nombre = process.env.DB_NAME || 'stock';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'stock',
    password: process.env.DB_PASSWORD || 'stock',
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${nombre}\` CHARACTER SET utf8mb4`);
  await conn.end();
}

async function correrEsquema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const sentencias = sql
    .split('\n')
    .filter((linea) => !linea.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sentencia of sentencias) await db.query(sentencia);
}

async function datosBase() {
  await config.guardar(config.DEFAULTS);

  const tramos = await db.uno('SELECT COUNT(*) AS n FROM recargo_tramos');
  if (Number(tramos.n) === 0) {
    await db.ejecutar(
      'INSERT INTO recargo_tramos (cuotas_desde, cuotas_hasta, porcentaje) VALUES (1,3,10),(4,6,15),(7,12,20)'
    );
  }

  const categorias = await db.uno('SELECT COUNT(*) AS n FROM categorias_gasto');
  if (Number(categorias.n) === 0) {
    await db.ejecutar(
      "INSERT INTO categorias_gasto (nombre) VALUES ('Alquiler'),('Sueldos'),('Servicios'),('Fletes'),('Otros')"
    );
  }

  const admins = await db.uno("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin'");
  if (Number(admins.n) === 0) {
    const sal = passwords.generarSal();
    // En produccion no se inventa una clave conocida: o la define el operador
    // o se genera una al azar y se muestra una sola vez.
    const enProduccion = process.env.NODE_ENV === 'production';
    const clave = process.env.ADMIN_PASSWORD
      || (enProduccion ? crypto.randomBytes(12).toString('base64url') : 'admin123');
    const r = await db.ejecutar(
      'INSERT INTO usuarios (usuario, nombre, rol, pass_hash, salt) VALUES (?, ?, ?, ?, ?)',
      ['admin', 'Administrador', 'admin', passwords.hashear(clave, sal), sal]
    );
    const menus = ['tablero', 'pos', 'ventas', 'presupuestos', 'stock', 'catalogo', 'compras', 'proveedores',
      'clientes', 'creditos', 'caja', 'gastos', 'reportes', 'usuarios', 'config'];
    for (const menu of menus) {
      await db.ejecutar('INSERT IGNORE INTO usuario_menus (usuario_id, menu) VALUES (?, ?)', [r.insertId, menu]);
    }
    console.log(`Usuario admin creado (usuario: admin / contrasena: ${clave})`);
    if (enProduccion) console.log('Guarda esa contrasena: no se vuelve a mostrar. Cambiala desde Usuarios.');
  }
}

async function main() {
  await crearBaseSiFalta();
  await correrEsquema();
  await datosBase();
  console.log('Base lista.');
  await db.cerrar();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main, crearBaseSiFalta, correrEsquema, datosBase };
