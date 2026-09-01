const db = require('../db');

// El log de auditoria nunca puede voltear la operacion que audita.
async function registrar(req, accion, entidad = null, entidadId = null, detalle = null) {
  try {
    const usuarioId = req && req.usuario ? req.usuario.id : null;
    await db.ejecutar(
      'INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle) VALUES (?, ?, ?, ?, ?)',
      [usuarioId, accion, entidad, entidadId, detalle ? JSON.stringify(detalle) : null]
    );
  } catch (err) {
    console.error('[auditoria] no se pudo registrar', accion, err.message);
  }
}

module.exports = { registrar };
