import { api } from '../api.js';
import { el, gs, fecha, pagina, tabla, modal, formulario, aviso, boton } from '../ui.js';

export async function render(contenedor) {
  const lista = el('div');
  const busqueda = el('input', { placeholder: 'Buscar por nombre, documento o teléfono' });
  const conDeuda = el('label', { class: 'en-linea' }, [el('input', { type: 'checkbox' }), el('span', { text: 'Solo con deuda' })]);

  async function refrescar() {
    const params = new URLSearchParams({ q: busqueda.value.trim() });
    if (conDeuda.querySelector('input').checked) params.set('con_deuda', '1');
    const datos = await api.get(`/clientes?${params}`);
    lista.textContent = '';
    lista.appendChild(
      tabla(
        [
          { titulo: 'Cliente', campo: 'nombre' },
          { titulo: 'Documento', campo: 'documento' },
          { titulo: 'Teléfono', campo: 'telefono' },
          { titulo: 'Límite de crédito', clase: 'num', valor: (c) => gs(c.limite_credito) },
          { titulo: 'Saldo', clase: 'num', valor: (c) => gs(c.saldo) },
        ],
        datos,
        { alClic: (c) => abrir(c.id), claseFila: (c) => (Number(c.saldo) > 0 ? 'deudor' : null) }
      )
    );
  }

  const campos = [
    { campo: 'nombre', titulo: 'Nombre', ancho: 'completo' },
    { campo: 'documento', titulo: 'Documento' },
    { campo: 'telefono', titulo: 'Teléfono' },
    { campo: 'direccion', titulo: 'Dirección', ancho: 'completo' },
    { campo: 'limite_credito', titulo: 'Límite de crédito', tipo: 'number' },
  ];

  function nuevo() {
    const form = formulario(campos, { limite_credito: 0 });
    modal('Nuevo cliente', form.nodo, [
      { texto: 'Cancelar', accion: (cerrar) => cerrar() },
      {
        texto: 'Crear',
        clase: 'primario',
        accion: async (cerrar) => {
          try { await api.post('/clientes', form.valores()); aviso('Cliente creado'); cerrar(); await refrescar(); }
          catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  async function abrir(id) {
    const c = await api.get(`/clientes/${id}`);
    const cuenta = await api.get(`/clientes/${id}/cuenta`);
    const form = formulario([...campos, { campo: 'activo', titulo: 'Activo', tipo: 'checkbox' }], c);
    const cobro = el('input', { type: 'number', placeholder: 'Monto cobrado' });
    const medio = el('select', {}, [
      el('option', { value: 'efectivo', text: 'Efectivo' }),
      el('option', { value: 'transferencia', text: 'Transferencia' }),
      el('option', { value: 'tarjeta', text: 'Tarjeta' }),
    ]);

    const cuerpo = el('div', {}, [
      form.nodo,
      el('h4', { text: `Saldo: ${gs(c.saldo)} · modalidad ${c.modalidad_credito}` }),
      c.modalidad_credito === 'libreta'
        ? el('p', { text: c.libreta ? `Libreta abierta con saldo ${gs(c.libreta.saldo)} (se cierra sola al llegar a cero).` : 'Sin libreta abierta.' })
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
      el('div', { class: 'formulario' }, [
        el('label', {}, [el('span', { text: 'Cobranza' }), cobro]),
        el('label', {}, [el('span', { text: 'Medio' }), medio]),
      ]),
      el('p', { class: 'desglose', text: 'La cobranza se imputa a las cuotas más viejas o a la libreta abierta. No se admite cobrar más de lo adeudado.' }),
      el('h4', { text: 'Cuenta corriente' }),
      tabla(
        [
          { titulo: 'Fecha', valor: (m) => fecha(m.fecha, true) },
          { titulo: 'Concepto', campo: 'concepto' },
          { titulo: 'Debe', clase: 'num', valor: (m) => gs(m.debe) },
          { titulo: 'Haber', clase: 'num', valor: (m) => gs(m.haber) },
          { titulo: 'Saldo', clase: 'num', valor: (m) => gs(m.saldo) },
        ],
        cuenta
      ),
      el('h4', { text: 'Últimas ventas' }),
      tabla(
        [
          { titulo: 'N°', campo: 'numero' },
          { titulo: 'Fecha', valor: (v) => fecha(v.fecha, true) },
          { titulo: 'Condición', campo: 'condicion' },
          { titulo: 'Total', clase: 'num', valor: (v) => gs(v.total) },
          { titulo: 'Estado', campo: 'estado' },
        ],
        c.ultimas_ventas
      ),
    ]);

    modal(c.nombre, cuerpo, [
      {
        texto: 'Registrar cobro',
        accion: async (cerrar) => {
          if (!Number(cobro.value)) return aviso('Cargá el monto', 'error');
          try {
            const r = await api.post(`/clientes/${id}/pagos`, { monto: Number(cobro.value), medio: medio.value });
            aviso(`Cobro registrado. Saldo: ${gs(r.saldo)}`);
            cerrar();
            await refrescar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
      {
        texto: 'Guardar datos',
        clase: 'primario',
        accion: async (cerrar) => {
          try { await api.put(`/clientes/${id}`, form.valores()); aviso('Cliente actualizado'); cerrar(); await refrescar(); }
          catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  busqueda.addEventListener('input', () => refrescar().catch(() => {}));
  conDeuda.querySelector('input').addEventListener('change', () => refrescar().catch(() => {}));
  contenedor.appendChild(pagina('Clientes', [busqueda, conDeuda, boton('Nuevo cliente', nuevo, 'primario')], [lista]));
  await refrescar();
}
