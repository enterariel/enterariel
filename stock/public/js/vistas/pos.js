import { api } from '../api.js';
import { el, gs, numero, fecha, aviso, modal, tabla, formulario, confirmar, imprimir } from '../ui.js';
import { ticketHtml } from './ticket.js';

// Mostrador: todo se maneja desde el buscador. Despues de cada accion el foco
// vuelve ahi para poder seguir pasando codigos sin tocar el mouse.
export async function render(contenedor) {
  const estado = { lineas: [], cliente: null, descuento: 0, resultados: [], seleccion: 0, presupuestoId: null };
  const cfg = await api.get('/config').catch(() => ({ valores: {} }));
  const modalidad = cfg.valores ? cfg.valores.modalidad_credito : 'cuotas_fijas';

  const buscador = el('input', { placeholder: 'Código de barras, código interno o nombre.  Ej: 3*7790001000035', autocomplete: 'off' });
  const resultados = el('div', { class: 'pos-resultados panel' });
  const cuerpoLineas = el('div');
  const totalNodo = el('div', { class: 'pos-total' });
  const infoCliente = el('div');
  const infoCaja = el('div', { class: 'atajos' });

  function foco() { buscador.focus(); buscador.select(); }

  function totales() {
    const subtotal = estado.lineas.reduce((acc, l) => acc + l.precio * l.cantidad, 0);
    const descuento = Math.min(estado.descuento, subtotal);
    return { subtotal, descuento, total: subtotal - descuento };
  }

  function dibujarLineas() {
    const t = totales();
    cuerpoLineas.textContent = '';
    cuerpoLineas.appendChild(
      tabla(
        [
          { titulo: 'Producto', valor: (l) => `${l.producto} — ${l.presentacion}` },
          { titulo: 'Cant.', clase: 'num', valor: (l) => numero(l.cantidad) },
          { titulo: 'Unidades base', clase: 'num', valor: (l) => numero(l.cantidad * l.factor) },
          { titulo: 'Precio', clase: 'num', valor: (l) => gs(l.precio) },
          { titulo: 'Importe', clase: 'num', valor: (l) => gs(l.precio * l.cantidad) },
          {
            titulo: '',
            valor: (l, i) => el('button', { class: 'icono', text: '✕', onclick: () => { estado.lineas.splice(i, 1); dibujarLineas(); foco(); } }),
          },
        ],
        estado.lineas
      )
    );
    totalNodo.textContent = '';
    totalNodo.appendChild(el('div', { class: 'desglose', text: `Subtotal ${gs(t.subtotal)}   Descuento ${gs(t.descuento)}` }));
    totalNodo.appendChild(el('div', { text: gs(t.total) }));
  }

  function dibujarCliente() {
    infoCliente.textContent = '';
    infoCliente.appendChild(el('h3', { text: 'Cliente' }));
    infoCliente.appendChild(
      el('p', { text: estado.cliente ? `${estado.cliente.nombre} — saldo ${gs(estado.cliente.saldo)}` : 'Consumidor final (F3 para elegir)' })
    );
  }

  async function dibujarCaja() {
    const caja = await api.get('/caja/actual').catch(() => null);
    infoCaja.textContent = caja
      ? `Caja abierta #${caja.id} · esperado ${gs(caja.esperado_actual)}`
      : 'Sin caja abierta: las ventas en efectivo no impactan en arqueo.';
  }

  function pintarResultados() {
    resultados.textContent = '';
    estado.resultados.forEach((p, i) => {
      const pres = p.presentaciones.filter((x) => x.activo);
      resultados.appendChild(
        el('div', { class: `fila ${i === estado.seleccion ? 'sel' : ''}`, onclick: () => { estado.seleccion = i; elegir(); } }, [
          el('div', {}, [
            el('strong', { text: p.nombre }),
            el('div', { class: 'desglose', text: `${p.codigo_interno} · ${numero(p.stock)} ${p.unidad_base} · ${p.desglose}` }),
          ]),
          el('div', { class: 'desglose', text: pres.map((x) => `${x.nombre} ${gs(x.precio)}`).join(' | ') }),
        ])
      );
    });
  }

  async function buscar(texto) {
    estado.resultados = await api.get(`/catalogo/buscar?q=${encodeURIComponent(texto)}`);
    estado.seleccion = 0;
    pintarResultados();
  }

  function agregar(producto, presentacion, cantidad) {
    const existente = estado.lineas.find((l) => l.presentacion_id === presentacion.id && l.precio === Number(presentacion.precio));
    if (existente) existente.cantidad += cantidad;
    else {
      estado.lineas.push({
        presentacion_id: presentacion.id,
        presentacion: presentacion.nombre,
        producto: producto.nombre,
        factor: Number(presentacion.factor),
        cantidad,
        precio: Number(presentacion.precio),
      });
    }
    dibujarLineas();
  }

  // Elige la presentacion: si el codigo escaneado corresponde a una, va directo.
  function elegir(cantidad = 1) {
    const producto = estado.resultados[estado.seleccion];
    if (!producto) return;
    const activas = producto.presentaciones.filter((p) => p.activo);
    const sugerida = activas.find((p) => p.id === producto.presentacion_sugerida_id);
    if (sugerida) {
      agregar(producto, sugerida, cantidad);
      limpiarBusqueda();
      return;
    }
    if (activas.length === 1) {
      agregar(producto, activas[0], cantidad);
      limpiarBusqueda();
      return;
    }
    const cerrar = modal(
      `Presentación de ${producto.nombre}`,
      el('div', { class: 'formulario' }, activas.map((p) =>
        el('button', {
          class: 'secundario',
          text: `${p.nombre} (x${p.factor}) — ${gs(p.precio)}`,
          onclick: () => { agregar(producto, p, cantidad); cerrar(); limpiarBusqueda(); },
        })
      ))
    );
  }

  function limpiarBusqueda() {
    buscador.value = '';
    estado.resultados = [];
    pintarResultados();
    foco();
  }

  // --- cobro -------------------------------------------------------------
  async function confirmarVenta(datos) {
    const t = totales();
    const venta = await api.post('/ventas', {
      ...datos,
      cliente_id: estado.cliente ? estado.cliente.id : null,
      descuento: t.descuento,
      presupuesto_id: estado.presupuestoId,
      items: estado.lineas.map((l) => ({ presentacion_id: l.presentacion_id, cantidad: l.cantidad, precio_unitario: l.precio })),
    });
    aviso(`Venta ${venta.numero} registrada por ${gs(venta.total)}`);
    const detalle = await api.get(`/ventas/${venta.venta_id}`);
    imprimir(ticketHtml(detalle));
    estado.lineas = [];
    estado.cliente = null;
    estado.descuento = 0;
    estado.presupuestoId = null;
    dibujarLineas();
    dibujarCliente();
    await dibujarCaja();
    limpiarBusqueda();
  }

  function cobrarContado() {
    if (!estado.lineas.length) return aviso('No hay items cargados', 'error');
    const t = totales();
    const form = formulario([
      { campo: 'medio_pago', titulo: 'Medio de pago', tipo: 'select', opciones: [
        { valor: 'efectivo', texto: 'Efectivo' }, { valor: 'transferencia', texto: 'Transferencia' },
        { valor: 'tarjeta', texto: 'Tarjeta' }, { valor: 'mixto', texto: 'Mixto' },
      ] },
      { campo: 'recibido', titulo: 'Recibido', tipo: 'number', valor: t.total },
      { campo: 'con_factura', titulo: 'Emitir factura legal', tipo: 'checkbox' },
      { campo: 'observacion', titulo: 'Observación', ancho: 'completo' },
    ], { recibido: t.total });

    const vuelto = el('p', { class: 'desglose', text: 'Vuelto: Gs. 0' });
    form.nodos.recibido.addEventListener('input', () => {
      vuelto.textContent = `Vuelto: ${gs(Math.max(0, Number(form.nodos.recibido.value || 0) - t.total))}`;
    });

    modal(`Cobrar ${gs(t.total)}`, el('div', {}, [form.nodo, vuelto]), [
      { texto: 'Cancelar', accion: (cerrar) => { cerrar(); foco(); } },
      {
        texto: 'Confirmar',
        clase: 'primario',
        accion: async (cerrar) => {
          const v = form.valores();
          try {
            await confirmarVenta({ condicion: 'contado', medio_pago: v.medio_pago, con_factura: !!v.con_factura, observacion: v.observacion });
            cerrar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  async function cobrarCredito() {
    if (!estado.lineas.length) return aviso('No hay items cargados', 'error');
    if (!estado.cliente) return aviso('Elegí un cliente con F3 antes de vender a crédito', 'error');
    const t = totales();
    const permitidas = (cfg.valores.cuotas_permitidas || '1,2,3').split(',');

    const campos = [
      { campo: 'entrega_inicial', titulo: 'Entrega inicial', tipo: 'number' },
      { campo: 'con_factura', titulo: 'Emitir factura legal', tipo: 'checkbox' },
    ];
    if (modalidad === 'cuotas_fijas') {
      campos.splice(1, 0,
        { campo: 'cuotas', titulo: 'Cuotas', tipo: 'select', opciones: permitidas.map((c) => ({ valor: c, texto: `${c} cuota(s)` })) },
        { campo: 'frecuencia', titulo: 'Frecuencia', tipo: 'select', opciones: [
          { valor: 'semanal', texto: 'Semanal' }, { valor: 'quincenal', texto: 'Quincenal' }, { valor: 'mensual', texto: 'Mensual' },
        ] }
      );
    }
    const form = formulario(campos, { entrega_inicial: 0, frecuencia: cfg.valores.frecuencia_default });
    const previa = el('div', { class: 'desglose' });

    async function simular() {
      if (modalidad === 'libreta') {
        previa.textContent = `Libreta: se agrega ${gs(t.total - Number(form.nodos.entrega_inicial.value || 0))} al saldo, sin cuotas ni recargo.`;
        return;
      }
      const v = form.valores();
      const plan = await api.post('/ventas/simular-credito', {
        total: t.total, entrega: Number(v.entrega_inicial || 0), cuotas: Number(v.cuotas), frecuencia: v.frecuencia,
      });
      previa.textContent = '';
      previa.appendChild(el('p', { text: `Clasificación: ${plan.clasificacion} · recargo ${plan.recargo_pct}% (${gs(plan.recargo)}) · financiado ${gs(plan.financiado)}` }));
      for (const texto of plan.avisos || []) previa.appendChild(el('p', { class: 'error', text: texto }));
      previa.appendChild(tabla(
        [
          { titulo: 'Cuota', valor: (c) => c.numero },
          { titulo: 'Vencimiento', valor: (c) => fecha(c.vencimiento) },
          { titulo: 'Monto', clase: 'num', valor: (c) => gs(c.monto) },
        ],
        plan.cuotas || []
      ));
    }
    for (const nodo of Object.values(form.nodos)) nodo.addEventListener('change', () => simular().catch((e) => aviso(e.message, 'error')));
    await simular().catch(() => {});

    modal(`Crédito por ${gs(t.total)} — ${estado.cliente.nombre}`, el('div', {}, [form.nodo, previa]), [
      { texto: 'Cancelar', accion: (cerrar) => { cerrar(); foco(); } },
      {
        texto: 'Confirmar crédito',
        clase: 'primario',
        accion: async (cerrar) => {
          const v = form.valores();
          try {
            await confirmarVenta({
              condicion: 'credito',
              entrega_inicial: Number(v.entrega_inicial || 0),
              cuotas: Number(v.cuotas || 1),
              frecuencia: v.frecuencia,
              con_factura: !!v.con_factura,
            });
            cerrar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  async function elegirCliente() {
    const busqueda = el('input', { placeholder: 'Buscar cliente por nombre, documento o teléfono' });
    const lista = el('div', { class: 'pos-resultados' });
    const cerrar = modal('Elegir cliente (F3)', el('div', {}, [busqueda, lista]), [
      { texto: 'Consumidor final', accion: (c) => { estado.cliente = null; dibujarCliente(); c(); foco(); } },
    ]);
    async function refrescar() {
      const clientes = await api.get(`/clientes?q=${encodeURIComponent(busqueda.value)}`);
      lista.textContent = '';
      for (const c of clientes) {
        lista.appendChild(el('div', { class: 'fila', onclick: () => { estado.cliente = c; dibujarCliente(); cerrar(); foco(); } }, [
          el('span', { text: c.nombre }),
          el('span', { class: 'desglose', text: `saldo ${gs(c.saldo)} · límite ${gs(c.limite_credito)}` }),
        ]));
      }
    }
    busqueda.addEventListener('input', () => refrescar().catch(() => {}));
    await refrescar();
  }

  function pedirDescuento() {
    const entrada = el('input', { type: 'number', value: estado.descuento });
    modal('Descuento sobre el total (F5)', el('label', {}, [el('span', { text: 'Monto a descontar' }), entrada]), [
      { texto: 'Quitar', accion: (cerrar) => { estado.descuento = 0; dibujarLineas(); cerrar(); foco(); } },
      { texto: 'Aplicar', clase: 'primario', accion: (cerrar) => { estado.descuento = Math.max(0, Number(entrada.value || 0)); dibujarLineas(); cerrar(); foco(); } },
    ]);
  }

  async function traerPresupuesto() {
    const pendientes = await api.get('/presupuestos?estado=aprobado');
    const otros = await api.get('/presupuestos?estado=pendiente');
    const lista = [...pendientes, ...otros];
    if (!lista.length) return aviso('No hay presupuestos pendientes');
    const cerrar = modal('Traer presupuesto (F6)', tabla(
      [
        { titulo: 'N°', campo: 'numero' },
        { titulo: 'Cliente', valor: (p) => p.cliente_nombre || 'Consumidor final' },
        { titulo: 'Estado', campo: 'estado' },
        { titulo: 'Total', clase: 'num', valor: (p) => gs(p.total) },
      ],
      lista,
      {
        alClic: async (p) => {
          const detalle = await api.get(`/presupuestos/${p.id}`);
          estado.lineas = detalle.items.map((i) => ({
            presentacion_id: i.presentacion_id,
            presentacion: i.presentacion_nombre,
            producto: i.producto_nombre,
            factor: Number(i.factor),
            cantidad: Number(i.cantidad),
            precio: Number(i.precio_unitario),
          }));
          estado.presupuestoId = p.id;
          if (p.cliente_id) estado.cliente = await api.get(`/clientes/${p.cliente_id}`);
          dibujarLineas();
          dibujarCliente();
          cerrar();
          foco();
        },
      }
    ));
  }

  async function guardarPresupuesto() {
    if (!estado.lineas.length) return aviso('No hay items cargados', 'error');
    const r = await api.post('/presupuestos', {
      cliente_id: estado.cliente ? estado.cliente.id : null,
      items: estado.lineas.map((l) => ({ presentacion_id: l.presentacion_id, cantidad: l.cantidad })),
    });
    aviso(`Presupuesto ${r.numero} guardado`);
    estado.lineas = [];
    dibujarLineas();
    limpiarBusqueda();
  }

  // --- teclado ------------------------------------------------------------
  async function atajos(ev) {
    if (ev.key === 'F2') { ev.preventDefault(); cobrarContado(); }
    else if (ev.key === 'F3') { ev.preventDefault(); await elegirCliente(); }
    else if (ev.key === 'F4') { ev.preventDefault(); await cobrarCredito(); }
    else if (ev.key === 'F5') { ev.preventDefault(); pedirDescuento(); }
    else if (ev.key === 'F6') { ev.preventDefault(); await traerPresupuesto(); }
    else if (ev.key === 'F7') { ev.preventDefault(); await guardarPresupuesto(); }
    else if (ev.key === 'F8') {
      ev.preventDefault();
      if (estado.lineas.length && (await confirmar('¿Cancelar la venta en curso?'))) {
        estado.lineas = []; estado.descuento = 0; estado.presupuestoId = null; dibujarLineas(); limpiarBusqueda();
      }
    } else if (ev.key === 'Delete') {
      if (document.activeElement === buscador && buscador.value) return;
      ev.preventDefault();
      estado.lineas.pop();
      dibujarLineas();
      foco();
    } else if (ev.key === 'Escape') {
      const fondo = document.querySelector('.modal-fondo');
      if (fondo) fondo.remove();
      foco();
    }
  }
  document.addEventListener('keydown', atajos);

  buscador.addEventListener('keydown', async (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); estado.seleccion = Math.min(estado.seleccion + 1, estado.resultados.length - 1); pintarResultados(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); estado.seleccion = Math.max(estado.seleccion - 1, 0); pintarResultados(); }
    else if (ev.key === 'Enter') {
      ev.preventDefault();
      const texto = buscador.value.trim();
      if (!texto) return;
      // "3*codigo" carga tres bultos de una.
      const multiplo = texto.match(/^(\d+)\s*[*x]\s*(.+)$/i);
      const cantidad = multiplo ? Number(multiplo[1]) : 1;
      const consulta = multiplo ? multiplo[2] : texto;
      if (!estado.resultados.length || multiplo) await buscar(consulta);
      elegir(cantidad);
    }
  });

  let temporizador;
  buscador.addEventListener('input', () => {
    clearTimeout(temporizador);
    const texto = buscador.value.trim();
    if (/^\d+\s*[*x]/i.test(texto)) return;
    temporizador = setTimeout(() => { if (texto) buscar(texto).catch(() => {}); else { estado.resultados = []; pintarResultados(); } }, 180);
  });

  contenedor.appendChild(el('div', { class: 'pos' }, [
    el('div', {}, [
      el('div', { class: 'pos-buscador' }, [buscador, el('button', { class: 'primario', text: 'Cobrar (F2)', onclick: cobrarContado })]),
      resultados,
      cuerpoLineas,
      totalNodo,
    ]),
    el('div', { class: 'pos-lateral' }, [
      el('div', { class: 'panel' }, [infoCliente]),
      el('div', { class: 'panel' }, [el('h3', { text: 'Caja' }), infoCaja]),
      el('div', { class: 'panel atajos', html: `
        <b>Enter</b> agregar · <b>↑↓</b> elegir<br>
        <b>3*código</b> tres bultos<br>
        <b>F2</b> cobrar contado<br>
        <b>F3</b> cliente · <b>F4</b> crédito<br>
        <b>F5</b> descuento · <b>F6</b> presupuesto<br>
        <b>F7</b> guardar presupuesto<br>
        <b>F8</b> cancelar venta · <b>Supr</b> borrar última<br>
        <b>Esc</b> cerrar ventana` }),
    ]),
  ]));

  dibujarLineas();
  dibujarCliente();
  await dibujarCaja();
  foco();

  return () => document.removeEventListener('keydown', atajos);
}
