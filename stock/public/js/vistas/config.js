import { api } from '../api.js';
import { el, fecha, numero, pagina, tabla, modal, formulario, aviso, boton } from '../ui.js';

export async function render(contenedor) {
  const cfg = await api.get('/config');
  const timbrados = el('div');
  const tramos = el('div');

  const negocio = formulario([
    { campo: 'negocio_nombre', titulo: 'Nombre del negocio', ancho: 'completo' },
    { campo: 'negocio_ruc', titulo: 'RUC' },
    { campo: 'negocio_telefono', titulo: 'Teléfono' },
    { campo: 'negocio_direccion', titulo: 'Dirección', ancho: 'completo' },
    { campo: 'tienda_activa', titulo: 'Catálogo público activo', tipo: 'checkbox' },
    { campo: 'tienda_whatsapp', titulo: 'WhatsApp del catálogo' },
  ], { ...cfg.valores, tienda_activa: cfg.valores.tienda_activa === '1' });

  const credito = formulario([
    { campo: 'modalidad_credito', titulo: 'Modalidad de crédito', tipo: 'select', opciones: [
      { valor: 'cuotas_fijas', texto: 'Cuotas fijas con vencimientos' },
      { valor: 'libreta', texto: 'Libreta (saldo abierto)' },
    ], ayuda: 'Son excluyentes: se usa una sola en todo el sistema' },
    { campo: 'cuotas_permitidas', titulo: 'Cuotas permitidas', ayuda: 'Separadas por coma' },
    { campo: 'frecuencia_default', titulo: 'Frecuencia', tipo: 'select', opciones: [
      { valor: 'semanal', texto: 'Semanal' }, { valor: 'quincenal', texto: 'Quincenal' }, { valor: 'mensual', texto: 'Mensual' },
    ] },
    { campo: 'dias_primer_vencimiento', titulo: 'Días hasta el 1er vencimiento', tipo: 'number' },
    { campo: 'entrega_minima_pct', titulo: 'Entrega mínima %', tipo: 'number' },
    { campo: 'entrega_fuerte_pct', titulo: 'Entrega fuerte %', tipo: 'number' },
    { campo: 'recargo_general_pct', titulo: 'Recargo general %', tipo: 'number' },
    { campo: 'redondeo_cuota', titulo: 'Redondeo de cuota', tipo: 'number', ayuda: 'La diferencia va a la última cuota' },
  ], cfg.valores);

  const seguridad = formulario([
    { campo: 'sesion_horas', titulo: 'Duración de sesión (horas)', tipo: 'number' },
    { campo: 'inactividad_minutos', titulo: 'Cierre por inactividad (minutos)', tipo: 'number' },
  ], cfg.valores);

  async function guardar(form) {
    try {
      const v = form.valores();
      if ('tienda_activa' in v) v.tienda_activa = v.tienda_activa ? '1' : '0';
      await api.put('/config', v);
      aviso('Configuración guardada');
    } catch (err) { aviso(err.message, 'error'); }
  }

  function pintarTramos(datos) {
    tramos.textContent = '';
    tramos.appendChild(el('h3', { text: 'Tramos de recargo por cantidad de cuotas' }));
    const entradas = datos.map((t) => ({
      desde: el('input', { type: 'number', value: t.cuotas_desde }),
      hasta: el('input', { type: 'number', value: t.cuotas_hasta }),
      pct: el('input', { type: 'number', value: t.porcentaje }),
    }));
    tramos.appendChild(tabla(
      [
        { titulo: 'Desde', valor: (t, i) => entradas[i].desde },
        { titulo: 'Hasta', valor: (t, i) => entradas[i].hasta },
        { titulo: 'Recargo %', valor: (t, i) => entradas[i].pct },
      ],
      datos
    ));
    tramos.appendChild(boton('Guardar tramos', async () => {
      try {
        const nuevos = await api.put('/config/tramos-recargo', {
          tramos: entradas.map((e) => ({ cuotas_desde: Number(e.desde.value), cuotas_hasta: Number(e.hasta.value), porcentaje: Number(e.pct.value) })),
        });
        aviso('Tramos actualizados');
        pintarTramos(nuevos);
      } catch (err) { aviso(err.message, 'error'); }
    }, 'primario'));
  }

  async function pintarTimbrados() {
    const datos = await api.get('/timbrados');
    timbrados.textContent = '';
    timbrados.appendChild(el('h3', { text: 'Timbrados (facturación preimpresa)' }));
    timbrados.appendChild(tabla(
      [
        { titulo: 'Timbrado', campo: 'numero' },
        { titulo: 'Punto', valor: (t) => `${t.establecimiento}-${t.punto_expedicion}` },
        { titulo: 'Rango', valor: (t) => `${numero(t.desde)} a ${numero(t.hasta)}` },
        { titulo: 'Último usado', clase: 'num', valor: (t) => numero(t.actual) },
        { titulo: 'Disponibles', clase: 'num', valor: (t) => numero(t.disponibles) },
        { titulo: 'Vigencia', valor: (t) => `${fecha(t.vigencia_desde)} – ${fecha(t.vigencia_hasta)}` },
        { titulo: 'Estado', valor: (t) => (t.vigente ? 'vigente' : 'no vigente') },
      ],
      datos,
      { alClic: (t) => editarTimbrado(t) }
    ));
    timbrados.appendChild(boton('Cargar timbrado', () => editarTimbrado(null), 'primario'));
  }

  function editarTimbrado(t) {
    const form = formulario([
      { campo: 'numero', titulo: 'N° de timbrado' },
      { campo: 'establecimiento', titulo: 'Establecimiento' },
      { campo: 'punto_expedicion', titulo: 'Punto de expedición' },
      { campo: 'desde', titulo: 'Desde', tipo: 'number' },
      { campo: 'hasta', titulo: 'Hasta', tipo: 'number' },
      { campo: 'vigencia_desde', titulo: 'Vigente desde', tipo: 'date' },
      { campo: 'vigencia_hasta', titulo: 'Vigente hasta', tipo: 'date' },
      ...(t ? [{ campo: 'activo', titulo: 'Activo', tipo: 'checkbox' }] : []),
    ], t ? { ...t, vigencia_desde: String(t.vigencia_desde).slice(0, 10), vigencia_hasta: String(t.vigencia_hasta).slice(0, 10) } : { establecimiento: '001', punto_expedicion: '001' });
    modal(t ? `Timbrado ${t.numero}` : 'Nuevo timbrado', form.nodo, [
      { texto: 'Cancelar', accion: (cerrar) => cerrar() },
      {
        texto: 'Guardar',
        clase: 'primario',
        accion: async (cerrar) => {
          try {
            if (t) await api.put(`/timbrados/${t.id}`, form.valores());
            else await api.post('/timbrados', form.valores());
            aviso('Timbrado guardado');
            cerrar();
            await pintarTimbrados();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  pintarTramos(cfg.tramos_recargo);
  await pintarTimbrados();

  contenedor.appendChild(
    pagina('Configuración', [boton('Descargar backup', () => api.descargarPost('/config/backup', 'backup.json'))], [
      el('div', { class: 'panel' }, [el('h3', { text: 'Negocio y catálogo público' }), negocio.nodo, boton('Guardar', () => guardar(negocio), 'primario')]),
      el('div', { class: 'panel' }, [el('h3', { text: 'Crédito' }), credito.nodo, boton('Guardar', () => guardar(credito), 'primario')]),
      el('div', { class: 'panel' }, [tramos]),
      el('div', { class: 'panel' }, [el('h3', { text: 'Sesiones' }), seguridad.nodo, boton('Guardar', () => guardar(seguridad), 'primario')]),
      el('div', { class: 'panel' }, [timbrados]),
    ])
  );
}
