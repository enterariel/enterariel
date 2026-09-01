process.env.DB_NAME = process.env.DB_NAME_TEST || 'stock_test';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');

const db = require('../server/db');
const setup = require('../server/setup');
const app = require('../server/index');

let servidor;
let base;
let cookie = '';

async function api(metodo, ruta, cuerpo) {
  const res = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const texto = await res.text();
  let datos;
  try { datos = JSON.parse(texto); } catch (_) { datos = texto; }
  return { estado: res.status, datos };
}

async function limpiar() {
  const tablas = [
    'devolucion_items', 'devoluciones', 'pago_aplicaciones', 'pagos', 'libreta_movimientos', 'libretas',
    'cuotas', 'facturas', 'venta_items', 'ventas', 'presupuesto_items', 'presupuestos', 'compra_items',
    'compras', 'gastos', 'caja_movimientos', 'cajas', 'cc_movimientos', 'movimientos_stock',
    'presentaciones', 'productos', 'categorias', 'clientes', 'proveedores', 'timbrados', 'auditoria',
    'sesiones', 'usuario_menus', 'usuarios', 'recargo_tramos', 'categorias_gasto', 'config',
  ];
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of tablas) await db.query(`TRUNCATE TABLE ${t}`);
  await db.query('SET FOREIGN_KEY_CHECKS = 1');
  require('../server/lib/config').invalidar();
}

test.before(async () => {
  await setup.crearBaseSiFalta();
  await setup.correrEsquema();
  await limpiar();
  await setup.datosBase();
  servidor = app.listen(0);
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
  const login = await api('POST', '/api/auth/login', { usuario: 'admin', password: 'admin123' });
  assert.equal(login.estado, 200);
});

test.after(async () => {
  servidor.close();
  await db.cerrar();
});

let productoId;
let presLata;
let presPack;
let presCajon;
let clienteId;

test('crea un producto con presentaciones sobre un unico pozo de stock', async () => {
  const r = await api('POST', '/api/catalogo/productos', {
    codigo_interno: 'TEST-001',
    nombre: 'Cerveza Test',
    unidad_base: 'Lata',
    costo_unitario: 4000,
    margen: null,
    stock_inicial: 100,
    presentaciones: [
      { nombre: 'Lata', factor: 1, codigo_barras: 'L1', precio: 6000 },
      { nombre: 'Pack x6', factor: 6, codigo_barras: 'P6', precio: 34000 },
      { nombre: 'Cajon x24', factor: 24, codigo_barras: 'C24', precio: 130000 },
    ],
  });
  assert.equal(r.estado, 201);
  productoId = r.datos.id;
  presLata = r.datos.presentaciones.find((p) => p.factor === 1).id;
  presPack = r.datos.presentaciones.find((p) => p.factor === 6).id;
  presCajon = r.datos.presentaciones.find((p) => p.factor === 24).id;
  assert.equal(r.datos.stock, 100);
  assert.equal(r.datos.desglose, '4 Cajon x24 + 4 Lata');
});

test('el buscador encuentra por codigo de barras de cualquier presentacion', async () => {
  const r = await api('GET', '/api/catalogo/buscar?q=P6');
  assert.equal(r.datos.length, 1);
  assert.equal(r.datos[0].presentacion_sugerida_id, presPack);
});

test('vender 1 pack x6 + 4 sueltas descuenta 10 unidades base', async () => {
  const r = await api('POST', '/api/ventas', {
    condicion: 'contado',
    items: [
      { presentacion_id: presPack, cantidad: 1 },
      { presentacion_id: presLata, cantidad: 4 },
    ],
  });
  assert.equal(r.estado, 201);
  assert.equal(r.datos.total, 34000 + 4 * 6000);
  const producto = await api('GET', `/api/catalogo/productos/${productoId}`);
  assert.equal(producto.datos.stock, 90);
});

test('la disponibilidad se valida sumando todas las lineas del mismo producto', async () => {
  const r = await api('POST', '/api/ventas', {
    condicion: 'contado',
    items: [
      { presentacion_id: presCajon, cantidad: 3 },
      { presentacion_id: presLata, cantidad: 30 },
    ],
  });
  assert.equal(r.estado, 400);
  assert.match(r.datos.error, /Stock insuficiente/);
  const producto = await api('GET', `/api/catalogo/productos/${productoId}`);
  assert.equal(producto.datos.stock, 90, 'una venta fallida no deja nada grabado');
});

