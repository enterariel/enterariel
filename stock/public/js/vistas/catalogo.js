import { api } from '../api.js';
import { el, gs, numero, pagina, tabla, modal, formulario, aviso, confirmar, boton } from '../ui.js';

export async function render(contenedor) {
  const lista = el('div');
  const busqueda = el('input', { placeholder: 'Buscar por nombre o código' });
  const soloCriticos = el('label', { class: 'en-linea' }, [el('input', { type: 'checkbox' }), el('span', { text: 'Solo bajo mínimo' })]);
  let categorias = await api.get('/catalogo/categorias');

  async function refrescar() {
    const params = new URLSearchParams();
    if (soloCriticos.querySelector('input').checked) params.set('bajo_minimo', '1');
    const productos = busqueda.value.trim()
      ? await api.get(`/catalogo/buscar?q=${encodeURIComponent(busqueda.value.trim())}&limite=100`)
      : await api.get(`/catalogo/productos?${params}`);
    lista.textContent = '';
    lista.appendChild(
      tabla(
        [
          { titulo: 'Código', campo: 'codigo_interno' },
          { titulo: 'Producto', campo: 'nombre' },
          { titulo: 'Stock (unidad base)', clase: 'num', valor: (p) => `${numero(p.stock)} ${p.unidad_base}` },
          { titulo: 'Equivale a', valor: (p) => p.desglose },
          { titulo: 'Mínimo', clase: 'num', valor: (p) => numero(p.stock_minimo) },
          { titulo: 'Costo base', clase: 'num', valor: (p) => gs(p.costo_unitario) },
          { titulo: 'Presentaciones', valor: (p) => p.presentaciones.filter((x) => x.activo).map((x) => `${x.nombre} x${x.factor} ${gs(x.precio)}`).join(' · ') },
        ],
        productos,
        { alClic: (p) => abrir(p.id), claseFila: (p) => (p.bajo_minimo ? 'critico' : null) }
      )
    );
  }

  function camposProducto() {
    return [
      { campo: 'codigo_interno', titulo: 'Código interno' },
      { campo: 'nombre', titulo: 'Nombre', ancho: 'completo' },
      { campo: 'categoria_id', titulo: 'Categoría', tipo: 'select', opciones: [{ valor: '', texto: 'Sin categoría' }, ...categorias.map((c) => ({ valor: c.id, texto: c.nombre }))] },
      { campo: 'unidad_base', titulo: 'Unidad base', ayuda: 'Unidad, Botella, Kg…' },
      { campo: 'stock_minimo', titulo: 'Stock mínimo', tipo: 'number' },
      { campo: 'costo_unitario', titulo: 'Costo por unidad base', tipo: 'number' },
      { campo: 'margen', titulo: 'Margen %', tipo: 'number', ayuda: 'Si lo cargás, las compras repcian solas' },
      { campo: 'iva', titulo: 'IVA %', tipo: 'select', opciones: [{ valor: 10, texto: '10%' }, { valor: 5, texto: '5%' }, { valor: 0, texto: 'Exento' }] },
      { campo: 'publicado', titulo: 'Mostrar en la tienda', tipo: 'checkbox' },
    ];
  }

  function nuevo() {
    const form = formulario([...camposProducto(), { campo: 'stock_inicial', titulo: 'Stock inicial', tipo: 'number' }], { unidad_base: 'Unidad', iva: 10, publicado: 1 });
    modal('Nuevo producto', form.nodo, [
      { texto: 'Cancelar', accion: (cerrar) => cerrar() },
      {
        texto: 'Crear',
        clase: 'primario',
        accion: async (cerrar) => {
          try {
            const v = form.valores();
            const producto = await api.post('/catalogo/productos', { ...v, categoria_id: v.categoria_id || null });
            aviso('Producto creado');
            cerrar();
            await refrescar();
            abrir(producto.id);
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  async function abrir(id) {
    const p = await api.get(`/catalogo/productos/${id}`);
    const form = formulario(camposProducto(), p);
    const presentaciones = el('div');

    function dibujarPresentaciones(datos) {
      presentaciones.textContent = '';
      presentaciones.appendChild(el('h4', { text: 'Presentaciones' }));
      presentaciones.appendChild(
        tabla(
          [
            { titulo: 'Nombre', campo: 'nombre' },
            { titulo: 'Factor', clase: 'num', valor: (x) => `x${x.factor}` },
            { titulo: 'Código de barras', valor: (x) => x.codigo_barras || '' },
            { titulo: 'Precio', clase: 'num', valor: (x) => gs(x.precio) },
            { titulo: 'Activa', valor: (x) => (x.activo ? 'sí' : 'no') },
            { titulo: '', valor: (x) => boton('Editar', () => editarPresentacion(x)) },
          ],
          datos
        )
      );
      presentaciones.appendChild(boton('Agregar presentación', () => editarPresentacion(null), 'secundario'));
    }

    async function recargar() {
      const actual = await api.get(`/catalogo/productos/${id}`);
      dibujarPresentaciones(actual.presentaciones);
    }

    function editarPresentacion(pres) {
      const f = formulario(
        [
          { campo: 'nombre', titulo: 'Nombre', ayuda: 'Unidad, Pack x6, Cajón x12…' },
          { campo: 'factor', titulo: 'Unidades base que contiene', tipo: 'number' },
          { campo: 'codigo_barras', titulo: 'Código de barras propio' },
          { campo: 'precio', titulo: 'Precio de venta', tipo: 'number' },
          ...(pres ? [{ campo: 'activo', titulo: 'Activa', tipo: 'checkbox' }] : []),
        ],
        pres || { factor: 1 }
      );
      modal(pres ? `Presentación ${pres.nombre}` : 'Nueva presentación', f.nodo, [
        { texto: 'Cancelar', accion: (cerrar) => cerrar() },
        {
          texto: 'Guardar',
          clase: 'primario',
          accion: async (cerrar) => {
            try {
              if (pres) await api.put(`/catalogo/presentaciones/${pres.id}`, f.valores());
              else await api.post(`/catalogo/productos/${id}/presentaciones`, f.valores());
              aviso('Presentación guardada');
              cerrar();
              await recargar();
              await refrescar();
            } catch (err) { aviso(err.message, 'error'); }
          },
        },
      ]);
    }

    dibujarPresentaciones(p.presentaciones);
    modal(p.nombre, el('div', {}, [
      el('p', { class: 'desglose', text: `Stock: ${numero(p.stock)} ${p.unidad_base} (${p.desglose}). El stock se mueve por compras, ventas y ajustes.` }),
      form.nodo,
      presentaciones,
    ]), [
      {
        texto: 'Dar de baja',
        clase: 'peligro',
        accion: async (cerrar) => {
          if (!(await confirmar('¿Dar de baja el producto? Si tiene ventas se desactiva, no se borra.'))) return;
          await api.del(`/catalogo/productos/${id}`);
          aviso('Producto dado de baja');
          cerrar();
          await refrescar();
        },
      },
      {
        texto: 'Guardar',
        clase: 'primario',
        accion: async (cerrar) => {
          try {
            const v = form.valores();
            await api.put(`/catalogo/productos/${id}`, { ...v, categoria_id: v.categoria_id || null });
            aviso('Producto actualizado');
            cerrar();
            await refrescar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  function gestionarCategorias() {
    const entrada = el('input', { placeholder: 'Nueva categoría' });
    const cuerpo = el('div');
    function pintar() {
      cuerpo.textContent = '';
      cuerpo.appendChild(tabla(
        [
          { titulo: 'Categoría', campo: 'nombre' },
          { titulo: '', valor: (c) => boton('Borrar', async () => {
            await api.del(`/catalogo/categorias/${c.id}`);
            categorias = await api.get('/catalogo/categorias');
            pintar();
          }) },
        ],
        categorias
      ));
    }
    pintar();
    modal('Categorías', el('div', {}, [entrada, cuerpo]), [
      {
        texto: 'Agregar',
        clase: 'primario',
        accion: async () => {
          if (!entrada.value.trim()) return;
          await api.post('/catalogo/categorias', { nombre: entrada.value.trim() });
          categorias = await api.get('/catalogo/categorias');
          entrada.value = '';
          pintar();
        },
      },
    ]);
  }

  busqueda.addEventListener('input', () => refrescar().catch(() => {}));
  soloCriticos.querySelector('input').addEventListener('change', () => refrescar().catch(() => {}));

  contenedor.appendChild(
    pagina('Productos', [busqueda, soloCriticos, boton('Categorías', gestionarCategorias), boton('Nuevo producto', nuevo, 'primario')], [lista])
  );
  await refrescar();
}
