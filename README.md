# newcocd.com — prototipo

Prototipo del rediseño de la web de **NewCo Capital y Desarrollo, S.L.**
`index.html` es un único archivo autocontenido: tipografía Montserrat en woff2,
logos vectoriales y bilingüe ES/EN embebidos. Sin dependencias ni build.

`bitacora.html` es la **Bitácora**, y esa sí se genera. El contenido se escribe en
Notion, un script lo convierte en markdown dentro del vault de Obsidian, y otro
monta la página a partir de ese markdown. **Los `.md` no están en este
repositorio**: aquí sólo vive el `bitacora.html` ya generado, que es lo que sirve
GitHub Pages. Todo el detalle está en [`NOTION.md`](NOTION.md).

## Publicar la Bitácora

Dos vías, ambas manuales:

- **Desde el Mac** (habitual): Terminal → `claude` → *"publica la bitácora"*.
  Es la única que escribe en el vault.
- **Desde GitHub** (respaldo): pestaña *Actions* → *Publicar Bitácora desde
  Notion* → *Run workflow*. Funciona también desde el móvil.

Ver [`NOTION.md`](NOTION.md) para la puesta en marcha (integración de Notion,
token y secreto del repositorio) y para qué significa cada etiqueta de `Estado`.

## Publicar el sitio en GitHub Pages

Ya está configurado: `main` / carpeta `/ (root)`. Para actualizar el prototipo,
sustituir `index.html`, `git commit` y `git push` — Pages republica solo en uno
o dos minutos.

```
https://akirokima.github.io/newcocd-web/
```

## Notas

- `index.html` lleva `<meta name="robots" content="noindex, nofollow">`: el
  prototipo **no se indexa** en buscadores. Hay que quitarlo el día que esto
  pase a producción en newcocd.com.
- `.nojekyll` evita que GitHub Pages procese los archivos con Jekyll.

## Estado

Ver el briefing en la carpeta del proyecto. Pendiente: montaje en Astro y
despliegue en Contabo.
