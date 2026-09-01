import { api } from '../api.js';
import { el, fecha, hoy, primerDiaMes, pagina, tabla, modal, formulario, aviso, boton } from '../ui.js';

export async function render(contenedor) {
  const lista = el('div');
  const menus = await api.get('/usuarios/menus-disponibles');

  async function refrescar() {
    const usuarios = await api.get('/usuarios');
    lista.textContent = '';
    lista.appendChild(tabla(
      [
        { titulo: 'Usuario', campo: 'usuario' },
        { titulo: 'Nombre', campo: 'nombre' },
        { titulo: 'Rol', campo: 'rol' },
        { titulo: 'Menús', valor: (u) => (u.rol === 'admin' ? 'todos' : u.menus.join(', ')) },
        { titulo: 'Activo', valor: (u) => (u.activo ? 'sí' : 'no') },
        { titulo: 'Alta', valor: (u) => fecha(u.creado_en) },
      ],
      usuarios,
      { alClic: (u) => editar(u) }
    ));
  }

  function selectorMenus(seleccionados) {
    const caja = el('div', { class: 'chips' });
    for (const m of menus) {
      const entrada = el('input', { type: 'checkbox', value: m });
      entrada.checked = seleccionados.includes(m);
      caja.appendChild(el('label', { class: 'en-linea' }, [entrada, el('span', { text: m })]));
    }
    return {
      nodo: caja,
      valores: () => [...caja.querySelectorAll('input:checked')].map((i) => i.value),
    };
  }

  function nuevo() {
    const form = formulario([
      { campo: 'usuario', titulo: 'Usuario' },
      { campo: 'nombre', titulo: 'Nombre' },
      { campo: 'rol', titulo: 'Rol', tipo: 'select', opciones: [
        { valor: 'vendedor', texto: 'Vendedor' }, { valor: 'deposito', texto: 'Depósito' }, { valor: 'admin', texto: 'Administrador' },
      ] },
      { campo: 'password', titulo: 'Contraseña', tipo: 'password' },
    ], {});
    const sel = selectorMenus(['tablero', 'pos', 'ventas', 'clientes']);
    modal('Nuevo usuario', el('div', {}, [form.nodo, el('h4', { text: 'Menús habilitados' }), sel.nodo]), [
      { texto: 'Cancelar', accion: (cerrar) => cerrar() },
      {
        texto: 'Crear',
        clase: 'primario',
        accion: async (cerrar) => {
          try { await api.post('/usuarios', { ...form.valores(), menus: sel.valores() }); aviso('Usuario creado'); cerrar(); await refrescar(); }
          catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  function editar(u) {
    const form = formulario([
      { campo: 'nombre', titulo: 'Nombre' },
      { campo: 'rol', titulo: 'Rol', tipo: 'select', opciones: [
        { valor: 'vendedor', texto: 'Vendedor' }, { valor: 'deposito', texto: 'Depósito' }, { valor: 'admin', texto: 'Administrador' },
      ] },
      { campo: 'activo', titulo: 'Activo', tipo: 'checkbox' },
      { campo: 'password', titulo: 'Nueva contraseña', tipo: 'password', ayuda: 'Dejalo vacío para no cambiarla' },
    ], u);
    const sel = selectorMenus(u.menus);
    modal(`Usuario ${u.usuario}`, el('div', {}, [form.nodo, el('h4', { text: 'Menús habilitados' }), sel.nodo]), [
      { texto: 'Cancelar', accion: (cerrar) => cerrar() },
      {
        texto: 'Guardar',
        clase: 'primario',
        accion: async (cerrar) => {
          try {
            const v = form.valores();
            if (!v.password) delete v.password;
            await api.put(`/usuarios/${u.id}`, { ...v, menus: sel.valores() });
            aviso('Usuario actualizado');
            cerrar();
            await refrescar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  async function auditoria() {
    const desde = el('input', { type: 'date', value: primerDiaMes() });
    const hasta = el('input', { type: 'date', value: hoy() });
    const cuerpo = el('div');
    async function cargar() {
      const filas = await api.get(`/usuarios/auditoria?desde=${desde.value}&hasta=${hasta.value}`);
      cuerpo.textContent = '';
      cuerpo.appendChild(tabla(
        [
          { titulo: 'Fecha', valor: (a) => fecha(a.creado_en, true) },
          { titulo: 'Usuario', campo: 'usuario_nombre' },
          { titulo: 'Acción', campo: 'accion' },
          { titulo: 'Entidad', valor: (a) => `${a.entidad}${a.entidad_id ? ` #${a.entidad_id}` : ''}` },
          { titulo: 'IP', campo: 'ip' },
        ],
        filas
      ));
    }
    desde.addEventListener('change', () => cargar());
    hasta.addEventListener('change', () => cargar());
    await cargar();
    modal('Auditoría', el('div', {}, [el('div', { class: 'acciones' }, [desde, hasta]), cuerpo]), [
      { texto: 'Cerrar', accion: (cerrar) => cerrar() },
    ]);
  }

  contenedor.appendChild(pagina('Usuarios', [boton('Auditoría', auditoria), boton('Nuevo usuario', nuevo, 'primario')], [lista]));
  await refrescar();
}
