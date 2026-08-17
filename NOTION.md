# Sincronización de la Bitácora desde Notion

El contenido de la Bitácora se escribe en Notion, en la base **Bitácora**
(`3bf5d0d5-f0a5-804f-ab41-c3189166bc14`). Un script lo copia a este
repositorio como markdown en `src/content/bitacora/`, y un segundo script
regenera `ideas.html` a partir de ese markdown.

**El repositorio es la fuente de verdad del build.** La construcción del sitio
no llama a Notion: si su API falla o cambia el esquema, la web sigue
compilando con el último contenido sincronizado.

## Los tres scripts

| Script | Qué hace | Toca la red |
|---|---|---|
| `scripts/sync-notion.mjs` | Notion → `src/content/bitacora/*.md` | sí (lee Notion) |
| `scripts/build-bitacora.mjs` | markdown + plantilla → `ideas.html` | no |
| `scripts/marcar-publicadas.mjs` | marca *Publicada* en Notion tras el push | sí (escribe Notion) |

El del medio es el que hace que la web cambie. **Sincronizar sin construir no
publica nada**: el markdown estaría al día y la página seguiría mostrando lo
anterior.

**El orden importa:** marcar en Notion va **después** del push. Si se marcara
antes y el push fallara, Notion diría "Publicada" y la web no tendría la
entrada.

## Puesta en marcha (una sola vez)

1. **Crear la integración en Notion**
   `notion.so/profile/integrations` → *New integration* → tipo **Internal**.
   Nombre: `newcocd-web`. Workspace: el tuyo.
   Capacidades: **Read content** y **Update content** (esta última la necesita
   `marcar-publicadas.mjs` para pasar las entradas a *Publicada*).
   Copia el *Internal Integration Secret* (empieza por `ntn_`).

2. **Dar acceso a la base**
   Abre la base **Bitácora** en Notion → menú `···` (arriba a la derecha) →
   *Connections* → *Add connections* → elige `newcocd-web`.
   Sin este paso la integración no ve nada, aunque el token sea correcto.

3. **Dejar el token donde haga falta**, según cómo vayas a publicar:

   - **Para la vía Terminal** (la habitual): en `~/.zshrc`, línea
     `export NOTION_TOKEN=ntn_xxxxx`. Abre una Terminal nueva después.
   - **Para la vía GitHub**: repositorio → *Settings* → *Secrets and variables*
     → *Actions* → *New repository secret*. Nombre: `NOTION_TOKEN`.

   Puedes hacer las dos: son independientes y no estorban entre sí.

4. **Probar**
   Pestaña *Actions* → *Publicar Bitácora desde Notion* → *Run workflow*,
   con **simulación** marcada.

## Cómo se publica

**No hay publicación automática.** No hay cron ni webhooks: la Bitácora se
actualiza únicamente cuando tú la lanzas. Dos vías, y hacen exactamente lo
mismo.

### 1. Desde tu Mac, con Claude (vía habitual)

Terminal → `claude` → *"publica la bitácora"*. La skill `publicar-bitacora`
encadena los cinco pasos, te enseña el dry-run antes de tocar nada y respeta el
orden (publicar y después marcar).

A mano, si prefieres verlo pasar:

```bash
cd "/Users/arm/Documents/Claude/Trabajos/Web NewCo/newco-web"

node scripts/sync-notion.mjs --dry-run # 1) ver qué entraría
node scripts/sync-notion.mjs           # 2) escribir el markdown
node scripts/build-bitacora.mjs        # 3) regenerar ideas.html

git add src/content/bitacora ideas.html
git commit -m "Bitacora: nuevas entradas"
git push                               # 4) publicar

node scripts/marcar-publicadas.mjs     # 5) marcar en Notion, ya publicado
```

### 2. Desde GitHub, con un botón (sin depender de ningún ordenador)

