const express = require('express');
const db = require('../db');
const auditoria = require('../lib/auditoria');
const { asyncRuta } = require('../lib/ruta');
const { malPedido, noEncontrado } = require('../lib/errors');
const { soloAdmin } = require('../middleware/auth');
const { hoyIso } = require('../lib/fechas');

const router = express.Router();

router.get(
  '/',
  asyncRuta(async (req, res) => {
    const filas = await db.query('SELECT * FROM timbrados ORDER BY id DESC');
    const hoy = hoyIso();
    res.json(
      filas.map((t) => ({
        ...t,
        disponibles: Number(t.hasta) - Number(t.actual),
        vigente: t.activo && t.vigencia_desde <= hoy && t.vigencia_hasta >= hoy && Number(t.actual) < Number(t.hasta),
      }))
    );
  })
);

// Timbrado preimpreso: el rango y la vigencia se cargan a mano.
router.post(
  '/',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const {
      numero, establecimiento = '001', punto_expedicion = '001',
      desde, hasta, vigencia_desde, vigencia_hasta, actual = null,
    } = req.body || {};
    if (!numero || !desde || !hasta || !vigencia_desde || !vigencia_hasta) {
      throw malPedido('Numero, rango y vigencia son obligatorios');
    }
    if (Number(hasta) < Number(desde)) throw malPedido('El rango es invalido');

    const r = await db.ejecutar(
      `INSERT INTO timbrados (numero, establecimiento, punto_expedicion, desde, hasta, actual, vigencia_desde, vigencia_hasta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [numero, establecimiento, punto_expedicion, Number(desde), Number(hasta),
        actual === null ? Number(desde) - 1 : Number(actual), vigencia_desde, vigencia_hasta]
    );
    await auditoria.registrar(req, 'timbrado_crear', 'timbrado', r.insertId, { numero });
    res.status(201).json({ id: r.insertId });
  })
);

router.put(
  '/:id',
  soloAdmin,
  asyncRuta(async (req, res) => {
    const id = Number(req.params.id);
    const actual = await db.uno('SELECT * FROM timbrados WHERE id = ?', [id]);
    if (!actual) throw noEncontrado('Timbrado no encontrado');
    const b = req.body || {};
    await db.ejecutar(
      'UPDATE timbrados SET numero = ?, establecimiento = ?, punto_expedicion = ?, desde = ?, hasta = ?, vigencia_desde = ?, vigencia_hasta = ?, activo = ? WHERE id = ?',
      [
        b.numero ?? actual.numero,
        b.establecimiento ?? actual.establecimiento,
        b.punto_expedicion ?? actual.punto_expedicion,
        Number(b.desde ?? actual.desde),
        Number(b.hasta ?? actual.hasta),
        b.vigencia_desde ?? actual.vigencia_desde,
        b.vigencia_hasta ?? actual.vigencia_hasta,
        (b.activo ?? actual.activo) ? 1 : 0,
        id,
      ]
    );
    await auditoria.registrar(req, 'timbrado_editar', 'timbrado', id, b);
    res.json({ ok: true });
  })
);

module.exports = router;
