import { api } from '../api.js';
import { el, gs, fecha, pagina, tabla, modal, aviso, boton } from '../ui.js';

// Cobranzas: quien debe, que vence y registro del pago. La imputacion la hace
// el servidor (cuota mas vieja primero, o libreta abierta).
export async function render(contenedor) {
  const cfg = await api.get('/config');
  const modalidad = cfg.valores.modalidad_credito;
  const deudores = el('div');
  const vencimientos = el('div');

  async function refrescar() {
    const clientes = await api.get('/clientes?con_deuda=1');
    deudores.textContent = '';
    deudores.appendChild(el('h3', { text: `Clientes con saldo (${clientes.length})` }));
    deudores.appendChild(
      tabla(
        [
          { titulo: 'Cliente', campo: 'nombre' },
          { titulo: 'Teléfono', campo: 'telefono' },
          { titulo: 'Límite', clase: 'num', valor: (c) => gs(c.limite_credito) },
          { titulo: 'Saldo', clase: 'num', valor: (c) => gs(c.saldo) },
          { titulo: '', valor: (c) => boton('Cobrar', () => cobrar(c)) },
        ],
        clientes,
        { alClic: (c) => detalle(c.id) }
      )
    );

    if (modalidad === 'cuotas_fijas') {
      const reporte = await api.get('/reportes/antiguedad_cobrar');
      vencimientos.textContent = '';
      vencimientos.appendChild(el('h3', { text: 'Antigüedad de la deuda' }));
      vencimientos.appendChild(
        tabla(
          reporte.columnas.map((c) => ({ titulo: c.titulo, valor: (f) => (c.moneda ? gs(f[c.campo]) : f[c.campo]) })),
          reporte.filas
        )
      );
    }
  }

  async function detalle(id) {
    const c = await api.get(`/clientes/${id}`);
    modal(`${c.nombre} — saldo ${gs(c.saldo)}`, el('div', {}, [
      modalidad === 'libreta'
        ? el('p', { text: c.libreta ? `Libreta abierta: cargos ${gs(c.libreta.total)}, pagos ${gs(c.libreta.pagado)}, saldo ${gs(c.libreta.saldo)}.` : 'Sin libreta abierta.' })
        : tabla(
            [
              { titulo: 'Venta', campo: 'venta_numero' },
              { titulo: 'Cuota', campo: 'numero' },
              { titulo: 'Vence', valor: (x) => fecha(x.vencimiento) },
              { titulo: 'Monto', clase: 'num', valor: (x) => gs(x.monto) },
              { titulo: 'Pagado', clase: 'num', valor: (x) => gs(x.pagado) },
            ],
            c.cuotas_pendientes
          ),
    ]), [{ texto: 'Cobrar', clase: 'primario', accion: (cerrar) => { cerrar(); cobrar(c); } }]);
  }

  function cobrar(cliente) {
    const monto = el('input', { type: 'number', value: cliente.saldo });
    const medio = el('select', {}, [
      el('option', { value: 'efectivo', text: 'Efectivo' }),
      el('option', { value: 'transferencia', text: 'Transferencia' }),
      el('option', { value: 'tarjeta', text: 'Tarjeta' }),
    ]);
    modal(`Cobranza a ${cliente.nombre}`, el('div', { class: 'formulario' }, [
      el('label', {}, [el('span', { text: 'Monto' }), monto]),
      el('label', {}, [el('span', { text: 'Medio' }), medio]),
      el('p', { class: 'desglose', text: 'Las cobranzas de cuenta corriente no entran al arqueo de caja.' }),
    ]), [
      { texto: 'Cancelar', accion: (cerrar) => cerrar() },
      {
        texto: 'Registrar',
        clase: 'primario',
        accion: async (cerrar) => {
          try {
            const r = await api.post(`/clientes/${cliente.id}/pagos`, { monto: Number(monto.value), medio: medio.value });
            aviso(`Cobro imputado a ${r.aplicaciones.length} concepto(s). Saldo: ${gs(r.saldo)}`);
            cerrar();
            await refrescar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  contenedor.appendChild(
    pagina('Créditos y cobranzas', [boton('Actualizar', () => refrescar())], [
      el('p', { class: 'desglose', text: `Modalidad vigente: ${modalidad === 'libreta' ? 'libreta (saldo abierto, sin cuotas)' : 'cuotas fijas con vencimientos'}.` }),
      deudores,
      vencimientos,
    ])
  );
  await refrescar();
}
