// Envuelve handlers async para que cualquier rechazo llegue al manejador de errores.
const asyncRuta = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { asyncRuta };