test('venta a credito: clasifica, aplica recargo y arma cuotas con redondeo en la ultima', async () => {
  const cliente = await api('POST', '/api/clientes', { nombre: 'Cliente Credito', limite_credito: 0 });
  clienteId = cliente.datos.id;

  const r = await api('POST', '/api/ventas', {
    condicion: 'credito',
    cliente_id: clienteId,
    entrega_inicial: 10000,
    cuotas: 3,
    items: [{ presentacion_id: presLata, cantidad: 10 }],
  });
  assert.equal(r.estado, 201);
  // 60.000 de venta, entrega 10.000 (16,6% < 20%) => bajo minimo, financia igual.
  assert.equal(r.datos.clasificacion, 'bajo_minimo');
  assert.equal(r.datos.recargo, 5000);
  assert.equal(r.datos.cuotas.length, 3);
  const suma = r.datos.cuotas.reduce((a, c) => a + c.monto, 0);
  assert.equal(suma, 55000);
  assert.equal(r.datos.cuotas[0].monto, 18000);
  assert.equal(r.datos.cuotas[2].monto, 19000, 'la diferencia de redondeo va a la ultima cuota');

  const ficha = await api('GET', `/api/clientes/${clienteId}`);
  assert.equal(Number(ficha.datos.saldo), 55000);
});

test('el limite de credito frena la venta', async () => {
  const cliente = await api('POST', '/api/clientes', { nombre: 'Cliente Limitado', limite_credito: 10000 });
  const r = await api('POST', '/api/ventas', {
    condicion: 'credito',
    cliente_id: cliente.datos.id,
    cuotas: 1,
    items: [{ presentacion_id: presLata, cantidad: 5 }],
  });
  assert.equal(r.estado, 400);
  assert.match(r.datos.error, /limite de credito/);
});

test('cobranza imputa a las cuotas mas viejas y no admite pagar de mas', async () => {
  const exceso = await api('POST', `/api/clientes/${clienteId}/pagos`, { monto: 999999 });
  assert.equal(exceso.estado, 400);

  const pago = await api('POST', `/api/clientes/${clienteId}/pagos`, { monto: 20000 });
  assert.equal(pago.estado, 201);
  assert.equal(pago.datos.saldo, 35000);
  assert.equal(pago.datos.aplicaciones[0].numero, 1);
});

test('devolucion parcial repone stock y acredita solo lo devuelto', async () => {
  const venta = await api('POST', '/api/ventas', {
    condicion: 'contado',
    items: [{ presentacion_id: presPack, cantidad: 2 }],
  });
  const detalle = await api('GET', `/api/ventas/${venta.datos.venta_id}`);
  const item = detalle.datos.items[0];

  const stockAntes = (await api('GET', `/api/catalogo/productos/${productoId}`)).datos.stock;
  const dev = await api('POST', `/api/ventas/${venta.datos.venta_id}/devoluciones`, {
    items: [{ venta_item_id: item.id, cantidad: 1 }],
    motivo: 'Producto fallado',
  });
  assert.equal(dev.estado, 201);
  assert.equal(dev.datos.total, 34000);
  const stockDespues = (await api('GET', `/api/catalogo/productos/${productoId}`)).datos.stock;
  assert.equal(stockDespues - stockAntes, 6);

  const exceso = await api('POST', `/api/ventas/${venta.datos.venta_id}/devoluciones`, {
    items: [{ venta_item_id: item.id, cantidad: 2 }],
  });
  assert.equal(exceso.estado, 400, 'no se puede devolver mas de lo vendido');
});

test('anular una venta con devolucion parcial no repone dos veces', async () => {
  const venta = await api('POST', '/api/ventas', {
    condicion: 'contado',
    items: [{ presentacion_id: presLata, cantidad: 10 }],
  });
  const detalle = await api('GET', `/api/ventas/${venta.datos.venta_id}`);
  await api('POST', `/api/ventas/${venta.datos.venta_id}/devoluciones`, {
    items: [{ venta_item_id: detalle.datos.items[0].id, cantidad: 4 }],
  });

  const stockAntes = (await api('GET', `/api/catalogo/productos/${productoId}`)).datos.stock;
  const anulacion = await api('POST', `/api/ventas/${venta.datos.venta_id}/anular`, { motivo: 'Prueba' });
  assert.equal(anulacion.estado, 200);
  const stockDespues = (await api('GET', `/api/catalogo/productos/${productoId}`)).datos.stock;
  assert.equal(stockDespues - stockAntes, 6, 'solo se reponen las 6 unidades que no se habian devuelto');

  const repetida = await api('POST', `/api/ventas/${venta.datos.venta_id}/anular`, {});
  assert.equal(repetida.estado, 400);
});

