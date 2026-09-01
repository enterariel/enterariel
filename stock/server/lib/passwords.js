const crypto = require('crypto');

const LARGO = 64;

function generarSal() {
  return crypto.randomBytes(16).toString('hex');
}

function hashear(password, sal) {
  return crypto.scryptSync(String(password), sal, LARGO).toString('hex');
}

function verificar(password, sal, hashGuardado) {
  const calculado = hashear(password, sal);
  const a = Buffer.from(calculado, 'hex');
  const b = Buffer.from(hashGuardado, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function tokenSesion() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { generarSal, hashear, verificar, tokenSesion };
