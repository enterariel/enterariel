import { api } from '../api.js';
import { el, gs, numero, fecha, pagina, tarjeta, tabla } from '../ui.js';

export async function render(contenedor) {
  const d = await api.get('/tablero');
  contenedor.appendChild(
    pagina('Tablero', [], [
      el('div', { class: 'tarjetas' }, [
        tarjeta('Ventas de hoy', gs(d.ventas_dia.total), `${numero(d.ventas_dia.tickets)} tickets`),
        tarjeta('Ventas del mes', gs(d.ventas_mes.total), `${numero(d.ventas_mes.tickets)} tickets`),
        tarjeta('Por cobrar', gs(d.por_cobrar), `Libretas abiertas ${gs(d.libretas_abiertas)}`),
        tarjeta('Por pagar', gs(d.por_pagar), 'Saldo con proveedores'),
        tarjeta('Valor de inventario', gs(d.valor_inventario), 'A costo por unidad base'),
        tarjeta('Caja', d.caja_abierta ? `Abierta #${d.caja_abierta.id}` : 'Cerrada',
          d.caja_abierta ? fecha(d.caja_abierta.abierta_en, true) : 'Abrila desde el módulo Caja'),
      ]),
      el('div', { class: 'panel' }, [
        el('h3', { text: 'Productos en o bajo el mínimo' }),
        d.productos_criticos.length
          ? tabla(
              [
                { titulo: 'Producto', campo: 'nombre' },
                { titulo: 'Stock', clase: 'num', valor: (p) => numero(p.stock) },
                { titulo: 'Mínimo', clase: 'num', valor: (p) => numero(p.stock_minimo) },
              ],
              d.productos_criticos
            )
          : el('p', { text: 'Ningún producto está bajo el mínimo.' }),
      ]),
    ])
  );
}
