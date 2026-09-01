import { api } from '../api.js';
import { el, gs, numero, fecha, hoy, pagina, tabla, modal, aviso, confirmar, imprimir, boton } from '../ui.js';
import { ticketHtml } from './ticket.js';

export async function render(contenedor) {
  const filtros = { desde: hoy(), hasta: hoy(), estado: '', condicion: '' };
  const lista = el('div');

  async function refrescar() {
    const params = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v));
    const ventas = await api.get(`/ventas?${params}`);
    lista.textContent = '';
    lista.appendChild(
      tabla(
        [
          { titulo: 'N°', campo: 'numero' },
          { titulo: 'Fecha', valor: (v) => fecha(v.fecha, true) },
          { titulo: 'Cliente', valor: (v) => v.cliente_nombre || 'Consumidor final' },
          { titulo: 'Vendedor', campo: 'vendedor' },
          { titulo: 'Condición', valor: (v) => (v.condicion === 'credito' ? `crédito (${v.clasificacion})` : 'contado') },
          { titulo: 'Factura', valor: (v) => v.factura || '' },
          { titulo: 'Total', clase: 'num', valor: (v) => gs(v.total) },
          { titulo: 'Estado', campo: 'estado' },
        ],
        ventas,
        { alClic: (v) => abrir(v.id), claseFila: (v) => (v.estado === 'anulada' ? 'anulada' : null) }
      )
    );
  }

  async function abrir(id) {
    const v = await api.get(`/ventas/${id}`);
    const cuerpo = el('div', {}, [
      el('p', { text: `${fecha(v.fecha, true)} · ${v.cliente_nombre || 'Consumidor final'} · ${v.condicion}${v.estado === 'anulada' ? ' · ANULADA' : ''}` }),
      tabla(
        [
          { titulo: 'Producto', valor: (i) => `${i.producto_nombre} — ${i.presentacion_nombre}` },
          { titulo: 'Cant.', clase: 'num', valor: (i) => numero(i.cantidad) },
          { titulo: 'Devuelto', clase: 'num', valor: (i) => numero(i.devuelto) },
          { titulo: 'Precio', clase: 'num', valor: (i) => gs(i.precio_unitario) },
          { titulo: 'Importe', clase: 'num', valor: (i) => gs(i.importe) },
        ],
        v.items
      ),
      el('p', { class: 'desglose', text: `Subtotal ${gs(v.subtotal)} · Descuento ${gs(v.descuento)} · Recargo ${gs(v.recargo)} · Total ${gs(v.total)}` }),
      v.cuotas.length
        ? tabla(
            [
              { titulo: 'Cuota', campo: 'numero' },
              { titulo: 'Vence', valor: (c) => fecha(c.vencimiento) },
              { titulo: 'Monto', clase: 'num', valor: (c) => gs(c.monto) },
              { titulo: 'Pagado', clase: 'num', valor: (c) => gs(c.pagado) },
              { titulo: 'Estado', campo: 'estado' },
            ],
            v.cuotas
          )
        : null,
      v.devoluciones.length
        ? el('div', {}, [
            el('h4', { text: 'Devoluciones' }),
            tabla(
              [
                { titulo: 'Fecha', valor: (d) => fecha(d.fecha, true) },
                { titulo: 'Motivo', campo: 'motivo' },
                { titulo: 'Total', clase: 'num', valor: (d) => gs(d.total) },
              ],
              v.devoluciones
            ),
          ])
        : null,
    ]);

    const acciones = [
      { texto: 'Imprimir', accion: () => imprimir(ticketHtml(v)) },
    ];
    if (v.estado === 'activa') {
      if (!v.factura) {
        acciones.push({
          texto: 'Facturar',
          accion: async (cerrar) => {
            try {
              const f = await api.post(`/ventas/${v.id}/facturar`);
              aviso(`Factura ${f.numero_formateado} emitida`);
              cerrar();
              await refrescar();
            } catch (err) { aviso(err.message, 'error'); }
          },
        });
      }
      acciones.push({ texto: 'Devolución parcial', accion: (cerrar) => { cerrar(); devolver(v); } });
      acciones.push({
        texto: 'Anular',
        clase: 'peligro',
        accion: async (cerrar) => {
          if (!(await confirmar('¿Anular la venta completa? Se repone el stock y se revierte la cuenta corriente.'))) return;
          try {
            await api.post(`/ventas/${v.id}/anular`, { motivo: 'Anulación desde pantalla de ventas' });
            aviso('Venta anulada');
            cerrar();
            await refrescar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      });
    }
    modal(`Venta N° ${v.numero}`, cuerpo, acciones);
  }

  function devolver(v) {
    const entradas = new Map();
    const cuerpo = tabla(
      [
        { titulo: 'Producto', valor: (i) => `${i.producto_nombre} — ${i.presentacion_nombre}` },
        { titulo: 'Disponible', clase: 'num', valor: (i) => numero(Number(i.cantidad) - Number(i.devuelto)) },
        {
          titulo: 'A devolver',
          clase: 'num',
          valor: (i) => {
            const entrada = el('input', { type: 'number', min: 0, max: Number(i.cantidad) - Number(i.devuelto), value: 0 });
            entradas.set(i.id, entrada);
            return entrada;
          },
        },
      ],
      v.items.filter((i) => Number(i.cantidad) > Number(i.devuelto))
    );

    modal(`Devolución parcial — venta ${v.numero}`, cuerpo, [
      { texto: 'Cancelar', accion: (cerrar) => cerrar() },
      {
        texto: 'Confirmar devolución',
        clase: 'primario',
        accion: async (cerrar) => {
          const items = [...entradas.entries()]
            .map(([id, nodo]) => ({ venta_item_id: id, cantidad: Number(nodo.value || 0) }))
            .filter((i) => i.cantidad > 0);
          if (!items.length) return aviso('No cargaste cantidades', 'error');
          try {
            const r = await api.post(`/ventas/${v.id}/devoluciones`, { items, motivo: 'Devolución en mostrador' });
            aviso(`Devolución registrada por ${gs(r.total)}`);
            cerrar();
            await refrescar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  const desde = el('input', { type: 'date', value: filtros.desde });
  const hasta = el('input', { type: 'date', value: filtros.hasta });
  const estado = el('select', {}, [
    el('option', { value: '', text: 'Todos los estados' }),
    el('option', { value: 'activa', text: 'Activas' }),
    el('option', { value: 'anulada', text: 'Anuladas' }),
  ]);
  const condicion = el('select', {}, [
    el('option', { value: '', text: 'Contado y crédito' }),
    el('option', { value: 'contado', text: 'Contado' }),
    el('option', { value: 'credito', text: 'Crédito' }),
  ]);

  contenedor.appendChild(
    pagina('Ventas', [
      desde, hasta, estado, condicion,
      boton('Buscar', async () => {
        filtros.desde = desde.value;
        filtros.hasta = hasta.value;
        filtros.estado = estado.value;
        filtros.condicion = condicion.value;
        await refrescar();
      }, 'primario'),
    ], [lista])
  );

  await refrescar();
}
