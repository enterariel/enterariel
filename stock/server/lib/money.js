// Los montos son enteros de guaranies. Todo calculo que produzca decimales se
// redondea antes de guardarse para que la base nunca vea centimos.

function gs(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function entero(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

// Redondeo hacia abajo a un multiplo (ej. cuotas a multiplos de 1.000).
function redondearAbajo(valor, multiplo) {
  const m = Number(multiplo) || 1;
  if (m <= 1) return gs(valor);
  return Math.floor(Number(valor) / m) * m;
}

function porcentaje(base, pct) {
  return gs((Number(base) * Number(pct)) / 100);
}

// IVA incluido en el precio (Paraguay): 10% => monto/11, 5% => monto/21.
function ivaIncluido(importe, tasa) {
  const t = Number(tasa);
  if (!t) return 0;
  return gs(Number(importe) * (t / (100 + t)));
}

function formatearGs(valor) {
  return `Gs. ${gs(valor).toLocaleString('es-PY')}`;
}

module.exports = { gs, entero, redondearAbajo, porcentaje, ivaIncluido, formatearGs };
