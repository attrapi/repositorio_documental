# Despliegue del Repositorio Normativo (Cloudflare, privado)

Arquitectura: el sitio (`public/`) se publica en **Cloudflare Pages**; los PDFs
viven en un bucket de **Cloudflare R2** (sin límite de 100 MB) y los sirve
`public/_worker.js` bajo la ruta `/docs/...` del mismo dominio. Todo el sitio
se protege con **Cloudflare Access**: quien entra debe validar su correo con un
código de un solo uso. Nada es público.

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
npx wrangler r2 bucket create repositorio-docs

npx wrangler r2 object put "repositorio-docs/arema-2024-portfolio.pdf" --file "docs/AREMA 2024 Portfolio of Trackwork and Plans Full Book.pdf" --content-type application/pdf --remote

npx wrangler r2 object put "repositorio-docs/arema-mre-2025.pdf" --file "docs/AREMA MRE 2025 Full Book.pdf" --content-type application/pdf --remote
```

Los nombres `arema-2024-portfolio.pdf` y `arema-mre-2025.pdf` son los que espera
el mapa `DOCS` de `public/visor.html`; si subes con otro nombre, actualiza ese mapa.

## 3. Publicar el sitio

```
npx wrangler pages deploy
```

La primera vez pregunta si crear el proyecto: acepta, nombre `repositorio-documental`,
rama de producción `main`. Al terminar imprime la URL, tipo:
`https://repositorio-documental.pages.dev`

El binding del bucket queda configurado automáticamente desde `wrangler.toml`.

## 4. Hacerlo privado (Cloudflare Access)

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

## 5. Después de verificar

- Prueba abrir ambos documentos desde la URL publicada.
- Elimina los archivos de Google Drive y revoca sus enlaces compartidos.

## Agregar un documento nuevo

1. Copia el PDF a `docs/` (queda solo local; git lo ignora).
2. Súbelo a R2:
   ```
   npx wrangler r2 object put "repositorio-docs/nombre-corto.pdf" --file "docs/Nombre Original.pdf" --content-type application/pdf --remote
   ```
3. Añade la entrada en el mapa `DOCS` de `public/visor.html`.
4. Duplica una tarjeta en `public/index.html` (Vista A y Vista B) apuntando a
   `visor.html?doc=el-id-nuevo`.
5. Vuelve a publicar: `npx wrangler pages deploy`

## Probar en local (opcional)

```
npx wrangler r2 object put "repositorio-docs/arema-2024-portfolio.pdf" --file "docs/AREMA 2024 Portfolio of Trackwork and Plans Full Book.pdf" --content-type application/pdf --local
npx wrangler pages dev --r2 DOCS=repositorio-docs
```

Abre http://localhost:8788 — usa una copia local del bucket (carpeta `.wrangler/`),
sin tocar la nube. Access no aplica en local. (El `--r2 DOCS=repositorio-docs` es
necesario porque `pages dev` no siempre toma el binding del wrangler.toml.)

> Si al desplegar el visor diera "No se pudo cargar el documento", revisa que el
> binding exista en el panel: proyecto de Pages → **Settings → Bindings →
> R2 bucket**, variable `DOCS` → bucket `repositorio-docs`, y vuelve a desplegar.
