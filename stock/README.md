# Sistema de Stock

Sistema de stock, ventas de mostrador (POS), cuenta corriente, caja y reportes para negocios
de venta al público (por ejemplo, una distribuidora de bebidas). Node + Express + MySQL/MariaDB
con frontend en HTML/CSS/JavaScript sin frameworks.

## Ideas centrales

- **Un solo stock por producto, en unidad base.** Las presentaciones (unidad, pack x6, cajón x12,
  granel) son formas de vender y comprar ese mismo stock: cada una tiene su factor, su código de
  barras y su precio. Vender un pack descuenta `factor` unidades base.
- **Toda escritura de stock pasa por `server/lib/stock.js`**, que deja el movimiento en el libro
  mayor con stock antes/después, origen, referencia y usuario. Los productos se bloquean con
  `SELECT ... FOR UPDATE` dentro de la transacción de la venta o compra.
- **Nada se borra**: anulaciones y devoluciones generan contramovimientos y conservan el histórico.
- **Guaraníes enteros** en montos operativos; solo el costo por unidad base usa decimales.

## Puesta en marcha

```bash
cp .env.example .env      # datos de conexión a MySQL/MariaDB
npm install
npm run setup             # crea la base y el esquema, deja config y admin inicial
npm run seed              # opcional: datos de ejemplo (usuarios admin/vendedor/deposito)
npm start                 # http://localhost:3000
```

Scripts: `npm run dev` (watch), `npm test` (18 pruebas de API contra `stock_test`), `npm run lint`.

## Módulos

| Área | Qué resuelve |
| --- | --- |
| Mostrador (POS) | Búsqueda única por código de barras, código interno o nombre; atajos de teclado; contado, crédito y presupuestos; ticket y factura |
| Productos | Alta de productos y presentaciones con factor, código de barras y precio |
| Stock y conteo | Kardex, ajustes manuales, conteo físico por CSV (plantilla, simulación y aplicación) |
| Compras | Ingreso en la presentación que factura el proveedor, costo por unidad base y repricing por margen |
| Clientes / Créditos | Cuenta corriente, cuotas fijas o libreta (excluyentes), límite de crédito, cobranzas imputadas |
| Proveedores | Cuenta corriente y pagos imputados a los comprobantes más viejos |
| Caja | Apertura, entregas del admin, arqueo y cierre; las cobranzas de cuenta corriente quedan fuera del esperado |
| Gastos | Gastos generales, sin efecto en stock ni cuenta corriente; en efectivo salen de la caja |
| Reportes | 19 reportes con rango de fechas, totales, CSV e impresión |
| Usuarios | Roles (admin, vendedor, depósito), menús por usuario y auditoría |
| Configuración | Datos del negocio, modalidad de crédito, tramos de recargo, sesiones, timbrados y backup |
| Tienda | Catálogo público en `/tienda.html`, solo lectura, pedidos por WhatsApp |

## Atajos del POS

`↑ ↓ + Enter` elegir producto · `3*código` cargar 3 unidades · `F2` cobrar · `F3` cliente ·
`F4` crédito · `F5` descuento · `F6` traer presupuesto · `F7` guardar presupuesto ·
`F8` cancelar venta · `Supr` borrar última línea · `Esc` cerrar ventana. El foco siempre vuelve al buscador.
