# Despliegue del Repositorio Normativo (Cloudflare, privado)

Arquitectura: el sitio (`public/`) se publica en **Cloudflare Pages**; los PDFs
viven en un bucket de **Cloudflare R2** (sin límite de 100 MB) y los sirve
`public/_worker.js` bajo la ruta `/docs/...` del mismo dominio. Todo el sitio
se protege con **Cloudflare Access**: quien entra debe validar su correo con un
código de un solo uso. Nada es público.

Para que el visor pueda buscar palabras, el texto de cada PDF se extrae de
antemano con `npm run indexar` y queda en `public/indice/`, que se publica junto
con el sitio. Sin ese paso el documento se ve y se navega igual, pero el cuadro
de búsqueda aparece deshabilitado.

Costo: **$0** dentro de los límites gratuitos (R2: 10 GB; Access: 50 usuarios).
R2 pide registrar una tarjeta al activarse, pero no cobra dentro del límite.

## 1. Cuenta y herramientas (una sola vez)

1. Crea la cuenta en https://dash.cloudflare.com/sign-up
2. En el panel, entra a **R2 Object Storage** y actívalo (pide tarjeta; plan gratuito).
3. Inicia sesión desde la terminal (abre el navegador):

   ```
   npx wrangler login
   ```

## 2. Crear el bucket y subir los PDFs

Desde la raíz de este proyecto:

```
npx wrangler r2 bucket create documentos

npx wrangler r2 object put "documentos/AREMA-2024-Portfolio-of-Trackwork-and-Plans-Full-Book.pdf" --file "docs/AREMA 2024 Portfolio of Trackwork and Plans Full Book.pdf" --content-type application/pdf --remote

npx wrangler r2 object put "documentos/AREMA-MRE-2025-Full-Book.pdf" --file "docs/AREMA MRE 2025 Full Book.pdf" --content-type application/pdf --remote
```

Las llaves van en la RAÍZ del bucket y deben coincidir EXACTAMENTE con el campo
`file` del mapa `DOCS` de `public/visor.html`; si subes con otro nombre, actualiza ese mapa.

## 3. Generar el índice de búsqueda

```
npm run indexar
```

Lee los PDFs de `docs/`, extrae el texto de cada página y lo deja en
`public/indice/<archivo sin .pdf>/`, en lotes de 100 páginas. Tarda unos minutos
la primera vez (el MRE son 6,135 páginas ≈ 16 MB de texto) y luego omite lo que
ya esté indexado; `npm run indexar -- --forzar` reconstruye todo y
`npm run indexar MRE` limita el trabajo a los archivos que coincidan.

El índice no se versiona en git: vive solo en tu máquina y viaja al desplegar,
porque `wrangler pages deploy` sube la carpeta `public/` completa. Si clonas el
repositorio en otra computadora, vuelve a correr este comando antes de publicar.

## 4. Publicar el sitio

```
npx wrangler pages deploy
```

La primera vez pregunta si crear el proyecto: acepta, nombre `repositorio-documental`,
rama de producción `main`. Al terminar imprime la URL, tipo:
`https://repositorio-documental.pages.dev`

El binding del bucket queda configurado automáticamente desde `wrangler.toml`.

## 5. Hacerlo privado (Cloudflare Access)

1. En el panel: **Zero Trust** (pide elegir un nombre de equipo y el plan **Free**).
2. **Access → Applications → Add an application → Self-hosted**.
3. En *Application domain* agrega DOS entradas:
   - `repositorio-documental.pages.dev`
   - `*.repositorio-documental.pages.dev`  (cubre las URLs de vista previa)
4. Crea la política de acceso: acción **Allow**, regla **Emails** con la lista de
   correos autorizados (o **Emails ending in** `@tudominio.com` si todos comparten dominio).
5. Método de identidad: deja **One-time PIN** (el visitante recibe un código a su correo).

Listo: al abrir la URL, Cloudflare pide el correo, envía el código y solo entonces
muestra el sitio y los documentos.

## 6. Después de verificar

- Prueba abrir ambos documentos desde la URL publicada.
- Busca una palabra en cada uno y comprueba que salta a la página correcta.
- Elimina los archivos de Google Drive y revoca sus enlaces compartidos.

## Agregar un documento nuevo

1. Copia el PDF a `docs/` (queda solo local; git lo ignora). Conviene nombrarlo
   igual que la llave que tendrá en R2, sin espacios.
2. Súbelo a R2:
   ```
   npx wrangler r2 object put "documentos/Nombre-Del-Archivo.pdf" --file "docs/Nombre-Del-Archivo.pdf" --content-type application/pdf --remote
   ```
3. Añade la entrada en el mapa `DOCS` de `public/visor.html`.
4. Duplica una tarjeta en `public/index.html` (Vista A y Vista B) apuntando a
   `visor.html?doc=el-id-nuevo`.
5. Genera su índice de búsqueda: `npm run indexar`
   (solo procesa lo que aún no esté indexado).
6. Vuelve a publicar: `npx wrangler pages deploy`

## Qué ofrece el visor

- **Búsqueda en todo el documento** (botón de lupa o `Ctrl+F`): no distingue
  mayúsculas ni acentos y admite frases. Cada resultado muestra la página y el
  texto alrededor; al hacer clic salta ahí y resalta la coincidencia.
- **Índice**: los marcadores que trae el propio PDF, para navegar por capítulos.
- **Hipervínculos**: los enlaces del PDF funcionan — los internos (tablas de
  contenido, referencias cruzadas) saltan a su página y los externos abren en
  otra pestaña. Se insinúan con un subrayado tenue y se encienden al pasar el
  cursor encima.
- **Texto seleccionable**: se puede copiar el texto de la página.
- Atajos: flechas o `AvPág`/`RePág` para cambiar de página, `+` y `-` para el
  zoom. La URL siempre refleja la página actual, así que se puede compartir un
  enlace exacto (por ejemplo `visor.html?doc=doc-02&page=144`), incluso con una
  búsqueda ya hecha si se añade `&q=palabra`.

## Probar en local (opcional)

```
npx wrangler r2 object put "documentos/AREMA-2024-Portfolio-of-Trackwork-and-Plans-Full-Book.pdf" --file "docs/AREMA-2024-Portfolio-of-Trackwork-and-Plans-Full-Book.pdf" --content-type application/pdf --local
npm run dev
```

Abre http://localhost:8788 — usa una copia local del bucket (carpeta `.wrangler/`),
sin tocar la nube. Access no aplica en local. (El `--r2 DOCS=documentos` que trae
el script es necesario porque `pages dev` no siempre toma el binding del
wrangler.toml.) El índice de búsqueda se sirve desde `public/indice/`, así que
funciona igual en local sin subir nada.

> Si al desplegar el visor diera "No se pudo cargar el documento", revisa que el
> binding exista en el panel: proyecto de Pages → **Settings → Bindings →
> R2 bucket**, variable `DOCS` → bucket `documentos`, y vuelve a desplegar.
