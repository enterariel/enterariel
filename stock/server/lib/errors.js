class ErrorApp extends Error {
  constructor(mensaje, estado = 400, codigo = null) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

const malPedido = (m) => new ErrorApp(m, 400);
const noAutorizado = (m = 'Sesion no valida') => new ErrorApp(m, 401);
const prohibido = (m = 'No tenes permiso para esta operacion') => new ErrorApp(m, 403);
const noEncontrado = (m = 'No encontrado') => new ErrorApp(m, 404);

module.exports = { ErrorApp, malPedido, noAutorizado, prohibido, noEncontrado };