Repositorio → pestaña **Actions** → *Publicar Bitácora desde Notion* →
**Run workflow**. Funciona igual desde la app de GitHub en el móvil, y desde
Claude en la web o en Cowork, que pueden leer Notion y decirte qué va a salir
pero no tienen acceso al repositorio para publicar.

Antes de publicar de verdad puedes marcar **simulación**: ejecuta el proceso y
te enseña en el registro qué entradas entrarían, sin tocar nada.

El workflow vive en `.github/workflows/publicar-bitacora.yml`. Si no aparece en
la pestaña *Actions*, es que el fichero no está ahí.

`.bitacora-sync.json` es un fichero de trabajo local (lleva los identificadores
de las entradas pendientes de marcar). **No se sube al repositorio**: está en
`.gitignore`.

## Cómo se genera la web

`ideas.html` **no se edita a mano**: lo genera `scripts/build-bitacora.mjs` a
partir de dos cosas.

- `scripts/bitacora.template.html` — la página completa (tipografía, logo, CSS
  y JS del acordeón) con el marcador `<!--ENTRADAS-->` donde van los artículos.
  Aquí se toca el **diseño**.
- `src/content/bitacora/*.md` — una entrada por fichero, con frontmatter
  `titulo`, `fecha`, `slug`, `categoria`, `estado`, `fuente` y `notionId`.
  Aquí está el **contenido**, y lo escribe el sincronizador.

El script ordena por fecha descendente, convierte el markdown (encabezados,
listas, citas, negrita, cursiva, enlaces, código) y pinta el punto de color
según la categoría: NewCo verde, TaskOol azul, Technetium morado, Personal
hueso.

```bash
node scripts/build-bitacora.mjs           # regenera ideas.html
node scripts/build-bitacora.mjs --check   # no escribe; sale con 1 si está desfasado
```

Es determinista: con el mismo markdown produce siempre el mismo HTML, así que
un `git diff` limpio significa que no había nada nuevo.

**Limitación conocida:** las listas anidadas se aplanan a un solo nivel. Si
algún día hace falta anidar de verdad, hay que tocar `md2html()`.

## Qué se publica

Se sincroniza toda entrada que cumpla **las dos** condiciones:

- `Medio` incluye **Web NewCo**
- `Estado` incluye alguno de los configurados en `NOTION_ESTADOS` (por defecto,
  `Lista para publicar` y `Publicada`)

Publicar es un acto deliberado: los borradores no salen nunca, por muy
terminados que estén. Lo que decide es el estado **Lista para publicar**.

Las entradas **sin contenido** se omiten, y las que dejan de cumplir el filtro
se retiran del repositorio en la siguiente sincronización.

## Ejecutar en local

```bash
NOTION_TOKEN=ntn_xxx node scripts/sync-notion.mjs --dry-run   # simulación
NOTION_TOKEN=ntn_xxx node scripts/sync-notion.mjs             # escribe ficheros
node scripts/build-bitacora.mjs                               # regenera la página
```

Variables opcionales: `NOTION_DB_ID`, `NOTION_MEDIO`, `NOTION_ESTADOS`,
`OUT_DIR` (sincronizador); `CONTENT_DIR`, `TEMPLATE`, `OUT_FILE` (build).

## Notas

- El **ID de la base no cambia** aunque la renombres en Notion. El script usa
  el ID, nunca el nombre.
- Los nombres de `Estado` y `Medio` se resuelven contra el esquema real de la
  base **sin distinguir mayúsculas ni acentos**. Si renombras una opción en
  Notion, el script lo avisa por consola en lugar de fallar.
- Si algún día se usan **imágenes**, hay que descargarlas al repositorio en el
  paso de sincronización: las URLs de archivos subidos a Notion caducan a las
  pocas horas.
- Cuando el sitio migre a Astro, `build-bitacora.mjs` y la plantilla
  desaparecen: Astro haría ese trabajo. El sincronizador y el marcador siguen
  igual.
