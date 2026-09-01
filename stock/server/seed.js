require('dotenv').config();
const db = require('./db');
const setup = require('./setup');
const passwords = require('./lib/passwords');

// Datos de ejemplo: bodega de bebidas (lata como unidad base, pack y cajon como
// presentaciones del mismo pozo de stock).
const PRODUCTOS = [
  {
    codigo: 'CERV-001', nombre: 'Cerveza Rubia 350ml', categoria: 'Cervezas', unidad: 'Lata',
    costo: 4500, margen: 35, minimo: 48, stock: 240,
    presentaciones: [
      { nombre: 'Lata', factor: 1, codigo: '7790001000011', precio: 6000 },
      { nombre: 'Pack x6', factor: 6, codigo: '7790001000028', precio: 34000 },
      { nombre: 'Cajon x24', factor: 24, codigo: '7790001000035', precio: 130000 },
    ],
  },
  {
    codigo: 'CERV-002', nombre: 'Cerveza Negra 350ml', categoria: 'Cervezas', unidad: 'Lata',
    costo: 5200, margen: 35, minimo: 24, stock: 120,
    presentaciones: [
      { nombre: 'Lata', factor: 1, codigo: '7790001000042', precio: 7000 },
      { nombre: 'Pack x6', factor: 6, codigo: '7790001000059', precio: 40000 },
    ],
  },
  {
    codigo: 'GAS-001', nombre: 'Gaseosa Cola 2L', categoria: 'Gaseosas', unidad: 'Botella',
    costo: 8000, margen: 30, minimo: 12, stock: 60,
    presentaciones: [
      { nombre: 'Botella', factor: 1, codigo: '7790002000015', precio: 11000 },
      { nombre: 'Pack x6', factor: 6, codigo: '7790002000022', precio: 62000 },
    ],
  },
  {
    codigo: 'AGU-001', nombre: 'Agua Mineral 500ml', categoria: 'Aguas', unidad: 'Botella',
    costo: 2000, margen: 50, minimo: 24, stock: 180,
    presentaciones: [
      { nombre: 'Botella', factor: 1, codigo: '7790003000019', precio: 3000 },
      { nombre: 'Pack x12', factor: 12, codigo: '7790003000026', precio: 33000 },
    ],
  },
  {
    codigo: 'SNK-001', nombre: 'Mani Salado 100g', categoria: 'Snacks', unidad: 'Paquete',
    costo: 3000, margen: 60, minimo: 20, stock: 15,
    presentaciones: [{ nombre: 'Paquete', factor: 1, codigo: '7790004000013', precio: 5000 }],
  },
];

async function main() {
  await setup.crearBaseSiFalta();
  await setup.correrEsquema();
  await setup.datosBase();

  const yaHay = await db.uno('SELECT COUNT(*) AS n FROM productos');
  if (Number(yaHay.n) > 0) {
    console.log('Ya hay productos cargados: no se vuelve a sembrar.');
    await db.cerrar();
    return;
  }

  const admin = await db.uno("SELECT * FROM usuarios WHERE rol = 'admin' ORDER BY id LIMIT 1");

  for (const rol of [
    { usuario: 'vendedor', nombre: 'Vendedor Mostrador', rol: 'vendedor', menus: ['tablero', 'pos', 'ventas', 'clientes', 'caja', 'presupuestos'] },
    { usuario: 'deposito', nombre: 'Encargado de Deposito', rol: 'deposito', menus: ['tablero', 'stock', 'catalogo', 'compras', 'proveedores'] },
  ]) {
    const existe = await db.uno('SELECT id FROM usuarios WHERE usuario = ?', [rol.usuario]);
    if (existe) continue;
    const sal = passwords.generarSal();
    const r = await db.ejecutar('INSERT INTO usuarios (usuario, nombre, rol, pass_hash, salt) VALUES (?, ?, ?, ?, ?)', [
      rol.usuario, rol.nombre, rol.rol, passwords.hashear('123456', sal), sal,
    ]);
    for (const menu of rol.menus) {
      await db.ejecutar('INSERT IGNORE INTO usuario_menus (usuario_id, menu) VALUES (?, ?)', [r.insertId, menu]);
    }
  }

  for (const p of PRODUCTOS) {
    let categoria = await db.uno('SELECT id FROM categorias WHERE nombre = ?', [p.categoria]);
    if (!categoria) {
      const r = await db.ejecutar('INSERT INTO categorias (nombre) VALUES (?)', [p.categoria]);
      categoria = { id: r.insertId };
    }
    const r = await db.ejecutar(
      `INSERT INTO productos (codigo_interno, nombre, categoria_id, unidad_base, stock, stock_minimo, costo_unitario, margen)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      [p.codigo, p.nombre, categoria.id, p.unidad, p.minimo, p.costo, p.margen]
    );
    const productoId = r.insertId;
    for (const pres of p.presentaciones) {
      await db.ejecutar(
        'INSERT INTO presentaciones (producto_id, nombre, factor, codigo_barras, precio, es_base) VALUES (?, ?, ?, ?, ?, ?)',
        [productoId, pres.nombre, pres.factor, pres.codigo, pres.precio, pres.factor === 1 ? 1 : 0]
      );
    }
    await db.ejecutar('UPDATE productos SET stock = ? WHERE id = ?', [p.stock, productoId]);
    await db.ejecutar(
      `INSERT INTO movimientos_stock (producto_id, origen, referencia_tipo, referencia_id, cantidad, stock_antes, stock_despues, usuario_id, detalle)
       VALUES (?, 'inicial', 'producto', ?, ?, 0, ?, ?, 'Carga inicial de ejemplo')`,
      [productoId, productoId, p.stock, p.stock, admin ? admin.id : null]
    );
  }

  for (const c of [
    { nombre: 'Almacen Dona Rosa', telefono: '0981111222', limite: 2000000 },
    { nombre: 'Kiosco El Rapido', telefono: '0982333444', limite: 500000 },
    { nombre: 'Consumidor Final', telefono: null, limite: 0 },
  ]) {
    await db.ejecutar('INSERT INTO clientes (nombre, telefono, limite_credito) VALUES (?, ?, ?)', [
      c.nombre, c.telefono, c.limite,
    ]);
  }

  for (const p of [
    { nombre: 'Distribuidora Central', ruc: '80012345-6' },
    { nombre: 'Bebidas del Este', ruc: '80098765-4' },
  ]) {
    await db.ejecutar('INSERT INTO proveedores (nombre, ruc) VALUES (?, ?)', [p.nombre, p.ruc]);
  }

  console.log('Datos de ejemplo cargados.');
  await db.cerrar();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
