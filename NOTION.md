# Sincronización de la Bitácora desde Notion

Tres sitios, cada uno con un papel:

```
Notion            →   vault de Obsidian        →   ideas.html   →   web
(aquí se escribe)     (aquí vive el markdown)      (generado)       (GitHub Pages)
```

- **Notion** — base **Bitácora** (`3bf5d0d5-f0a5-804f-ab41-c3189166bc14`). Es
  donde se redacta y donde se decide qué se publica.
- **El vault** — `Brain/brian/fuentes/Bitácora_web/`. Un `.md` por entrada, con
  frontmatter para Obsidian. Ahí se lee y se busca.
- **El repositorio** — **NO guarda los `.md`**. Sólo guarda `ideas.html`, que es
  lo que sirve GitHub Pages, más los scripts y la plantilla.

Ese reparto importa: la web no se alimenta del markdown, se alimenta de
`ideas.html`, que lleva las entradas incrustadas dentro.

## Los tres scripts

| Script | Qué hace | Toca la red |
|---|---|---|
| `scripts/sync-notion.mjs` | Notion → `.md` en el vault | sí (lee Notion) |
| `scripts/build-bitacora.mjs` | `.md` + plantilla → `ideas.html` | no |
| `scripts/marcar-publicadas.mjs` | marca *Publicada* en Notion tras el push | sí (escribe Notion) |

El del medio es el que hace que la web cambie. **Sincronizar sin construir no
publica nada**: el markdown quedaría al día y la página seguiría igual.

**El orden importa:** marcar en Notion va **después** del push. Si se marcara
antes y el push fallara, Notion diría "Publicada" y la web no tendría la
entrada.

## Qué se publica y qué no

Una entrada sale a la web si cumple **las dos** condiciones:

- `Medio` incluye **Web NewCo**
- `Estado` incluye **Lista para publicar** o **Publicada**

Y además, estas reglas sobre `Estado` (que es multi-select, admite varias):

| Etiqueta | Efecto en la web |
|---|---|
| **Lista para publicar** | Se publica en la próxima pasada, y pasa a *Publicada* |
| **Publicada** | Ya está en la web; se resincroniza por si cambió el texto |
| **Borrador** / sin etiqueta | No sale. Nunca |
| **Privada** | **Veto absoluto.** No sale, y si ya estaba publicada **se retira de la web**. En Notion la entrada no se toca: sigue ahí entera |
| **Archivada** | **No afecta a la web.** Sirve para limpiar la vista de Notion |

**Ojo con Archivada.** No despublica por sí misma, pero tampoco publica: para
que una entrada archivada siga en la web tiene que **conservar también
`Publicada`**. Si le quitas `Publicada` y le dejas sólo `Archivada`, deja de
cumplir el filtro y se cae de la página. El dry-run lo avisa por su nombre
antes de que ocurra.

Publicar es un acto deliberado: los borradores no salen nunca, por muy
terminados que estén. Lo que decide es el estado **Lista para publicar**.

Las entradas **sin contenido** se omiten con aviso.

## Puesta en marcha (una sola vez)

1. **Crear la integración en Notion**
   `notion.so/profile/integrations` → *New integration* → tipo **Internal**.
   Nombre: `newcocd-web`. Workspace: el tuyo.
   Capacidades: **Read content** y **Update content** (esta última la necesita
   `marcar-publicadas.mjs` para pasar las entradas a *Publicada*).
   Copia el *Internal Integration Secret* (empieza por `ntn_`).

2. **Dar acceso a la base**
   Abre la base **Bitácora** en Notion → menú `···` → *Connections* →
   *Add connections* → elige `newcocd-web`.
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
actualiza únicamente cuando tú la lanzas. Dos vías.

### 1. Desde tu Mac, con Claude (vía habitual)

Terminal → `claude` → *"publica la bitácora"*. La skill `publicar-bitacora`
encadena los cinco pasos, te enseña el dry-run antes de tocar nada y respeta el
orden (publicar y después marcar).

A mano, si prefieres verlo pasar:

