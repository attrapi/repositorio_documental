// ============================================================
// Generador del índice de búsqueda
// ------------------------------------------------------------
// Lee cada PDF de docs/ y extrae el texto de todas sus páginas.
// El resultado se guarda en public/indice/<slug>/ repartido en
// lotes de 100 páginas, para que el visor descargue solo lo que
// va necesitando y muestre resultados mientras sigue buscando.
//
//   node tools/indexar.mjs              → indexa lo que falte
//   node tools/indexar.mjs --forzar     → reconstruye todo
//   node tools/indexar.mjs MRE          → solo los que coincidan
//
// El índice NO se versiona en git: se genera aquí y viaja al
// desplegar, porque `wrangler pages deploy` sube la carpeta public/.
// ============================================================

import * as pdfjsLib from '../public/vendor/pdfjs/pdf.min.mjs';
import { readdir, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { open } from 'node:fs/promises';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = join(raiz, 'docs');
const SALIDA = join(raiz, 'public', 'indice');
const POR_LOTE = 100;

pdfjsLib.GlobalWorkerOptions.workerSrc =
  new URL('../public/vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const args = process.argv.slice(2);
const forzar = args.includes('--forzar');
const filtros = args.filter((a) => !a.startsWith('--'));

// El slug es el nombre del archivo sin extensión: es la misma llave
// que usa el visor (campo `file` del mapa DOCS) para pedir su índice.
const slugDe = (archivo) => basename(archivo, '.pdf');

function limpiar(texto) {
  // Espacios uniformes: el visor calcula posiciones sobre esta cadena.
  return texto.replace(/\s+/g, ' ').trim();
}

async function textoDePagina(pdf, n) {
  const page = await pdf.getPage(n);
  const { items } = await page.getTextContent();
  let out = '';
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    out += it.str;
    if (it.hasEOL) out += ' ';
  }
  page.cleanup();
  return limpiar(out);
}

async function indexar(archivo) {
  const slug = slugDe(archivo);
  const destino = join(SALIDA, slug);
  const manifiesto = join(destino, 'manifiesto.json');

  if (!forzar && existsSync(manifiesto)) {
    const m = JSON.parse(await readFile(manifiesto, 'utf8'));
    if (m.completo) {
      console.log(`  ${slug}: ya indexado (${m.paginas} páginas) — omitido`);
      return;
    }
  }

  const ruta = join(DOCS_DIR, archivo);
  const fh = await open(ruta, 'r');
  const { size } = await fh.stat();
  await fh.close();

  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(await readFile(ruta)),
    isEvalSupported: false,
  }).promise;

  const total = pdf.numPages;
  const lotes = Math.ceil(total / POR_LOTE);
  console.log(`  ${slug}: ${total} páginas (${(size / 1048576).toFixed(0)} MB) → ${lotes} lotes`);

  await rm(destino, { recursive: true, force: true });
  await mkdir(destino, { recursive: true });

  let vacias = 0;
  let bytes = 0;
  for (let lote = 0; lote < lotes; lote++) {
    const desde = lote * POR_LOTE + 1;
    const hasta = Math.min(desde + POR_LOTE - 1, total);
    const paginas = [];
    for (let n = desde; n <= hasta; n++) {
      const t = await textoDePagina(pdf, n);
      if (!t) vacias++;
      paginas.push(t);
    }
    const cuerpo = JSON.stringify({ desde, paginas });
    bytes += Buffer.byteLength(cuerpo);
    await writeFile(join(destino, `${String(lote).padStart(3, '0')}.json`), cuerpo);
    process.stdout.write(`\r    lote ${lote + 1}/${lotes}  (hasta la página ${hasta})   `);
  }
  process.stdout.write('\n');

  await writeFile(
    manifiesto,
    JSON.stringify({
      archivo,
      paginas: total,
      porLote: POR_LOTE,
      lotes,
      completo: true,
      generado: new Date().toISOString(),
    }),
  );

  const aviso = vacias === total
    ? '  ⚠ Ninguna página tiene texto: el PDF parece escaneado (haría falta OCR).'
    : vacias > total * 0.3
      ? `  ⚠ ${vacias} de ${total} páginas no tienen texto extraíble.`
      : '';
  console.log(`    listo — ${(bytes / 1048576).toFixed(1)} MB de texto${vacias ? `, ${vacias} páginas sin texto` : ''}`);
  if (aviso) console.log(aviso);
  await pdf.destroy();
}

const archivos = (await readdir(DOCS_DIR))
  .filter((f) => f.toLowerCase().endsWith('.pdf'))
  .filter((f) => !filtros.length || filtros.some((q) => f.toLowerCase().includes(q.toLowerCase())));

if (!archivos.length) {
  console.error('No se encontró ningún PDF en docs/' + (filtros.length ? ` que coincida con: ${filtros.join(', ')}` : ''));
  process.exit(1);
}

console.log(`Indexando ${archivos.length} documento(s) de docs/`);
for (const a of archivos) await indexar(a);
console.log('\nÍndice en public/indice/ — se publica con `npx wrangler pages deploy`.');
