// Worker de Cloudflare Pages (modo avanzado).
// Sirve /docs/<archivo> leyendo del bucket R2 (binding DOCS) con soporte
// de peticiones por rango, para que el visor cargue páginas sin descargar
// el PDF completo. Cualquier otra ruta se sirve como archivo estático.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/docs/')) {
      const key = decodeURIComponent(url.pathname.slice('/docs/'.length));
      return serveDoc(request, env, key);
    }
    return env.ASSETS.fetch(request);
  },
};

async function serveDoc(request, env, key) {
  if (!key) return new Response('Documento no especificado', { status: 400 });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Método no permitido', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  if (request.method === 'HEAD') {
    const head = await env.DOCS.head(key);
    if (!head) return new Response('Documento no encontrado', { status: 404 });
    const headers = baseHeaders(head, key);
    headers.set('Content-Length', String(head.size));
    return new Response(null, { status: 200, headers });
  }

  const wantsRange = request.headers.has('range');
  let object;
  try {
    object = await env.DOCS.get(key, wantsRange ? { range: request.headers } : undefined);
  } catch (e) {
    // R2 lanza error cuando el rango pedido no es satisfacible
    const head = await env.DOCS.head(key);
    if (!head) return new Response('Documento no encontrado', { status: 404 });
    return new Response('Rango no satisfacible', {
      status: 416,
      headers: { 'Content-Range': `bytes */${head.size}` },
    });
  }
  if (!object) return new Response('Documento no encontrado', { status: 404 });

  const headers = baseHeaders(object, key);

  if (wantsRange && object.range) {
    const [start, end] = rangeBounds(object.range, object.size);
    headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { status: 200, headers });
}

function baseHeaders(object, key) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.get('Content-Type')) headers.set('Content-Type', 'application/pdf');
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Disposition', `inline; filename="${key.split('/').pop()}"`);
  headers.set('Cache-Control', 'private, max-age=3600');
  return headers;
}

function rangeBounds(range, size) {
  if (range.suffix !== undefined) {
    const len = Math.min(range.suffix, size);
    return [size - len, size - 1];
  }
  const start = range.offset ?? 0;
  const length = range.length ?? size - start;
  return [start, Math.min(start + length, size) - 1];
}
