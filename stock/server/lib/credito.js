const db = require('../db');
const config = require('./config');
const { gs, redondearAbajo } = require('./money');
const { siguienteVencimiento, iso, sumarDias } = require('./fechas');
const { malPedido } = require('./errors');

const FRECUENCIAS = ['semanal', 'quincenal', 'mensual'];

async function tramos() {
  return db.query('SELECT * FROM recargo_tramos ORDER BY cuotas_desde');
}

async function recargoPorCuotas(cantidad) {
  const lista = await tramos();
  const tramo = lista.find((t) => cantidad >= Number(t.cuotas_desde) && cantidad <= Number(t.cuotas_hasta));
  if (tramo) return Number(tramo.porcentaje);
  return Number(await config.obtener('recargo_general_pct'));
}

// Clasifica la venta segun cuanto entrega el cliente. "bajo_minimo" avisa pero
// nunca bloquea la venta.
function clasificar(total, entrega, entregaMinimaPct, entregaFuertePct) {
  if (gs(entrega) >= gs(total)) return 'contado';
  const pct = gs(total) === 0 ? 100 : (gs(entrega) * 100) / gs(total);
  if (pct >= entregaFuertePct) return 'entrega_fuerte';
  if (pct >= entregaMinimaPct) return 'con_recargo';
  return 'bajo_minimo';
}

// El servidor recalcula esto igual al confirmar: la pantalla solo previsualiza.
async function simular({ total, entrega = 0, cuotas = 1, frecuencia = null, fecha = new Date() }) {
  const cfg = await config.todo();
  const modalidad = cfg.modalidad_credito;
  const totalGs = gs(total);
  const entregaGs = Math.min(gs(entrega), totalGs);

  if (modalidad === 'libreta') {
    return {
      modalidad: 'libreta',
      clasificacion: entregaGs >= totalGs ? 'contado' : 'con_recargo',
      total_contado: totalGs,
      entrega: entregaGs,
      recargo_pct: 0,
      recargo: 0,
      total_final: totalGs,
      financiado: totalGs - entregaGs,
      cuotas: [],
      avisos: [],
    };
  }

  const permitidas = String(cfg.cuotas_permitidas)
    .split(',')
    .map((n) => Number(n.trim()))
    .filter(Boolean);
  const cantidad = Number(cuotas) || 1;
  if (entregaGs < totalGs && !permitidas.includes(cantidad)) {
    throw malPedido(`Cantidad de cuotas no permitida: ${cantidad}. Permitidas: ${permitidas.join(', ')}`);
  }

  const frec = FRECUENCIAS.includes(frecuencia) ? frecuencia : cfg.frecuencia_default;
  const clasificacion = clasificar(
    totalGs,
    entregaGs,
    Number(cfg.entrega_minima_pct),
    Number(cfg.entrega_fuerte_pct)
  );

  const avisos = [];
  let recargoPct = 0;
  if (clasificacion === 'con_recargo' || clasificacion === 'bajo_minimo') {
    recargoPct = await recargoPorCuotas(cantidad);
  }
  if (clasificacion === 'bajo_minimo') {
    avisos.push(
      `La entrega esta por debajo del minimo de ${cfg.entrega_minima_pct}%: la venta se financia igual pero queda marcada.`
    );
  }

  const aFinanciar = totalGs - entregaGs;
  const recargo = gs((aFinanciar * recargoPct) / 100);
  const financiado = aFinanciar + recargo;
  const totalFinal = totalGs + recargo;

  const listaCuotas = [];
  if (financiado > 0) {
    const redondeo = Number(cfg.redondeo_cuota) || 1;
    const base = redondearAbajo(financiado / cantidad, redondeo);
    const primerVenc = sumarDias(fecha, Number(cfg.dias_primer_vencimiento));
    let acumulado = 0;
    for (let i = 1; i <= cantidad; i++) {
      const esUltima = i === cantidad;
      // La diferencia de redondeo se acumula toda en la ultima cuota.
      const monto = esUltima ? financiado - acumulado : base;
      acumulado += monto;
      listaCuotas.push({
        numero: i,
        vencimiento: iso(siguienteVencimiento(primerVenc, frec, i - 1)),
        monto: gs(monto),
      });
    }
  }

  return {
    modalidad: 'cuotas_fijas',
    clasificacion,
    total_contado: totalGs,
    entrega: entregaGs,
    cantidad_cuotas: financiado > 0 ? cantidad : 0,
    frecuencia: frec,
    recargo_pct: recargoPct,
    recargo,
    total_final: totalFinal,
    financiado,
    cuotas: listaCuotas,
    avisos,
  };
}

module.exports = { simular, clasificar, recargoPorCuotas, tramos, FRECUENCIAS };
