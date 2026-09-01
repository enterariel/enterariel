import { api } from '../api.js';
import { el, gs, fecha, pagina, tabla, modal, formulario, aviso, boton } from '../ui.js';

export async function render(contenedor) {
  const lista = el('div');
  const busqueda = el('input', { placeholder: 'Buscar proveedor' });

  async function refrescar() {
    const datos = await api.get(`/proveedores?q=${encodeURIComponent(busqueda.value.trim())}`);
    lista.textContent = '';
    lista.appendChild(
      tabla(
        [
          { titulo: 'Proveedor', campo: 'nombre' },
          { titulo: 'RUC', campo: 'ruc' },
          { titulo: 'Teléfono', campo: 'telefono' },
          { titulo: 'Saldo a pagar', clase: 'num', valor: (p) => gs(p.saldo) },
        ],
        datos,
        { alClic: (p) => abrir(p.id) }
      )
    );
  }

  const campos = [
    { campo: 'nombre', titulo: 'Nombre', ancho: 'completo' },
    { campo: 'ruc', titulo: 'RUC' },
    { campo: 'telefono', titulo: 'Teléfono' },
  ];

  function nuevo() {
    const form = formulario(campos, {});
    modal('Nuevo proveedor', form.nodo, [
      { texto: 'Cancelar', accion: (cerrar) => cerrar() },
      {
        texto: 'Crear',
        clase: 'primario',
        accion: async (cerrar) => {
          try { await api.post('/proveedores', form.valores()); aviso('Proveedor creado'); cerrar(); await refrescar(); }
          catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  async function abrir(id) {
    const p = await api.get(`/proveedores/${id}`);
    const cuenta = await api.get(`/proveedores/${id}/cuenta`);
    const form = formulario([...campos, { campo: 'activo', titulo: 'Activo', tipo: 'checkbox' }], p);
    const pago = el('input', { type: 'number', placeholder: 'Monto a pagar' });

    const cuerpo = el('div', {}, [
      form.nodo,
      el('h4', { text: `Saldo a pagar: ${gs(p.saldo)}` }),
      p.comprobantes_impagos.length
        ? tabla(
            [
              { titulo: 'Compra', campo: 'id' },
              { titulo: 'Fecha', valor: (c) => fecha(c.fecha) },
              { titulo: 'Comprobante', campo: 'comprobante' },
              { titulo: 'Total', clase: 'num', valor: (c) => gs(c.total) },
              { titulo: 'Pagado', clase: 'num', valor: (c) => gs(c.pagado) },
              { titulo: 'Pendiente', clase: 'num', valor: (c) => gs(Number(c.total) - Number(c.pagado)) },
            ],
            p.comprobantes_impagos
          )
        : el('p', { text: 'Sin comprobantes impagos.' }),
      el('div', { class: 'formulario' }, [el('label', {}, [el('span', { text: 'Registrar pago (se imputa a los comprobantes más viejos)' }), pago])]),
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
    ]);

    modal(p.nombre, cuerpo, [
      {
        texto: 'Pagar',
        accion: async (cerrar) => {
          if (!Number(pago.value)) return aviso('Cargá el monto', 'error');
          try {
            const r = await api.post(`/proveedores/${id}/pagos`, { monto: Number(pago.value) });
            aviso(`Pago registrado. Saldo: ${gs(r.saldo)}`);
            cerrar();
            await refrescar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
      {
        texto: 'Guardar datos',
        clase: 'primario',
        accion: async (cerrar) => {
          try { await api.put(`/proveedores/${id}`, form.valores()); aviso('Proveedor actualizado'); cerrar(); await refrescar(); }
          catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  busqueda.addEventListener('input', () => refrescar().catch(() => {}));
  contenedor.appendChild(pagina('Proveedores', [busqueda, boton('Nuevo proveedor', nuevo, 'primario')], [lista]));
  await refrescar();
}