```bash
cd "/Users/arm/Documents/Claude/Trabajos/Web NewCo/newco-web"

node scripts/sync-notion.mjs --dry-run # 1) ver qué entraría
node scripts/sync-notion.mjs           # 2) escribir el markdown en el vault
node scripts/build-bitacora.mjs        # 3) regenerar ideas.html

git add ideas.html
git commit -m "Bitacora: nuevas entradas"
git push                               # 4) publicar

node scripts/marcar-publicadas.mjs     # 5) marcar en Notion, ya publicado
```

Sólo esta vía escribe en el vault.

### 2. Desde GitHub, con un botón (respaldo)

Repositorio → pestaña **Actions** → *Publicar Bitácora desde Notion* →
**Run workflow**. Funciona igual desde la app de GitHub en el móvil, y desde
Claude en la web o en Cowork, que pueden leer Notion y decirte qué va a salir
pero no tienen acceso al repositorio para publicar.

El runner **no ve tu vault**: se genera los `.md` en una carpeta temporal suya
(`.bitacora-tmp/`, ignorada por git), construye `ideas.html` y sube sólo eso.
La copia del vault se pone al día sola la próxima vez que publiques desde el
Mac. Nada se rompe; sólo va con retraso.

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
- Los `.md` del vault — una entrada por fichero. Aquí está el **contenido**, y
  lo escribe el sincronizador.

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

## El frontmatter

Cada `.md` lleva una cabecera con dos partes. Los siete primeros campos los usa
el generador de la web; los cuatro últimos son sólo para Obsidian y no le
afectan en nada.

```yaml
---
titulo: "Grupo Coberio"
fecha: "2026-05-07"
slug: "grupo-coberio"
categoria: "NewCo"
estado: "Publicada"
fuente: "https://…"          # sólo si la entrada tiene Fuente en Notion
notionId: "3bf5d0d5-…"
tags: [bitacora, bitacora/newco]
aliases: ["Grupo Coberio"]
notion: "https://www.notion.so/3bf5d0d5…"
web: "https://akirokima.github.io/newcocd-web/ideas.html#grupo-coberio"
---
```

`notion` y `web` son los enlaces de ida y vuelta: a Notion, donde se edita; a
la web, donde se lee. Todos los valores van en **una sola línea**: el lector de
frontmatter del generador no entiende listas YAML multilínea.

## Rutas y variables

La carpeta del vault está fijada por defecto en los dos scripts:

```
…/Obsidian_ARM/Brain/brian/fuentes/Bitácora_web
```

Si el vault se mueve, hay dos formas de arreglarlo: cambiar esa constante en
`sync-notion.mjs` y `build-bitacora.mjs`, o definir `BITACORA_DIR` con la ruta
nueva. `sync-notion.mjs` **se niega a crear la carpeta** si su carpeta madre no
existe, para no dejar las entradas en un limbo por una ruta mal puesta.

Otras variables: `NOTION_DB_ID`, `NOTION_MEDIO`, `NOTION_ESTADOS`, `OUT_DIR`
(sincronizador); `CONTENT_DIR`, `TEMPLATE`, `OUT_FILE` (build).

## Notas

- El **ID de la base no cambia** aunque la renombres en Notion. El script usa
  el ID, nunca el nombre.
- Los nombres de `Estado` y `Medio` se resuelven contra el esquema real de la
  base **sin distinguir mayúsculas ni acentos**. Si renombras una opción en
  Notion, el script lo avisa por consola en lugar de fallar.
- `Estado` es multi-select y un PATCH lo sustituye entero, así que
  `marcar-publicadas.mjs` **lee el estado actual antes de escribir**: quita
  *Lista para publicar*, pone *Publicada* y **conserva el resto** (*Archivada*,
  por ejemplo).
- La carpeta `Bitácora_web` está dentro de `fuentes/`, que el `CLAUDE.md` del
  vault declara intocable (§11) y que Obsidian tiene excluida del índice de
  búsqueda. Es una excepción deliberada: la escriben estos scripts, nadie más.
  Si quieres que las entradas salgan en las búsquedas del vault, hay que
  quitar esa carpeta de *Settings → Files & Links → Excluded files*.
- Si algún día se usan **imágenes**, hay que descargarlas al repositorio en el
  paso de sincronización: las URLs de archivos subidos a Notion caducan a las
  pocas horas.
- Cuando el sitio migre a Astro, `build-bitacora.mjs` y la plantilla
  desaparecen: Astro haría ese trabajo. El sincronizador y el marcador siguen
  igual.
