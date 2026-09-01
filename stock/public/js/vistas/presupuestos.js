import { api } from '../api.js';
import { el, gs, numero, fecha, pagina, tabla, modal, aviso, boton, imprimir } from '../ui.js';

export async function render(contenedor) {
  const lista = el('div');
  const filtro = el('select', {}, [
    el('option', { value: '', text: 'Todos' }),
    el('option', { value: 'pendiente', text: 'Pendientes' }),
    el('option', { value: 'aprobado', text: 'Aprobados' }),
    el('option', { value: 'convertido', text: 'Convertidos' }),
    el('option', { value: 'anulado', text: 'Anulados' }),
  ]);

  async function refrescar() {
    const datos = await api.get(`/presupuestos${filtro.value ? `?estado=${filtro.value}` : ''}`);
    lista.textContent = '';
    lista.appendChild(
      tabla(
        [
          { titulo: 'N°', campo: 'numero' },
          { titulo: 'Fecha', valor: (p) => fecha(p.fecha, true) },
          { titulo: 'Cliente', valor: (p) => p.cliente_nombre || 'Consumidor final' },
          { titulo: 'Vendedor', campo: 'vendedor' },
          { titulo: 'Validez', valor: (p) => `${p.validez_dias} días` },
          { titulo: 'Total', clase: 'num', valor: (p) => gs(p.total) },
          { titulo: 'Estado', campo: 'estado' },
        ],
        datos,
        { alClic: (p) => abrir(p.id) }
      )
    );
  }

  async function abrir(id) {
    const p = await api.get(`/presupuestos/${id}`);
    const cuerpo = el('div', {}, [
      el('p', { text: `${fecha(p.fecha, true)} · ${p.cliente_nombre || 'Consumidor final'} · ${p.estado}` }),
      el('p', { class: 'desglose', text: 'El presupuesto no reserva stock: recién al convertirlo se descuenta.' }),
      tabla(
        [
          { titulo: 'Producto', valor: (i) => `${i.producto_nombre} — ${i.presentacion_nombre}` },
          { titulo: 'Cant.', clase: 'num', valor: (i) => numero(i.cantidad) },
          { titulo: 'Precio', clase: 'num', valor: (i) => gs(i.precio_unitario) },
          { titulo: 'Importe', clase: 'num', valor: (i) => gs(i.importe) },
        ],
        p.items
      ),
      el('p', { class: 'pos-total', text: gs(p.total) }),
    ]);

    const acciones = [{ texto: 'Imprimir', accion: () => imprimir(presupuestoHtml(p)) }];
    if (p.estado === 'pendiente') {
      acciones.push({
        texto: 'Aprobar',
        accion: async (cerrar) => { await api.post(`/presupuestos/${p.id}/aprobar`); aviso('Presupuesto aprobado'); cerrar(); await refrescar(); },
      });
    }
    if (p.estado !== 'convertido' && p.estado !== 'anulado') {
      acciones.push({
        texto: 'Convertir en venta',
        clase: 'primario',
        accion: async (cerrar) => {
          try {
            const r = await api.post(`/presupuestos/${p.id}/convertir`, { condicion: 'contado', medio_pago: 'efectivo' });
            aviso(`Venta ${r.numero} generada por ${gs(r.total)}`);
            cerrar();
            await refrescar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      });
      acciones.push({
        texto: 'Anular',
        clase: 'peligro',
        accion: async (cerrar) => { await api.post(`/presupuestos/${p.id}/anular`); aviso('Presupuesto anulado'); cerrar(); await refrescar(); },
      });
    }
    modal(`Presupuesto N° ${p.numero}`, cuerpo, acciones);
  }

  filtro.addEventListener('change', () => refrescar().catch((e) => aviso(e.message, 'error')));
  contenedor.appendChild(
    pagina('Presupuestos', [filtro, boton('Actualizar', () => refrescar())], [
      el('p', { class: 'desglose', text: 'Los presupuestos se cargan desde el mostrador con F7 y se traen con F6.' }),
      lista,
    ])
  );
  await refrescar();
}

function presupuestoHtml(p) {
  const filas = p.items
    .map((i) => `<tr><td>${i.producto_nombre} (${i.presentacion_nombre})</td><td class="num">${numero(i.cantidad)}</td><td class="num">${gs(i.precio_unitario)}</td><td class="num">${gs(i.importe)}</td></tr>`)
    .join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Presupuesto ${p.numero}</title>
  <style>body{font-family:system-ui,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:6px}.num{text-align:right}</style>
  </head><body>
  <h1>Presupuesto N° ${p.numero}</h1>
  <p>${fecha(p.fecha, true)} — ${p.cliente_nombre || 'Consumidor final'}<br>Validez: ${p.validez_dias} días</p>
  <table><thead><tr><th>Detalle</th><th class="num">Cant</th><th class="num">P. unit</th><th class="num">Importe</th></tr></thead><tbody>${filas}</tbody></table>
  <h2 class="num">Total ${gs(p.total)}</h2>
  <p><small>Este presupuesto no reserva mercadería. Los precios pueden variar hasta la confirmación de la venta.</small></p>
  </body></html>`;
}