test('compra convierte el costo del bulto a unidad base y reprecia por margen', async () => {
  await api('PUT', `/api/catalogo/productos/${productoId}`, { margen: 50 });
  const proveedor = await api('POST', '/api/proveedores', { nombre: 'Proveedor Test' });

  const compra = await api('POST', '/api/compras', {
    proveedor_id: proveedor.datos.id,
    condicion: 'credito',
    items: [{ presentacion_id: presCajon, cantidad: 2, costo_presentacion: 120000 }],
  });
  assert.equal(compra.estado, 201);
  assert.equal(compra.datos.total, 240000);

  const producto = await api('GET', `/api/catalogo/productos/${productoId}`);
  assert.equal(Number(producto.datos.costo_unitario), 5000);
  const lata = producto.datos.presentaciones.find((p) => p.factor === 1);
  const cajon = producto.datos.presentaciones.find((p) => p.factor === 24);
  assert.equal(Number(lata.precio), 7500);
  assert.equal(Number(cajon.precio), 180000);

  const ficha = await api('GET', `/api/proveedores/${proveedor.datos.id}`);
  assert.equal(Number(ficha.datos.saldo), 240000);
});

test('caja: el arqueo no incluye cobranzas de cuenta corriente', async () => {
  const caja = await api('POST', '/api/caja/abrir', { fondo_inicial: 50000 });
  assert.equal(caja.estado, 201);
  const cajaId = caja.datos.id;

  await api('POST', '/api/ventas', { condicion: 'contado', items: [{ presentacion_id: presLata, cantidad: 2 }] });
  await api('POST', `/api/clientes/${clienteId}/pagos`, { monto: 5000 });

  const actual = await api('GET', '/api/caja/actual');
  assert.equal(actual.datos.esperado_actual, 50000 + 2 * 7500);

  const cierre = await api('POST', `/api/caja/${cajaId}/cerrar`, { contado: 60000 });
  assert.equal(cierre.datos.esperado, 65000);
  assert.equal(cierre.datos.diferencia, -5000);
});

test('conteo fisico: primero simula, despues aplica', async () => {
  const simulacion = await api('POST', '/api/stock/conteo/simular', {
    csv: 'codigo;nombre;unidad;contado\nTEST-001;Cerveza Test;Lata;77\nNOEXISTE;X;Lata;5\n',
  });
  assert.equal(simulacion.datos.resumen.error, 1);

  const bloqueo = await api('POST', '/api/stock/conteo/aplicar', {
    csv: 'codigo;contado\nTEST-001;77\nNOEXISTE;5\n',
  });
  assert.equal(bloqueo.estado, 400, 'no aplica si hay errores');

  const aplicado = await api('POST', '/api/stock/conteo/aplicar', { csv: 'codigo;contado\nTEST-001;77\n' });
  assert.equal(aplicado.estado, 200);
  const producto = await api('GET', `/api/catalogo/productos/${productoId}`);
  assert.equal(producto.datos.stock, 77);

  const kardex = await api('GET', `/api/stock/kardex/${productoId}`);
  assert.equal(kardex.datos[0].origen, 'ajuste');
  assert.equal(kardex.datos[0].stock_despues, 77);
});

test('presupuesto se convierte en venta y recien ahi descuenta stock', async () => {
  const presupuesto = await api('POST', '/api/presupuestos', {
    cliente_id: clienteId,
    items: [{ presentacion_id: presPack, cantidad: 1 }],
  });
  assert.equal(presupuesto.estado, 201);
  const stockAntes = (await api('GET', `/api/catalogo/productos/${productoId}`)).datos.stock;

  await api('POST', `/api/presupuestos/${presupuesto.datos.presupuesto_id}/aprobar`);
  const venta = await api('POST', `/api/presupuestos/${presupuesto.datos.presupuesto_id}/convertir`, {
    condicion: 'contado',
  });
  assert.equal(venta.estado, 201);
  const stockDespues = (await api('GET', `/api/catalogo/productos/${productoId}`)).datos.stock;
  assert.equal(stockAntes - stockDespues, 6);

  const repetida = await api('POST', `/api/presupuestos/${presupuesto.datos.presupuesto_id}/convertir`, {});
  assert.equal(repetida.estado, 400);
});

