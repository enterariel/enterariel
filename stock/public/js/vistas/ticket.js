import { gs, fecha, numero } from '../ui.js';

function escapar(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Ticket de mostrador; si la venta tiene factura se imprime el encabezado legal
// con el timbrado y la discriminacion de IVA congelada.
export function ticketHtml(venta) {
  const negocio = venta.negocio || {};
  const factura = venta.factura;
  const filas = venta.items.map((i) => `
    <tr>
      <td>${escapar(i.producto_nombre)}<br><small>${escapar(i.presentacion_nombre)}</small></td>
      <td class="num">${numero(i.cantidad)}</td>
      <td class="num">${gs(i.precio_unitario)}</td>
      <td class="num">${gs(i.importe)}</td>
    </tr>`).join('');

  const cuotas = (venta.cuotas || []).map((c) => `
    <tr><td>Cuota ${c.numero}</td><td class="num">${fecha(c.vencimiento)}</td><td class="num">${gs(c.monto)}</td></tr>`).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${venta.numero}</title>
  <style>
    body { font-family: system-ui, sans-serif; font-size: 12px; width: 300px; margin: 0 auto; padding: 8px; }
    h1 { font-size: 15px; text-align: center; margin: 0 0 4px; }
    .centro { text-align: center; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    td, th { padding: 2px 0; vertical-align: top; }
    .num { text-align: right; }
    .linea { border-top: 1px dashed #000; margin: 6px 0; }
    .total { font-size: 15px; font-weight: bold; }
  </style></head><body>
  <h1>${escapar(negocio.nombre || 'Comprobante')}</h1>
  <div class="centro">
    ${negocio.ruc ? `RUC ${escapar(negocio.ruc)}<br>` : ''}
    ${negocio.direccion ? `${escapar(negocio.direccion)}<br>` : ''}
    ${negocio.telefono ? `Tel. ${escapar(negocio.telefono)}<br>` : ''}
  </div>
  <div class="linea"></div>
  <div class="centro">
    ${factura
      ? `<strong>FACTURA ${escapar(factura.numero_formateado)}</strong><br>Timbrado ${escapar(factura.timbrado_numero || '')}<br>`
      : `<strong>COMPROBANTE INTERNO N° ${venta.numero}</strong><br>`}
    ${fecha(venta.fecha, true)}
  </div>
  <div class="linea"></div>
  <div>Cliente: ${escapar(venta.cliente_nombre || 'Consumidor final')}</div>
  <div>Vendedor: ${escapar(venta.vendedor || '')}</div>
  <div>Condición: ${escapar(venta.condicion)}${venta.condicion === 'credito' ? ` (${escapar(venta.modalidad_credito || '')})` : ''}</div>
  <div class="linea"></div>
  <table>
    <thead><tr><th>Detalle</th><th class="num">Cant</th><th class="num">P.Unit</th><th class="num">Importe</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="linea"></div>
  <table>
    <tr><td>Subtotal</td><td class="num">${gs(venta.subtotal)}</td></tr>
    ${Number(venta.descuento) ? `<tr><td>Descuento</td><td class="num">- ${gs(venta.descuento)}</td></tr>` : ''}
    ${Number(venta.recargo) ? `<tr><td>Recargo por financiación</td><td class="num">${gs(venta.recargo)}</td></tr>` : ''}
    <tr class="total"><td>TOTAL</td><td class="num">${gs(venta.total)}</td></tr>
    ${Number(venta.entrega_inicial) ? `<tr><td>Entrega</td><td class="num">${gs(venta.entrega_inicial)}</td></tr>` : ''}
    ${Number(venta.financiado) ? `<tr><td>Saldo financiado</td><td class="num">${gs(venta.financiado)}</td></tr>` : ''}
  </table>
  ${factura ? `<div class="linea"></div><table>
    <tr><td>IVA 10%</td><td class="num">${gs(venta.iva['10'])}</td></tr>
    <tr><td>IVA 5%</td><td class="num">${gs(venta.iva['5'])}</td></tr>
    <tr><td>Exentas</td><td class="num">${gs(venta.iva['0'])}</td></tr>
  </table>` : ''}
  ${cuotas ? `<div class="linea"></div><table><tbody>${cuotas}</tbody></table>` : ''}
  <div class="linea"></div>
  <div class="centro">¡Gracias por su compra!</div>
  </body></html>`;
}
