require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { requiereSesion, requiereMenu } = require('./middleware/auth');
const { ErrorApp } = require('./lib/errors');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// En produccion se sirve detras de HTTPS: se redirige y se pide HSTS.
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (!req.secure) return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
}
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ type: 'text/csv', limit: '5mb' }));
app.use(cookieParser());

// Anti-CSRF: la sesion viaja en cookie, asi que toda mutacion que llegue desde
// otro sitio se rechaza. Los clientes que no son navegadores no mandan Origin.
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
app.use('/api', (req, res, next) => {
  if (METODOS_SEGUROS.has(req.method)) return next();
  const origen = req.headers.origin || req.headers.referer;
  if (!origen) return next();
  let host;
  try { host = new URL(origen).host; } catch { return res.status(403).json({ error: 'Origen invalido' }); }
  if (host !== req.headers.host) return res.status(403).json({ error: 'Origen no permitido' });
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/tienda', require('./routes/tienda'));

// Todo lo demas exige sesion.
app.use('/api', requiereSesion, requiereMenu);
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/config', require('./routes/config'));
app.use('/api/catalogo', require('./routes/catalogo'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/ventas', require('./routes/ventas'));
app.use('/api/compras', require('./routes/compras'));
app.use('/api/caja', require('./routes/caja'));
app.use('/api/gastos', require('./routes/gastos'));
app.use('/api/presupuestos', require('./routes/presupuestos'));
app.use('/api/timbrados', require('./routes/timbrados'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/tablero', require('./routes/tablero'));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, _next) => {
  if (err instanceof ErrorApp) {
    return res.status(err.estado).json({ error: err.message, codigo: err.codigo });
  }
  console.error('[error]', req.method, req.originalUrl, err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = Number(process.env.PORT || 3000);
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => console.log(`Sistema de stock escuchando en http://localhost:${PORT}`));
}

module.exports = app;
