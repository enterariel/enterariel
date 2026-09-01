import { api } from '../api.js';
import { el, gs, numero, hoy, primerDiaMes, pagina, tabla, aviso, boton, imprimir } from '../ui.js';

export async function render(contenedor) {
  const disponibles = await api.get('/reportes');
  const selector = el('select', {}, disponibles.map((r) => el('option', { value: r.clave, text: r.titulo })));
  const desde = el('input', { type: 'date', value: primerDiaMes() });
  const hasta = el('input', { type: 'date', value: hoy() });
  const salida = el('div');
  let ultimo = null;

  function query() {
    return `desde=${desde.value}&hasta=${hasta.value}`;
  }

  function celda(col, fila) {
    const valor = fila[col.campo];
    if (col.moneda) return gs(valor);
    if (col.suma) return numero(valor);
    return valor === null || valor === undefined ? '' : String(valor);
  }

  async function correr() {
    try {
      ultimo = await api.get(`/reportes/${selector.value}?${query()}`);
    } catch (err) {
      aviso(err.message, 'error');
      return;
    }
    salida.textContent = '';
    salida.appendChild(el('h3', { text: ultimo.titulo }));
    if (!ultimo.filas.length) {
      salida.appendChild(el('p', { text: 'Sin datos en el período elegido.' }));
      return;
    }
    const pie = el('tr', {}, ultimo.columnas.map((c, i) => {
      if (i === 0) return el('th', { text: 'TOTAL' });
      return el('th', { class: c.clase || 'num', text: c.suma ? (c.moneda ? gs(ultimo.totales[c.campo]) : numero(ultimo.totales[c.campo])) : '' });
    }));
    salida.appendChild(tabla(
      ultimo.columnas.map((c) => ({ titulo: c.titulo, clase: c.suma || c.moneda ? 'num' : null, valor: (f) => celda(c, f) })),
      ultimo.filas,
      { pie }
    ));
  }

  contenedor.appendChild(
    pagina('Reportes', [
      selector, desde, hasta,
      boton('Ver', correr, 'primario'),
      boton('Descargar CSV', () => api.descargar(`/reportes/${selector.value}?${query()}&formato=csv`, `${selector.value}.csv`)),
      boton('Imprimir', () => {
        if (!ultimo) return aviso('Generá primero el reporte', 'error');
        imprimir(reporteHtml(ultimo, desde.value, hasta.value));
      }),
    ], [salida])
  );

  await correr();
}

function reporteHtml(reporte, desde, hasta) {
  const encabezado = reporte.columnas.map((c) => `<th>${c.titulo}</th>`).join('');
  const filas = reporte.filas
    .map((f) => `<tr>${reporte.columnas.map((c) => `<td class="${c.moneda || c.suma ? 'num' : ''}">${c.moneda ? gs(f[c.campo]) : f[c.campo] ?? ''}</td>`).join('')}</tr>`)
    .join('');
  const totales = reporte.columnas
    .map((c, i) => (i === 0 ? '<th>TOTAL</th>' : `<th class="num">${c.suma ? (c.moneda ? gs(reporte.totales[c.campo]) : numero(reporte.totales[c.campo])) : ''}</th>`))
    .join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${reporte.titulo}</title>
  <style>body{font-family:system-ui,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:4px;text-align:left}.num{text-align:right}</style>
  </head><body>
  <h1>${reporte.titulo}</h1><p>Período: ${desde} al ${hasta}</p>
  <table><thead><tr>${encabezado}</tr></thead><tbody>${filas}</tbody><tfoot><tr>${totales}</tr></tfoot></table>
  </body></html>`;
}
