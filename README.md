# newcocd.com — prototipo

Prototipo del rediseño de la web de **NewCo Capital y Desarrollo, S.L.**
Un único archivo autocontenido (`index.html`): tipografía Montserrat en woff2,
logos vectoriales y bilingüe ES/EN embebidos. Sin dependencias ni build.

## Publicar en GitHub Pages

Desde esta carpeta, con el repositorio ya creado y vacío en GitHub:

```bash
git init
git add -A
git commit -m "Prototipo v20 del rediseño de newcocd.com"
git branch -M main
git remote add origin https://github.com/<usuario>/<repo>.git
git push -u origin main
```

Después, en GitHub: **Settings → Pages → Build and deployment**
→ Source: *Deploy from a branch* → Branch: `main` / carpeta `/ (root)` → **Save**.

En uno o dos minutos la URL será:

```
https://<usuario>.github.io/<repo>/
```

Esa es la dirección que se abre en el móvil y se pasa a quien vaya a probarla.

## Notas

- `index.html` lleva `<meta name="robots" content="noindex, nofollow">`: el
  prototipo **no se indexa** en buscadores. Hay que quitarlo el día que esto
  pase a producción en newcocd.com.
- `.nojekyll` evita que GitHub Pages procese los archivos con Jekyll.
- Para actualizar el prototipo: sustituir `index.html`, `git commit` y `git push`.
  Pages republica solo.

## Estado

Ver el briefing en la carpeta del proyecto. Pendiente: página de Ideas,
montaje en Astro y despliegue en Contabo.
