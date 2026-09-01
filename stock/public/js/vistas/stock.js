import { api } from '../api.js';
import { el, numero, fecha, hoy, pagina, tabla, modal, formulario, aviso, boton } from '../ui.js';

export async function render(contenedor) {
  const movimientos = el('div');
  const desde = el('input', { type: 'date', value: hoy() });
  const hasta = el('input', { type: 'date', value: hoy() });
  const origen = el('select', {}, [
    el('option', { value: '', text: 'Todos los orígenes' }),
    ...['venta', 'compra', 'ajuste', 'devolucion', 'anulacion', 'inicial'].map((o) => el('option', { value: o, text: o })),
  ]);

  async function refrescar() {
    const params = new URLSearchParams({ desde: desde.value, hasta: hasta.value });
    if (origen.value) params.set('origen', origen.value);
    const filas = await api.get(`/stock/movimientos?${params}`);
    movimientos.textContent = '';
    movimientos.appendChild(
      tabla(
        [
          { titulo: 'Fecha', valor: (m) => fecha(m.fecha, true) },
          { titulo: 'Producto', campo: 'producto_nombre' },
          { titulo: 'Origen', campo: 'origen' },
          { titulo: 'Detalle', campo: 'detalle' },
          { titulo: 'Antes', clase: 'num', valor: (m) => numero(m.stock_antes) },
          { titulo: 'Movimiento', clase: 'num', valor: (m) => (Number(m.cantidad) > 0 ? `+${numero(m.cantidad)}` : numero(m.cantidad)) },
          { titulo: 'Después', clase: 'num', valor: (m) => numero(m.stock_despues) },
          { titulo: 'Usuario', campo: 'usuario_nombre' },
        ],
        filas
      )
    );
  }

  async function ajustar() {
    const productos = await api.get('/catalogo/productos');
    const form = formulario([
      { campo: 'producto_id', titulo: 'Producto', tipo: 'select', opciones: productos.map((p) => ({ valor: p.id, texto: `${p.nombre} (hoy ${p.stock} ${p.unidad_base})` })) },
      { campo: 'cantidad_final', titulo: 'Cantidad contada (unidad base)', tipo: 'number' },
      { campo: 'motivo', titulo: 'Motivo', ancho: 'completo' },
    ], { motivo: 'Ajuste manual' });
    modal('Ajuste de stock', form.nodo, [
      { texto: 'Cancelar', accion: (cerrar) => cerrar() },
      {
        texto: 'Aplicar ajuste',
        clase: 'primario',
        accion: async (cerrar) => {
          try {
            await api.post('/stock/ajustes', form.valores());
            aviso('Ajuste aplicado');
            cerrar();
            await refrescar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  function conteo() {
    const archivo = el('input', { type: 'file', accept: '.csv,text/csv' });
    const resumen = el('div');
    let contenido = null;

    archivo.addEventListener('change', async () => {
      const file = archivo.files[0];
      if (!file) return;
      contenido = await file.text();
      try {
        const analisis = await api.post('/stock/conteo/simular', { csv: contenido });
        resumen.textContent = '';
        resumen.appendChild(el('p', {
          text: `${analisis.resumen.total} filas · ajustan ${analisis.resumen.ajusta} · iguales ${analisis.resumen.igual} · sin cantidad ${analisis.resumen.omitido} · errores ${analisis.resumen.error}`,
        }));
        resumen.appendChild(tabla(
          [
            { titulo: 'Código', campo: 'codigo' },
            { titulo: 'Producto', valor: (l) => l.nombre || l.mensaje || '' },
            { titulo: 'Sistema', clase: 'num', valor: (l) => (l.stock_actual === undefined ? '' : numero(l.stock_actual)) },
            { titulo: 'Contado', clase: 'num', valor: (l) => (l.contado === undefined ? '' : numero(l.contado)) },
            { titulo: 'Diferencia', clase: 'num', valor: (l) => (l.diferencia === undefined ? '' : numero(l.diferencia)) },
            { titulo: 'Estado', campo: 'estado' },
          ],
          analisis.lineas,
          { claseFila: (l) => (l.estado === 'error' ? 'critico' : null) }
        ));
      } catch (err) { aviso(err.message, 'error'); }
    });

    modal('Conteo físico', el('div', {}, [
      el('p', { class: 'desglose', text: 'Descargá la plantilla, completá la columna "contado" y subila. Primero se simula y recién después se aplica.' }),
      boton('Descargar plantilla CSV', () => api.descargar('/stock/conteo/plantilla', 'conteo-plantilla.csv')),
      archivo,
      resumen,
    ]), [
      { texto: 'Cerrar', accion: (cerrar) => cerrar() },
      {
        texto: 'Aplicar conteo',
        clase: 'primario',
        accion: async (cerrar) => {
          if (!contenido) return aviso('Subí primero el archivo', 'error');
          try {
            const r = await api.post('/stock/conteo/aplicar', { csv: contenido });
            aviso(`Conteo aplicado: ${r.aplicados} productos ajustados`);
            cerrar();
            await refrescar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  async function kardex() {
    const productos = await api.get('/catalogo/productos');
    const selector = el('select', {}, productos.map((p) => el('option', { value: p.id, text: p.nombre })));
    const cuerpo = el('div');
    async function cargar() {
      const filas = await api.get(`/stock/kardex/${selector.value}`);
      cuerpo.textContent = '';
      cuerpo.appendChild(tabla(
        [
          { titulo: 'Fecha', valor: (m) => fecha(m.fecha, true) },
          { titulo: 'Origen', campo: 'origen' },
          { titulo: 'Detalle', campo: 'detalle' },
          { titulo: 'Antes', clase: 'num', valor: (m) => numero(m.stock_antes) },
          { titulo: 'Mov.', clase: 'num', valor: (m) => numero(m.cantidad) },
          { titulo: 'Después', clase: 'num', valor: (m) => numero(m.stock_despues) },
        ],
        filas
      ));
    }
    selector.addEventListener('change', () => cargar().catch((e) => aviso(e.message, 'error')));
    await cargar();
    modal('Kardex por producto', el('div', {}, [selector, cuerpo]), [{ texto: 'Cerrar', accion: (cerrar) => cerrar() }]);
  }

  contenedor.appendChild(
    pagina('Stock y conteo', [
      desde, hasta, origen,
      boton('Buscar', () => refrescar(), 'primario'),
      boton('Kardex', kardex),
      boton('Ajuste manual', ajustar),
      boton('Conteo físico', conteo),
    ], [
      el('p', { class: 'desglose', text: `El stock se guarda siempre en unidad base; packs y cajones se convierten al vender o comprar. Valor de inventario y mínimos se ven en el tablero.` }),
      movimientos,
    ])
  );
  await refrescar();
}
