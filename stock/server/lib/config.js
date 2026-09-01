const db = require('../db');

const DEFAULTS = {
  negocio_nombre: 'Mi Negocio',
  negocio_ruc: '',
  negocio_direccion: '',
  negocio_telefono: '',
  moneda_simbolo: 'Gs.',

  // 'cuotas_fijas' | 'libreta' — mutuamente excluyentes para todo el negocio.
  modalidad_credito: 'cuotas_fijas',

  entrega_minima_pct: '20',
  entrega_fuerte_pct: '50',
  recargo_general_pct: '15',
  cuotas_permitidas: '1,2,3,4,6,9,12',
  frecuencia_default: 'mensual',
  dias_primer_vencimiento: '30',
  redondeo_cuota: '1000',

  sesion_horas: '12',
  inactividad_minutos: '20',

  tienda_activa: '1',
  tienda_whatsapp: '',
};

let cache = null;

async function todo() {
  if (cache) return cache;
  const filas = await db.query('SELECT clave, valor FROM config');
  const valores = { ...DEFAULTS };
  for (const f of filas) valores[f.clave] = f.valor;
  cache = valores;
  return cache;
}

async function obtener(clave) {
  const valores = await todo();
  return valores[clave];
}

async function numero(clave) {
  return Number(await obtener(clave));
}

async function guardar(cambios, conn = null) {
  const ejecutor = conn || db;
  for (const [clave, valor] of Object.entries(cambios)) {
    await ejecutor.query(
      'INSERT INTO config (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)',
      [clave, String(valor)]
    );
  }
  cache = null;
  return todo();
}

function invalidar() {
  cache = null;
}

module.exports = { DEFAULTS, todo, obtener, numero, guardar, invalidar };
