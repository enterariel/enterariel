function aFecha(valor) {
  const d = valor instanceof Date ? new Date(valor.getTime()) : new Date(valor);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sumarDias(fecha, dias) {
  const d = aFecha(fecha);
  d.setDate(d.getDate() + Number(dias));
  return d;
}

// 31 de enero + 1 mes = 28/29 de febrero (no se derrama a marzo).
function sumarMeses(fecha, meses) {
  const d = aFecha(fecha);
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + Number(meses));
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimoDia));
  return d;
}

function siguienteVencimiento(base, frecuencia, indice) {
  if (frecuencia === 'semanal') return sumarDias(base, 7 * indice);
  if (frecuencia === 'quincenal') return sumarDias(base, 15 * indice);
  return sumarMeses(base, indice);
}

function iso(fecha) {
  const d = aFecha(fecha);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function hoyIso() {
  return iso(new Date());
}

module.exports = { aFecha, sumarDias, sumarMeses, siguienteVencimiento, iso, hoyIso };
