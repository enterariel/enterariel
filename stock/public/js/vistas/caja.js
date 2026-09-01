import { api } from '../api.js';
import { el, gs, fecha, hoy, primerDiaMes, pagina, tabla, modal, aviso, boton, imprimir } from '../ui.js';
import { sesion } from '../app.js';

export async function render(contenedor) {
  const actual = el('div', { class: 'panel' });
  const historial = el('div');
  const desde = el('input', { type: 'date', value: primerDiaMes() });
  const hasta = el('input', { type: 'date', value: hoy() });

  async function refrescar() {
    const caja = await api.get('/caja/actual');
    actual.textContent = '';
    if (!caja) {
      const fondo = el('input', { type: 'number', value: 0 });
      actual.appendChild(el('h3', { text: 'No tenés caja abierta' }));
      actual.appendChild(el('div', { class: 'formulario' }, [
        el('label', {}, [el('span', { text: 'Fondo inicial' }), fondo]),
        boton('Abrir caja', async () => {
          try { await api.post('/caja/abrir', { fondo_inicial: Number(fondo.value || 0) }); aviso('Caja abierta'); await refrescar(); }
          catch (err) { aviso(err.message, 'error'); }
        }, 'primario'),
      ]));
      return;
    }

    actual.appendChild(el('h3', { text: `Caja #${caja.id} abierta el ${fecha(caja.abierta_en, true)}` }));
    actual.appendChild(el('p', { class: 'pos-total', text: `Esperado en caja: ${gs(caja.esperado_actual)}` }));
    actual.appendChild(el('p', { class: 'desglose', text: 'Fondo + entregas + ventas contado en efectivo + entregas iniciales − devoluciones − gastos. Las cobranzas de cuenta corriente quedan fuera.' }));
    actual.appendChild(tabla(
      [
        { titulo: 'Hora', valor: (m) => fecha(m.fecha, true) },
        { titulo: 'Tipo', campo: 'tipo' },
        { titulo: 'Detalle', campo: 'detalle' },
        { titulo: 'Monto', clase: 'num', valor: (m) => gs(m.monto) },
      ],
      caja.movimientos
    ));

    const acciones = el('div', { class: 'acciones' }, [
      boton('Cerrar caja / arqueo', () => cerrarCaja(caja), 'primario'),
      boton('Imprimir movimientos', () => imprimir(cajaHtml(caja))),
    ]);
    if (sesion.usuario && sesion.usuario.rol === 'admin') {
      acciones.appendChild(boton('Entregar efectivo', () => entregar(caja)));
    }
    actual.appendChild(acciones);
  }

  function entregar(caja) {
    const monto = el('input', { type: 'number' });
    const detalle = el('input', { value: 'Entrega de efectivo' });
    modal('Entrega de efectivo a la caja', el('div', { class: 'formulario' }, [
      el('label', {}, [el('span', { text: 'Monto' }), monto]),
      el('label', {}, [el('span', { text: 'Detalle' }), detalle]),
    ]), [
      { texto: 'Cancelar', accion: (cerrar) => cerrar() },
      {
        texto: 'Registrar',
        clase: 'primario',
        accion: async (cerrar) => {
          try { await api.post(`/caja/${caja.id}/entregas`, { monto: Number(monto.value), detalle: detalle.value }); aviso('Entrega registrada'); cerrar(); await refrescar(); }
          catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  function cerrarCaja(caja) {
    const contado = el('input', { type: 'number' });
    const observacion = el('input', { placeholder: 'Observación del arqueo' });
    const diferencia = el('p', { class: 'desglose', text: `Esperado ${gs(caja.esperado_actual)}` });
    contado.addEventListener('input', () => {
      const dif = Number(contado.value || 0) - Number(caja.esperado_actual);
      diferencia.textContent = `Esperado ${gs(caja.esperado_actual)} · diferencia ${gs(dif)} ${dif === 0 ? '' : dif > 0 ? '(sobrante)' : '(faltante)'}`;
    });
    modal('Cierre de caja', el('div', {}, [
      el('div', { class: 'formulario' }, [
        el('label', {}, [el('span', { text: 'Efectivo contado' }), contado]),
        el('label', {}, [el('span', { text: 'Observación' }), observacion]),
      ]),
      diferencia,
    ]), [
      { texto: 'Cancelar', accion: (cerrar) => cerrar() },
      {
        texto: 'Cerrar caja',
        clase: 'primario',
        accion: async (cerrar) => {
          try {
            const r = await api.post(`/caja/${caja.id}/cerrar`, { contado: Number(contado.value || 0), observacion: observacion.value });
            aviso(`Caja cerrada. Diferencia ${gs(r.diferencia)}`);
            cerrar();
            imprimir(cajaHtml(r));
            await refrescar();
            await cargarHistorial();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  async function cargarHistorial() {
    const cajas = await api.get(`/caja?desde=${desde.value}&hasta=${hasta.value}`);
    historial.textContent = '';
    historial.appendChild(el('h3', { text: 'Historial de cajas' }));
    historial.appendChild(tabla(
      [
        { titulo: '#', campo: 'id' },
        { titulo: 'Usuario', campo: 'usuario_nombre' },
        { titulo: 'Apertura', valor: (c) => fecha(c.abierta_en, true) },
        { titulo: 'Cierre', valor: (c) => (c.cerrada_en ? fecha(c.cerrada_en, true) : '') },
        { titulo: 'Esperado', clase: 'num', valor: (c) => gs(c.esperado) },
        { titulo: 'Contado', clase: 'num', valor: (c) => gs(c.contado) },
        { titulo: 'Diferencia', clase: 'num', valor: (c) => gs(c.diferencia) },
        { titulo: 'Estado', campo: 'estado' },
      ],
      cajas,
      { alClic: async (c) => {
        const detalle = await api.get(`/caja/${c.id}`);
        modal(`Caja #${c.id}`, tabla(
          [
            { titulo: 'Hora', valor: (m) => fecha(m.fecha, true) },
            { titulo: 'Tipo', campo: 'tipo' },
            { titulo: 'Detalle', campo: 'detalle' },
            { titulo: 'Monto', clase: 'num', valor: (m) => gs(m.monto) },
          ],
          detalle.movimientos
        ), [{ texto: 'Imprimir', accion: () => imprimir(cajaHtml(detalle)) }]);
      } }
    ));
  }

  contenedor.appendChild(
    pagina('Caja', [desde, hasta, boton('Buscar', () => cargarHistorial(), 'primario')], [actual, historial])
  );
  await refrescar();
  await cargarHistorial();
}

function cajaHtml(caja) {
  const filas = caja.movimientos
    .map((m) => `<tr><td>${fecha(m.fecha, true)}</td><td>${m.tipo}</td><td>${m.detalle || ''}</td><td class="num">${gs(m.monto)}</td></tr>`)
    .join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Caja ${caja.id}</title>
  <style>body{font-family:system-ui,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:4px}.num{text-align:right}</style>
  </head><body>
  <h1>Arqueo de caja #${caja.id}</h1>
  <p>Apertura: ${fecha(caja.abierta_en, true)}${caja.cerrada_en ? ` — Cierre: ${fecha(caja.cerrada_en, true)}` : ''}</p>
  <table><thead><tr><th>Hora</th><th>Tipo</th><th>Detalle</th><th class="num">Monto</th></tr></thead><tbody>${filas}</tbody></table>
  <p>Esperado: ${gs(caja.esperado_actual ?? caja.esperado)}<br>Contado: ${gs(caja.contado)}<br><strong>Diferencia: ${gs(caja.diferencia)}</strong></p>
  </body></html>`;
}