test('factura respeta el rango del timbrado', async () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const anio = new Date().getFullYear() + 1;
  await api('POST', '/api/timbrados', {
    numero: '12345678', desde: 1, hasta: 2, vigencia_desde: '2020-01-01', vigencia_hasta: `${anio}-12-31`,
  });
  assert.ok(hoy);

  const v1 = await api('POST', '/api/ventas', {
    condicion: 'contado', con_factura: true, items: [{ presentacion_id: presLata, cantidad: 1 }],
  });
  assert.equal(v1.datos.factura.numero_formateado, '001-001-0000001');

  const v2 = await api('POST', '/api/ventas', {
    condicion: 'contado', con_factura: true, items: [{ presentacion_id: presLata, cantidad: 1 }],
  });
  assert.equal(v2.datos.factura.numero, 2);

  const v3 = await api('POST', '/api/ventas', {
    condicion: 'contado', con_factura: true, items: [{ presentacion_id: presLata, cantidad: 1 }],
  });
  assert.equal(v3.estado, 400);
  assert.match(v3.datos.error, /cupo del timbrado/);
});

test('modalidad libreta: sin cuotas, se resta con pagos y se cierra sola', async () => {
  await api('PUT', '/api/config', { modalidad_credito: 'libreta' });
  const cliente = await api('POST', '/api/clientes', { nombre: 'Cliente Libreta' });
  const id = cliente.datos.id;

  const venta = await api('POST', '/api/ventas', {
    condicion: 'credito', cliente_id: id, entrega_inicial: 5000,
    items: [{ presentacion_id: presLata, cantidad: 4 }],
  });
  assert.equal(venta.estado, 201);
  assert.ok(venta.datos.libreta_id);
  assert.equal(venta.datos.cuotas, undefined);

  const ficha = await api('GET', `/api/clientes/${id}`);
  assert.equal(ficha.datos.libreta.saldo, 25000);

  await api('POST', `/api/clientes/${id}/pagos`, { monto: 25000 });
  const cerrada = await api('GET', `/api/clientes/${id}`);
  assert.equal(cerrada.datos.libreta, null, 'la libreta se cierra al llegar a cero');
  assert.equal(Number(cerrada.datos.saldo), 0);
  await api('PUT', '/api/config', { modalidad_credito: 'cuotas_fijas' });
});

test('el vendedor no puede anular ventas ajenas', async () => {
  await api('POST', '/api/usuarios', { usuario: 'vend1', nombre: 'Vendedor 1', rol: 'vendedor', password: 'clave123' });
  const venta = await api('POST', '/api/ventas', {
    condicion: 'contado', items: [{ presentacion_id: presLata, cantidad: 1 }],
  });
  const cookieAdmin = cookie;
  await api('POST', '/api/auth/login', { usuario: 'vend1', password: 'clave123' });
  const intento = await api('POST', `/api/ventas/${venta.datos.venta_id}/anular`, { motivo: 'x' });
  assert.equal(intento.estado, 403);
  cookie = cookieAdmin;
});

test('los reportes devuelven filas y totales', async () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const ranking = await api('GET', `/api/reportes/ranking_productos?desde=${hoy}&hasta=${hoy}`);
  assert.equal(ranking.estado, 200);
  assert.ok(ranking.datos.filas.length > 0);
  assert.ok(ranking.datos.totales.importe > 0);

  const valorizado = await api('GET', '/api/reportes/inventario_valorizado');
  assert.ok(valorizado.datos.totales.valor_costo > 0);

  const tablero = await api('GET', '/api/tablero');
  assert.ok(tablero.datos.ventas_dia.tickets > 0);
});

test('sin sesion la API responde 401', async () => {
  const guardada = cookie;
  cookie = '';
  const r = await api('GET', '/api/catalogo/productos');
  assert.equal(r.estado, 401);
  cookie = guardada;
});

test('el precio lo pone el catalogo, no el cliente', async () => {
  const producto = await api('GET', `/api/catalogo/productos/${productoId}`);
  const lata = producto.datos.presentaciones.find((p) => p.factor === 1);
  const r = await api('POST', '/api/ventas', {
    condicion: 'contado',
    items: [{ presentacion_id: presLata, cantidad: 1, precio_unitario: 1 }],
  });
  assert.equal(r.estado, 201);
  assert.equal(r.datos.total, Number(lata.precio));
});

