import { api } from '../api.js';
import { el, gs, numero, fecha, hoy, primerDiaMes, pagina, tabla, modal, aviso, confirmar, boton } from '../ui.js';

export async function render(contenedor) {
  const lista = el('div');
  const desde = el('input', { type: 'date', value: primerDiaMes() });
  const hasta = el('input', { type: 'date', value: hoy() });

  async function refrescar() {
    const compras = await api.get(`/compras?desde=${desde.value}&hasta=${hasta.value}`);
    lista.textContent = '';
    lista.appendChild(
      tabla(
        [
          { titulo: 'N°', campo: 'id' },
          { titulo: 'Fecha', valor: (c) => fecha(c.fecha, true) },
          { titulo: 'Proveedor', campo: 'proveedor_nombre' },
          { titulo: 'Comprobante', campo: 'comprobante' },
          { titulo: 'Condición', campo: 'condicion' },
          { titulo: 'Total', clase: 'num', valor: (c) => gs(c.total) },
          { titulo: 'Pagado', clase: 'num', valor: (c) => gs(c.pagado) },
          { titulo: 'Estado', campo: 'estado' },
        ],
        compras,
        { alClic: (c) => abrir(c.id) }
      )
    );
  }

  async function abrir(id) {
    const c = await api.get(`/compras/${id}`);
    const cuerpo = el('div', {}, [
      el('p', { text: `${fecha(c.fecha, true)} · ${c.proveedor_nombre} · ${c.condicion} · ${c.estado}` }),
      tabla(
        [
          { titulo: 'Producto', campo: 'producto_nombre' },
          { titulo: 'Presentación comprada', valor: (i) => `${i.presentacion_nombre} (x${i.factor})` },
          { titulo: 'Cant.', clase: 'num', valor: (i) => numero(i.cantidad) },
          { titulo: 'Costo presentación', clase: 'num', valor: (i) => gs(i.costo_presentacion) },
          { titulo: 'Costo unidad base', clase: 'num', valor: (i) => `Gs. ${Number(i.costo_base).toLocaleString('es-PY')}` },
          { titulo: 'Importe', clase: 'num', valor: (i) => gs(i.importe) },
        ],
        c.items
      ),
      el('p', { class: 'pos-total', text: gs(c.total) }),
    ]);
    modal(`Compra #${c.id}`, cuerpo, c.estado === 'activa' ? [
      {
        texto: 'Anular',
        clase: 'peligro',
        accion: async (cerrar) => {
          if (!(await confirmar('¿Anular la compra? Se descuenta el stock ingresado.'))) return;
          try {
            await api.post(`/compras/${c.id}/anular`);
            aviso('Compra anulada');
            cerrar();
            await refrescar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ] : []);
  }

  async function nueva() {
    const proveedores = await api.get('/proveedores');
    const productos = await api.get('/catalogo/productos');
    const items = [];

    const proveedor = el('select', {}, proveedores.map((p) => el('option', { value: p.id, text: p.nombre })));
    const comprobante = el('input', { placeholder: 'N° de factura del proveedor' });
    const condicion = el('select', {}, [
      el('option', { value: 'contado', text: 'Contado' }),
      el('option', { value: 'credito', text: 'Crédito (va a cuenta corriente)' }),
    ]);
    const presentacion = el('select');
    const producto = el('select', {}, productos.map((p) => el('option', { value: p.id, text: p.nombre })));
    const cantidad = el('input', { type: 'number', value: 1, min: 1 });
    const costo = el('input', { type: 'number', placeholder: 'Costo de la presentación' });
    const detalle = el('div');

    function cargarPresentaciones() {
      const p = productos.find((x) => String(x.id) === producto.value);
      presentacion.textContent = '';
      for (const pr of p.presentaciones.filter((x) => x.activo)) {
        presentacion.appendChild(el('option', { value: pr.id, text: `${pr.nombre} (x${pr.factor})` }));
      }
    }
    producto.addEventListener('change', cargarPresentaciones);
    cargarPresentaciones();

    function pintar() {
      detalle.textContent = '';
      detalle.appendChild(tabla(
        [
          { titulo: 'Producto', campo: 'producto_nombre' },
          { titulo: 'Presentación', campo: 'presentacion_nombre' },
          { titulo: 'Cant.', clase: 'num', valor: (i) => numero(i.cantidad) },
          { titulo: 'Costo', clase: 'num', valor: (i) => gs(i.costo_presentacion) },
          { titulo: 'Unidades base', clase: 'num', valor: (i) => numero(i.cantidad * i.factor) },
          { titulo: 'Costo unidad base', clase: 'num', valor: (i) => gs(i.costo_presentacion / i.factor) },
          { titulo: '', valor: (i, idx) => boton('Quitar', () => { items.splice(idx, 1); pintar(); }) },
        ],
        items
      ));
      detalle.appendChild(el('p', { class: 'pos-total', text: gs(items.reduce((a, i) => a + i.costo_presentacion * i.cantidad, 0)) }));
    }
    pintar();

    modal('Nueva compra', el('div', {}, [
      el('div', { class: 'formulario' }, [
        el('label', {}, [el('span', { text: 'Proveedor' }), proveedor]),
        el('label', {}, [el('span', { text: 'Comprobante' }), comprobante]),
        el('label', {}, [el('span', { text: 'Condición' }), condicion]),
      ]),
      el('div', { class: 'formulario' }, [
        el('label', {}, [el('span', { text: 'Producto' }), producto]),
        el('label', {}, [el('span', { text: 'Presentación facturada' }), presentacion]),
        el('label', {}, [el('span', { text: 'Cantidad' }), cantidad]),
        el('label', {}, [el('span', { text: 'Costo de esa presentación' }), costo]),
        boton('Agregar línea', () => {
          const p = productos.find((x) => String(x.id) === producto.value);
          const pr = p.presentaciones.find((x) => String(x.id) === presentacion.value);
          if (!Number(costo.value)) return aviso('Cargá el costo', 'error');
          items.push({
            presentacion_id: pr.id,
            presentacion_nombre: pr.nombre,
            producto_nombre: p.nombre,
            factor: Number(pr.factor),
            cantidad: Number(cantidad.value),
            costo_presentacion: Number(costo.value),
          });
          costo.value = '';
          pintar();
        }, 'secundario'),
      ]),
      el('p', { class: 'desglose', text: 'El costo se divide por el factor para obtener el costo por unidad base; si el producto tiene margen cargado, los precios se recalculan solos.' }),
      detalle,
    ]), [
      { texto: 'Cancelar', accion: (cerrar) => cerrar() },
      {
        texto: 'Registrar compra',
        clase: 'primario',
        accion: async (cerrar) => {
          if (!items.length) return aviso('La compra no tiene líneas', 'error');
          try {
            const r = await api.post('/compras', {
              proveedor_id: Number(proveedor.value),
              comprobante: comprobante.value || null,
              condicion: condicion.value,
              items: items.map((i) => ({ presentacion_id: i.presentacion_id, cantidad: i.cantidad, costo_presentacion: i.costo_presentacion })),
            });
            aviso(`Compra registrada por ${gs(r.total)}${r.repricing.length ? ` · ${r.repricing.length} producto(s) repreciados` : ''}`);
            cerrar();
            await refrescar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  contenedor.appendChild(
    pagina('Compras', [desde, hasta, boton('Buscar', () => refrescar(), 'primario'), boton('Nueva compra', nueva, 'primario')], [lista])
  );
  await refrescar();
}
