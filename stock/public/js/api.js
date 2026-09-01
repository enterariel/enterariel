// Cliente HTTP unico. El servidor manda el error en {error}; lo propagamos tal cual.
async function pedir(metodo, ruta, cuerpo) {
  const opciones = { method: metodo, headers: {}, credentials: 'same-origin' };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  const res = await fetch(`/api${ruta}`, opciones);
  if (res.status === 401 && !ruta.startsWith('/auth')) {
    document.dispatchEvent(new CustomEvent('sesion-caida'));
    throw new Error('Sesion vencida');
  }
  const texto = await res.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!res.ok) throw new Error((datos && datos.error) || `Error ${res.status}`);
  return datos;
}

export const api = {
  get: (ruta) => pedir('GET', ruta),
  post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo === undefined ? {} : cuerpo),
  put: (ruta, cuerpo) => pedir('PUT', ruta, cuerpo),
  del: (ruta) => pedir('DELETE', ruta),
  descargar(ruta, nombre) {
    const a = document.createElement('a');
    a.href = `/api${ruta}`;
    a.download = nombre || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};
