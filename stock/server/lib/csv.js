function escapar(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return /[",;\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function generar(columnas, filas) {
  const cabecera = columnas.map((c) => escapar(c.titulo || c.campo)).join(';');
  const cuerpo = filas.map((fila) =>
    columnas.map((c) => escapar(typeof c.valor === 'function' ? c.valor(fila) : fila[c.campo])).join(';')
  );
  return [cabecera, ...cuerpo].join('\n');
}

// Parser tolerante: acepta ';' o ',' como separador y campos entrecomillados.
function parsear(texto) {
  const lineas = String(texto).replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (!lineas.length) return [];
  const sep = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ';' : ',';

  const partirLinea = (linea) => {
    const campos = [];
    let actual = '';
    let comillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (comillas) {
        if (c === '"' && linea[i + 1] === '"') { actual += '"'; i++; }
        else if (c === '"') comillas = false;
        else actual += c;
      } else if (c === '"') comillas = true;
      else if (c === sep) { campos.push(actual); actual = ''; }
      else actual += c;
    }
    campos.push(actual);
    return campos.map((x) => x.trim());
  };

  const cabecera = partirLinea(lineas[0]).map((h) => h.toLowerCase());
  return lineas.slice(1).map((linea) => {
    const campos = partirLinea(linea);
    const obj = {};
    cabecera.forEach((h, i) => { obj[h] = campos[i] === undefined ? '' : campos[i]; });
    return obj;
  });
}

module.exports = { generar, parsear, escapar };
