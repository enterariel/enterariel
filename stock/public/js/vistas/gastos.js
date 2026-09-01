import { api } from '../api.js';
import { el, gs, fecha, hoy, primerDiaMes, pagina, tabla, modal, formulario, aviso, boton, confirmar } from '../ui.js';
import { sesion } from '../app.js';

export async function render(contenedor) {
  const lista = el('div');
  const desde = el('input', { type: 'date', value: primerDiaMes() });
  const hasta = el('input', { type: 'date', value: hoy() });
  let categorias = await api.get('/gastos/categorias');

  async function refrescar() {
    const gastos = await api.get(`/gastos?desde=${desde.value}&hasta=${hasta.value}`);
    const total = gastos.reduce((a, g) => a + Number(g.monto), 0);
    lista.textContent = '';
    lista.appendChild(tabla(
      [
        { titulo: 'Fecha', valor: (g) => fecha(g.fecha, true) },
        { titulo: 'Categoría', campo: 'categoria_nombre' },
        { titulo: 'Descripción', campo: 'descripcion' },
        { titulo: 'Medio', campo: 'medio' },
        { titulo: 'Cargado por', campo: 'usuario_nombre' },
        { titulo: 'Monto', clase: 'num', valor: (g) => gs(g.monto) },
        ...(sesion.usuario && sesion.usuario.rol === 'admin'
          ? [{ titulo: '', valor: (g) => boton('Borrar', async () => {
              if (!(await confirmar('¿Borrar el gasto?'))) return;
              await api.del(`/gastos/${g.id}`);
              aviso('Gasto borrado');
              await refrescar();
            }) }]
          : []),
      ],
      gastos
    ));
    lista.appendChild(el('p', { class: 'pos-total', text: `Total del período: ${gs(total)}` }));
  }

  function nuevo() {
    const form = formulario([
      { campo: 'descripcion', titulo: 'Descripción', ancho: 'completo' },
      { campo: 'monto', titulo: 'Monto', tipo: 'number' },
      { campo: 'categoria_id', titulo: 'Categoría', tipo: 'select', opciones: [{ valor: '', texto: 'Sin categoría' }, ...categorias.map((c) => ({ valor: c.id, texto: c.nombre }))] },
      { campo: 'medio', titulo: 'Medio de pago', tipo: 'select', opciones: [
        { valor: 'efectivo', texto: 'Efectivo (sale de la caja)' },
        { valor: 'transferencia', texto: 'Transferencia' },
        { valor: 'tarjeta', texto: 'Tarjeta' },
      ] },
    ], {});
    modal('Nuevo gasto', el('div', {}, [
      form.nodo,
      el('p', { class: 'desglose', text: 'Los gastos no tocan stock ni cuenta corriente; en efectivo salen de la caja abierta.' }),
    ]), [
      { texto: 'Cancelar', accion: (cerrar) => cerrar() },
      {
        texto: 'Registrar',
        clase: 'primario',
        accion: async (cerrar) => {
          try {
            const v = form.valores();
            await api.post('/gastos', { ...v, categoria_id: v.categoria_id || null });
            aviso('Gasto registrado');
            cerrar();
            await refrescar();
          } catch (err) { aviso(err.message, 'error'); }
        },
      },
    ]);
  }

  function gestionarCategorias() {
    const entrada = el('input', { placeholder: 'Nueva categoría de gasto' });
    const cuerpo = el('div');
    function pintar() {
      cuerpo.textContent = '';
      cuerpo.appendChild(tabla([{ titulo: 'Categoría', campo: 'nombre' }], categorias));
    }
    pintar();
    modal('Categorías de gasto', el('div', {}, [entrada, cuerpo]), [
      {
        texto: 'Agregar',
        clase: 'primario',
        accion: async () => {
          if (!entrada.value.trim()) return;
          await api.post('/gastos/categorias', { nombre: entrada.value.trim() });
          categorias = await api.get('/gastos/categorias');
          entrada.value = '';
          pintar();
        },
      },
    ]);
  }

  contenedor.appendChild(
    pagina('Gastos', [desde, hasta, boton('Buscar', () => refrescar(), 'primario'), boton('Categorías', gestionarCategorias), boton('Nuevo gasto', nuevo, 'primario')], [lista])
  );
  await refrescar();
}
