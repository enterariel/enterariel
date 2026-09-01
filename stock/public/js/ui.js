export function el(tag, atributos = {}, hijos = []) {
  const nodo = document.createElement(tag);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === 'class') nodo.className = valor;
    else if (clave === 'html') nodo.innerHTML = valor;
    else if (clave === 'text') nodo.textContent = valor;
    else if (clave.startsWith('on') && typeof valor === 'function') nodo.addEventListener(clave.slice(2), valor);
    else if (clave === 'valor') nodo.value = valor;
    else nodo.setAttribute(clave, valor);
  }
  for (const hijo of [].concat(hijos)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.appendChild(typeof hijo === 'string' ? document.createTextNode(hijo) : hijo);
  }
  return nodo;
}

export function gs(valor) {
  const n = Math.round(Number(valor) || 0);
  return `Gs. ${n.toLocaleString('es-PY')}`;
}

export function numero(valor) {
  return (Number(valor) || 0).toLocaleString('es-PY');
}

export function fecha(valor, conHora = false) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor).slice(0, 10);
  const base = d.toLocaleDateString('es-PY');
  return conHora ? `${base} ${d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}` : base;
}

export function hoy() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function primerDiaMes() {
  return `${hoy().slice(0, 7)}-01`;
}

let temporizadorAviso;
export function aviso(mensaje, tipo = 'ok') {
  let caja = document.getElementById('aviso');
  if (!caja) {
    caja = el('div', { id: 'aviso' });
    document.body.appendChild(caja);
  }
  caja.className = `aviso ${tipo} visible`;
  caja.textContent = mensaje;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => caja.classList.remove('visible'), 4000);
}

export function tabla(columnas, filas, opciones = {}) {
  const cuerpo = el('tbody', {}, filas.map((fila, indice) => {
    const tr = el('tr', { class: opciones.claseFila ? opciones.claseFila(fila) : null },
      columnas.map((col) => {
        const valor = typeof col.valor === 'function' ? col.valor(fila, indice) : fila[col.campo];
        return el('td', { class: col.clase || null }, [
          valor instanceof Node ? valor : String(valor === null || valor === undefined ? '' : valor),
        ]);
      })
    );
    if (opciones.alClic) tr.addEventListener('click', () => opciones.alClic(fila));
    if (opciones.alClic) tr.classList.add('clicable');
    return tr;
  }));

  return el('table', { class: 'tabla' }, [
    el('thead', {}, [el('tr', {}, columnas.map((c) => el('th', { class: c.clase || null, text: c.titulo })))]),
    cuerpo,
    opciones.pie ? el('tfoot', {}, [opciones.pie]) : null,
  ]);
}

export function modal(titulo, contenido, acciones = []) {
  const fondo = el('div', { class: 'modal-fondo' });
  const cerrar = () => fondo.remove();
  const caja = el('div', { class: 'modal' }, [
    el('header', {}, [el('h3', { text: titulo }), el('button', { class: 'icono', text: '✕', onclick: cerrar })]),
    el('div', { class: 'modal-cuerpo' }, [contenido]),
    acciones.length
      ? el('footer', {}, acciones.map((a) =>
          el('button', {
            class: a.clase || 'secundario',
            text: a.texto,
            onclick: () => a.accion(cerrar),
          })
        ))
      : null,
  ]);
  fondo.appendChild(caja);
  fondo.addEventListener('click', (ev) => { if (ev.target === fondo) cerrar(); });
  document.addEventListener('keydown', function escuchar(ev) {
    if (ev.key === 'Escape') { cerrar(); document.removeEventListener('keydown', escuchar); }
  });
  document.body.appendChild(fondo);
  const primero = caja.querySelector('input, select, textarea, button');
  if (primero) primero.focus();
  return cerrar;
}

export function confirmar(mensaje) {
  return new Promise((resolver) => {
    modal('Confirmar', el('p', { text: mensaje }), [
      { texto: 'Cancelar', accion: (cerrar) => { cerrar(); resolver(false); } },
      { texto: 'Aceptar', clase: 'primario', accion: (cerrar) => { cerrar(); resolver(true); } },
    ]);
  });
}

// Formulario declarativo: [{ campo, titulo, tipo, opciones, valor, requerido }]
export function formulario(campos, valores = {}) {
  const nodos = {};
  const contenedor = el('div', { class: 'formulario' }, campos.map((c) => {
    let entrada;
    if (c.tipo === 'select') {
      entrada = el('select', {}, (c.opciones || []).map((o) =>
        el('option', { value: o.valor, text: o.texto, selected: String(valores[c.campo] ?? '') === String(o.valor) })
      ));
      entrada.value = valores[c.campo] ?? (c.opciones && c.opciones.length ? c.opciones[0].valor : '');
    } else if (c.tipo === 'textarea') {
      entrada = el('textarea', { rows: c.filas || 3 });
      entrada.value = valores[c.campo] ?? '';
    } else if (c.tipo === 'checkbox') {
      entrada = el('input', { type: 'checkbox' });
      entrada.checked = !!valores[c.campo];
    } else {
      entrada = el('input', { type: c.tipo || 'text', step: c.paso || null, placeholder: c.placeholder || null });
      entrada.value = valores[c.campo] ?? '';
    }
    nodos[c.campo] = entrada;
    return el('label', { class: c.ancho === 'completo' ? 'completo' : null }, [
      el('span', { text: c.titulo }),
      entrada,
      c.ayuda ? el('small', { text: c.ayuda }) : null,
    ]);
  }));

  return {
    nodo: contenedor,
    nodos,
    valores() {
      const salida = {};
      for (const c of campos) {
        const entrada = nodos[c.campo];
        if (c.tipo === 'checkbox') salida[c.campo] = entrada.checked ? 1 : 0;
        else if (c.tipo === 'number') salida[c.campo] = entrada.value === '' ? null : Number(entrada.value);
        else salida[c.campo] = entrada.value;
      }
      return salida;
    },
  };
}

export function pagina(titulo, acciones = [], contenido = []) {
  return el('section', { class: 'pagina' }, [
    el('header', { class: 'pagina-cabecera' }, [el('h2', { text: titulo }), el('div', { class: 'acciones' }, acciones)]),
    ...[].concat(contenido),
  ]);
}

export function boton(texto, alClic, clase = 'secundario') {
  return el('button', { class: clase, text: texto, onclick: alClic });
}

export function tarjeta(titulo, valor, detalle) {
  return el('div', { class: 'tarjeta' }, [
    el('span', { class: 'tarjeta-titulo', text: titulo }),
    el('strong', { class: 'tarjeta-valor', text: valor }),
    detalle ? el('small', { text: detalle }) : null,
  ]);
}

export function imprimir(html) {
  const marco = el('iframe', { class: 'marco-impresion' });
  document.body.appendChild(marco);
  marco.contentDocument.write(html);
  marco.contentDocument.close();
  marco.contentWindow.focus();
  marco.contentWindow.print();
  setTimeout(() => marco.remove(), 1000);
}
