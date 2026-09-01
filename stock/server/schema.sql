-- Esquema del sistema de stock, ventas y cuenta corriente.
-- Montos en guaranies: enteros, DECIMAL(14,0). Costos con 2 decimales para no perder
-- precision al convertir el costo de un bulto a costo por unidad base.

CREATE TABLE IF NOT EXISTS config (
  clave VARCHAR(64) PRIMARY KEY,
  valor VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(40) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  rol ENUM('admin','vendedor','deposito') NOT NULL DEFAULT 'vendedor',
  pass_hash VARCHAR(255) NOT NULL,
  salt VARCHAR(64) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  intentos_fallidos INT NOT NULL DEFAULT 0,
  bloqueado_hasta DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Permisos de menu por usuario, independientes del rol.
CREATE TABLE IF NOT EXISTS usuario_menus (
  usuario_id INT NOT NULL,
  menu VARCHAR(40) NOT NULL,
  PRIMARY KEY (usuario_id, menu),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sesiones (
  token CHAR(64) PRIMARY KEY,
  usuario_id INT NOT NULL,
  creada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en DATETIME NOT NULL,
  ultima_actividad DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrada TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auditoria (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NULL,
  accion VARCHAR(60) NOT NULL,
  entidad VARCHAR(40) NULL,
  entidad_id BIGINT NULL,
  detalle TEXT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auditoria_fecha (creado_en),
  INDEX idx_auditoria_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- El stock vive SIEMPRE en la unidad base (lata, unidad, sachet...).
CREATE TABLE IF NOT EXISTS productos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo_interno VARCHAR(40) NOT NULL UNIQUE,
  nombre VARCHAR(160) NOT NULL,
  categoria_id INT NULL,
  unidad_base VARCHAR(30) NOT NULL DEFAULT 'Unidad',
  stock INT NOT NULL DEFAULT 0,
  stock_minimo INT NOT NULL DEFAULT 0,
  costo_unitario DECIMAL(14,2) NOT NULL DEFAULT 0,
  margen DECIMAL(6,2) NULL,
  iva TINYINT NOT NULL DEFAULT 10,
  foto_url VARCHAR(255) NULL,
  publicado TINYINT(1) NOT NULL DEFAULT 1,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
  INDEX idx_productos_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Formas de vender el mismo pozo de stock. factor = unidades base que contiene.
CREATE TABLE IF NOT EXISTS presentaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL,
  nombre VARCHAR(60) NOT NULL,
  factor INT NOT NULL DEFAULT 1,
  codigo_barras VARCHAR(60) NULL UNIQUE,
  precio DECIMAL(14,0) NOT NULL DEFAULT 0,
  es_base TINYINT(1) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  INDEX idx_pres_producto (producto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Libro mayor de stock: unico registro de toda variacion, con antes/despues.
CREATE TABLE IF NOT EXISTS movimientos_stock (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  origen ENUM('inicial','venta','compra','ajuste','devolucion','anulacion') NOT NULL,
  referencia_tipo VARCHAR(30) NULL,
  referencia_id BIGINT NULL,
  cantidad INT NOT NULL,
  stock_antes INT NOT NULL,
  stock_despues INT NOT NULL,
  usuario_id INT NULL,
  detalle VARCHAR(255) NULL,
  FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  INDEX idx_mov_producto (producto_id, fecha),
  INDEX idx_mov_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL,
  documento VARCHAR(40) NULL,
  telefono VARCHAR(40) NULL,
  direccion VARCHAR(200) NULL,
  limite_credito DECIMAL(14,0) NOT NULL DEFAULT 0,
  saldo DECIMAL(14,0) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_clientes_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS proveedores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL,
  ruc VARCHAR(40) NULL,
  telefono VARCHAR(40) NULL,
  saldo DECIMAL(14,0) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Libro mayor de cuenta corriente (clientes y proveedores).
CREATE TABLE IF NOT EXISTS cc_movimientos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  persona_tipo ENUM('cliente','proveedor') NOT NULL,
  persona_id INT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concepto VARCHAR(160) NOT NULL,
  referencia_tipo VARCHAR(30) NULL,
  referencia_id BIGINT NULL,
  debe DECIMAL(14,0) NOT NULL DEFAULT 0,
  haber DECIMAL(14,0) NOT NULL DEFAULT 0,
  saldo DECIMAL(14,0) NOT NULL DEFAULT 0,
  usuario_id INT NULL,
  INDEX idx_cc_persona (persona_tipo, persona_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cajas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  abierta_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrada_en DATETIME NULL,
  fondo_inicial DECIMAL(14,0) NOT NULL DEFAULT 0,
  esperado DECIMAL(14,0) NULL,
  contado DECIMAL(14,0) NULL,
  diferencia DECIMAL(14,0) NULL,
  estado ENUM('abierta','cerrada') NOT NULL DEFAULT 'abierta',
  observacion VARCHAR(255) NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_caja_usuario (usuario_id, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Movimientos de efectivo del turno. Las cobranzas de cuenta corriente NO entran.
CREATE TABLE IF NOT EXISTS caja_movimientos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  caja_id INT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo ENUM('fondo','entrega','venta','entrega_inicial','devolucion','gasto') NOT NULL,
  monto DECIMAL(14,0) NOT NULL,
  referencia_tipo VARCHAR(30) NULL,
  referencia_id BIGINT NULL,
  detalle VARCHAR(200) NULL,
  usuario_id INT NULL,
  FOREIGN KEY (caja_id) REFERENCES cajas(id) ON DELETE CASCADE,
  INDEX idx_cajamov_caja (caja_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS timbrados (
  id INT AUTO_INCREMENT PRIMARY KEY,
  numero VARCHAR(20) NOT NULL,
  establecimiento CHAR(3) NOT NULL DEFAULT '001',
  punto_expedicion CHAR(3) NOT NULL DEFAULT '001',
  desde INT NOT NULL,
  hasta INT NOT NULL,
  actual INT NOT NULL,
  vigencia_desde DATE NOT NULL,
  vigencia_hasta DATE NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ventas (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  numero BIGINT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cliente_id INT NULL,
  usuario_id INT NOT NULL,
  caja_id INT NULL,
  condicion ENUM('contado','credito') NOT NULL DEFAULT 'contado',
  modalidad_credito ENUM('cuotas_fijas','libreta') NULL,
  clasificacion ENUM('contado','entrega_fuerte','con_recargo','bajo_minimo') NULL,
  subtotal DECIMAL(14,0) NOT NULL DEFAULT 0,
  descuento DECIMAL(14,0) NOT NULL DEFAULT 0,
  recargo DECIMAL(14,0) NOT NULL DEFAULT 0,
  total DECIMAL(14,0) NOT NULL DEFAULT 0,
  entrega_inicial DECIMAL(14,0) NOT NULL DEFAULT 0,
  financiado DECIMAL(14,0) NOT NULL DEFAULT 0,
  medio_pago ENUM('efectivo','transferencia','tarjeta','mixto') NOT NULL DEFAULT 'efectivo',
  estado ENUM('activa','anulada') NOT NULL DEFAULT 'activa',
  anulada_en DATETIME NULL,
  anulada_por INT NULL,
  observacion VARCHAR(255) NULL,
  UNIQUE KEY uq_venta_numero (numero),
  INDEX idx_venta_fecha (fecha),
  INDEX idx_venta_cliente (cliente_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS venta_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  venta_id BIGINT NOT NULL,
  producto_id INT NOT NULL,
  presentacion_id INT NULL,
  producto_nombre VARCHAR(160) NOT NULL,
  presentacion_nombre VARCHAR(60) NOT NULL,
  factor INT NOT NULL DEFAULT 1,
  cantidad INT NOT NULL,
  devuelto INT NOT NULL DEFAULT 0,
  precio_unitario DECIMAL(14,0) NOT NULL,
  importe DECIMAL(14,0) NOT NULL,
  iva TINYINT NOT NULL DEFAULT 10,
  iva_monto DECIMAL(14,0) NOT NULL DEFAULT 0,
  costo_base DECIMAL(14,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  INDEX idx_vitem_venta (venta_id),
  INDEX idx_vitem_producto (producto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS facturas (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  venta_id BIGINT NOT NULL UNIQUE,
  timbrado_id INT NOT NULL,
  numero INT NOT NULL,
  numero_formateado VARCHAR(30) NOT NULL,
  timbrado_numero VARCHAR(20) NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cuotas (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  venta_id BIGINT NOT NULL,
  numero INT NOT NULL,
  vencimiento DATE NOT NULL,
  monto DECIMAL(14,0) NOT NULL,
  pagado DECIMAL(14,0) NOT NULL DEFAULT 0,
  estado ENUM('pendiente','pagada','anulada') NOT NULL DEFAULT 'pendiente',
  FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  INDEX idx_cuota_venta (venta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS libretas (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  abierta_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrada_en DATETIME NULL,
  total DECIMAL(14,0) NOT NULL DEFAULT 0,
  pagado DECIMAL(14,0) NOT NULL DEFAULT 0,
  estado ENUM('abierta','cerrada') NOT NULL DEFAULT 'abierta',
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  INDEX idx_libreta_cliente (cliente_id, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS libreta_movimientos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  libreta_id BIGINT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concepto VARCHAR(160) NOT NULL,
  cargo DECIMAL(14,0) NOT NULL DEFAULT 0,
  abono DECIMAL(14,0) NOT NULL DEFAULT 0,
  referencia_tipo VARCHAR(30) NULL,
  referencia_id BIGINT NULL,
  FOREIGN KEY (libreta_id) REFERENCES libretas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pagos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  persona_tipo ENUM('cliente','proveedor') NOT NULL,
  persona_id INT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  monto DECIMAL(14,0) NOT NULL,
  medio ENUM('efectivo','transferencia','tarjeta','cheque') NOT NULL DEFAULT 'efectivo',
  usuario_id INT NULL,
  observacion VARCHAR(200) NULL,
  INDEX idx_pago_persona (persona_tipo, persona_id, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pago_aplicaciones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  pago_id BIGINT NOT NULL,
  cuota_id BIGINT NULL,
  libreta_id BIGINT NULL,
  compra_id BIGINT NULL,
  monto DECIMAL(14,0) NOT NULL,
  FOREIGN KEY (pago_id) REFERENCES pagos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS compras (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  proveedor_id INT NOT NULL,
  comprobante VARCHAR(40) NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  condicion ENUM('contado','credito') NOT NULL DEFAULT 'contado',
  total DECIMAL(14,0) NOT NULL DEFAULT 0,
  pagado DECIMAL(14,0) NOT NULL DEFAULT 0,
  estado ENUM('activa','anulada') NOT NULL DEFAULT 'activa',
  usuario_id INT NULL,
  anulada_en DATETIME NULL,
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
  INDEX idx_compra_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS compra_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  compra_id BIGINT NOT NULL,
  producto_id INT NOT NULL,
  presentacion_id INT NULL,
  presentacion_nombre VARCHAR(60) NOT NULL,
  factor INT NOT NULL DEFAULT 1,
  cantidad INT NOT NULL,
  costo_presentacion DECIMAL(14,0) NOT NULL,
  costo_base DECIMAL(14,2) NOT NULL,
  importe DECIMAL(14,0) NOT NULL,
  FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
  INDEX idx_citem_producto (producto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS categorias_gasto (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gastos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  categoria_id INT NULL,
  descripcion VARCHAR(200) NOT NULL,
  monto DECIMAL(14,0) NOT NULL,
  medio ENUM('efectivo','transferencia','tarjeta','cheque') NOT NULL DEFAULT 'efectivo',
  caja_id INT NULL,
  usuario_id INT NULL,
  FOREIGN KEY (categoria_id) REFERENCES categorias_gasto(id) ON DELETE SET NULL,
  INDEX idx_gasto_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS presupuestos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  numero BIGINT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cliente_id INT NULL,
  usuario_id INT NOT NULL,
  total DECIMAL(14,0) NOT NULL DEFAULT 0,
  estado ENUM('pendiente','aprobado','convertido','anulado') NOT NULL DEFAULT 'pendiente',
  venta_id BIGINT NULL,
  validez_dias INT NOT NULL DEFAULT 7,
  UNIQUE KEY uq_presu_numero (numero),
  INDEX idx_presu_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS presupuesto_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  presupuesto_id BIGINT NOT NULL,
  producto_id INT NOT NULL,
  presentacion_id INT NULL,
  producto_nombre VARCHAR(160) NOT NULL,
  presentacion_nombre VARCHAR(60) NOT NULL,
  factor INT NOT NULL DEFAULT 1,
  cantidad INT NOT NULL,
  precio_unitario DECIMAL(14,0) NOT NULL,
  importe DECIMAL(14,0) NOT NULL,
  FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS devoluciones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  venta_id BIGINT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id INT NULL,
  total DECIMAL(14,0) NOT NULL DEFAULT 0,
  motivo VARCHAR(200) NULL,
  FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS devolucion_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  devolucion_id BIGINT NOT NULL,
  venta_item_id BIGINT NOT NULL,
  cantidad INT NOT NULL,
  importe DECIMAL(14,0) NOT NULL,
  FOREIGN KEY (devolucion_id) REFERENCES devoluciones(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tramos de recargo segun cantidad de cuotas (ej. 1-3 => 10%).
CREATE TABLE IF NOT EXISTS recargo_tramos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cuotas_desde INT NOT NULL,
  cuotas_hasta INT NOT NULL,
  porcentaje DECIMAL(6,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