test('repetir la misma linea en una devolucion no permite devolver de mas', async () => {
  const venta = await api('POST', '/api/ventas', {
    condicion: 'contado', items: [{ presentacion_id: presPack, cantidad: 1 }],
  });
  const detalle = await api('GET', `/api/ventas/${venta.datos.venta_id}`);
  const itemId = detalle.datos.items[0].id;
  const stockAntes = (await api('GET', `/api/catalogo/productos/${productoId}`)).datos.stock;

  const doble = await api('POST', `/api/ventas/${venta.datos.venta_id}/devoluciones`, {
    items: [{ venta_item_id: itemId, cantidad: 1 }, { venta_item_id: itemId, cantidad: 1 }],
  });
  assert.equal(doble.estado, 400);
  const stockDespues = (await api('GET', `/api/catalogo/productos/${productoId}`)).datos.stock;
  assert.equal(stockDespues, stockAntes, 'la devolucion rechazada no repone nada');
});

test('la devolucion respeta el descuento de la venta', async () => {
  const venta = await api('POST', '/api/ventas', {
    condicion: 'contado', descuento: 5000, items: [{ presentacion_id: presPack, cantidad: 1 }],
  });
  const detalle = await api('GET', `/api/ventas/${venta.datos.venta_id}`);
  const dev = await api('POST', `/api/ventas/${venta.datos.venta_id}/devoluciones`, {
    items: [{ venta_item_id: detalle.datos.items[0].id, cantidad: 1 }],
  });
  assert.equal(dev.estado, 201);
  assert.equal(dev.datos.total, Number(venta.datos.total), 'se devuelve lo que el cliente pago, no el precio de lista');
});

test('un ajuste sin cantidad no borra el stock', async () => {
  const antes = (await api('GET', `/api/catalogo/productos/${productoId}`)).datos.stock;
  const r = await api('POST', '/api/stock/ajustes', { producto_id: productoId, cantidad_final: null });
  assert.equal(r.estado, 400);
  const despues = (await api('GET', `/api/catalogo/productos/${productoId}`)).datos.stock;
  assert.equal(despues, antes);
});

test('un pago mixto sin declarar el efectivo se rechaza', async () => {
  const r = await api('POST', '/api/ventas', {
    condicion: 'contado', medio_pago: 'mixto', items: [{ presentacion_id: presLata, cantidad: 1 }],
  });
  assert.equal(r.estado, 400);
  assert.match(r.datos.error, /efectivo/);
});

test('devolver una venta con tarjeta no saca plata de la caja', async () => {
  const caja = await api('POST', '/api/caja/abrir', { fondo_inicial: 20000 });
  assert.equal(caja.estado, 201);
  const venta = await api('POST', '/api/ventas', {
    condicion: 'contado', medio_pago: 'tarjeta', items: [{ presentacion_id: presLata, cantidad: 1 }],
  });
  const esperadoAntes = (await api('GET', '/api/caja/actual')).datos.esperado_actual;
  assert.equal(esperadoAntes, 20000, 'la venta con tarjeta no entra a la caja');

  await api('POST', `/api/ventas/${venta.datos.venta_id}/anular`, { motivo: 'tarjeta' });
  const esperadoDespues = (await api('GET', '/api/caja/actual')).datos.esperado_actual;
  assert.equal(esperadoDespues, 20000, 'la devolucion vuelve por tarjeta, no por caja');
  await api('POST', `/api/caja/${caja.datos.id}/cerrar`, { contado: 20000 });
});

test('los menus tambien se aplican en la API, no solo en el menu lateral', async () => {
  await api('POST', '/api/usuarios', {
    usuario: 'solopos', nombre: 'Solo Mostrador', rol: 'vendedor', password: 'clave123', menus: ['pos'],
  });
  const cookieAdmin = cookie;
  await api('POST', '/api/auth/login', { usuario: 'solopos', password: 'clave123' });

  const compras = await api('GET', '/api/compras');
  assert.equal(compras.estado, 403);
  const gastos = await api('GET', '/api/gastos');
  assert.equal(gastos.estado, 403);
  const buscar = await api('GET', '/api/catalogo/buscar?q=L1');
  assert.equal(buscar.estado, 200, 'el mostrador sigue pudiendo buscar productos');
  cookie = cookieAdmin;
});

test('una mutacion desde otro origen se rechaza', async () => {
  const res = await fetch(`${base}/api/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://sitio-atacante.example' },
    body: JSON.stringify({ nombre: 'CSRF' }),
  });
  assert.equal(res.status, 403);
});

test('el backup es POST de admin y no una simple navegacion', async () => {
  const porGet = await api('GET', '/api/config/backup');
  assert.equal(porGet.estado, 404);
  const r = await api('POST', '/api/config/backup');
  assert.equal(r.estado, 200);
  assert.ok(r.datos.tablas.productos.length > 0);
});
