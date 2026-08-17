# Sincronización de la Bitácora desde Notion

El contenido de la Bitácora se escribe en Notion, en la base **Bitácora**
(`3bf5d0d5-f0a5-804f-ab41-c3189166bc14`). Un workflow lo copia a este
repositorio como markdown en `src/content/bitacora/`.

**El repositorio es la fuente de verdad del build.** La construcción del sitio
no llama a Notion: si su API falla o cambia el esquema, la web sigue
compilando con el último contenido sincronizado.

## Puesta en marcha (una sola vez)

1. **Crear la integración en Notion**
   `notion.so/profile/integrations` → *New integration* → tipo **Internal**.
   Nombre: `newcocd-web`. Workspace: el tuyo.
   Capacidades: solo **Read content** (no necesita insertar ni actualizar).
   Copia el *Internal Integration Secret* (empieza por `ntn_`).

2. **Dar acceso a la base**
   Abre la base **Bitácora** en Notion → menú `···` (arriba a la derecha) →
   *Connections* / *Conexiones* → *Add connections* → elige `newcocd-web`.
   Sin este paso la integración no ve nada, aunque el token sea correcto.

3. **Guardar el token en GitHub**
   Repositorio → *Settings* → *Secrets and variables* → *Actions* →
   *New repository secret*. Nombre: `NOTION_TOKEN`. Valor: el secreto del paso 1.

4. **Probar**
   Pestaña *Actions* → *Sincronizar Bitácora desde Notion* → *Run workflow*.

## Cómo se publica

**No hay publicación automática.** La Bitácora se actualiza únicamente cuando
tú lo lanzas. Tres formas, elige la que te venga:

### 1. Desde GitHub, con un botón (lo más cómodo)

Repositorio → pestaña **Actions** → *Publicar Bitácora desde Notion* →
**Run workflow**. Funciona igual desde la app de GitHub en el móvil.

Antes de publicar de verdad puedes marcar **simulación**: ejecuta el proceso
y te enseña en el registro qué entradas entrarían, sin tocar nada.

### 2. Desde Terminal, en tu Mac

```bash
cd "/Users/arm/Documents/Claude/Trabajos/Web NewCo/newco-web"
export NOTION_TOKEN=ntn_xxxxx          # el token de la integración

node scripts/sync-notion.mjs --dry-run # 1) ver qué entraría
node scripts/sync-notion.mjs           # 2) escribir el markdown

rm -f .git/*.lock
git add src/content/bitacora
git commit -m "Bitacora: nuevas entradas"
git push                               # 3) publicar

node scripts/marcar-publicadas.mjs     # 4) marcar en Notion, ya publicado
```

Para no repetir el `export` cada vez, guarda el token en tu perfil
(`~/.zshrc`): `export NOTION_TOKEN=ntn_xxxxx`.

**El orden importa:** marcar en Notion va **después** del push. Si se marcara
antes y el push fallara, Notion diría "Publicada" y la web no tendría la
entrada.

`.bitacora-sync.json` es un fichero de trabajo local (lleva los identificadores
de las entradas pendientes de marcar). **No se sube al repositorio**: está en
`.gitignore`.

### 3. Con una skill de Claude

Una skill puede encadenar los tres pasos anteriores y, además, avisarte de qué
entradas nuevas ha detectado antes de publicar.

## Qué se publica

Se sincroniza toda entrada que cumpla **las dos** condiciones:

- `Medio` incluye **Web NewCo**
- `Estado` incluye alguno de los configurados en `NOTION_ESTADOS` (por defecto, `Lista para publicar` y `Publicada`)

Hoy el valor por defecto incluye `Borrador` para no perder las entradas
existentes. **Cuando exista la skill de publicación, cámbialo a `Publicada`**
(en el workflow) para que publicar sea un acto deliberado y no un efecto
secundario de escribir.

Las entradas **sin contenido** se omiten, y las que dejan de cumplir el filtro
se retiran del repositorio en la siguiente sincronización.

## Ejecutar en local

```bash
NOTION_TOKEN=ntn_xxx node scripts/sync-notion.mjs --dry-run   # simulación
NOTION_TOKEN=ntn_xxx node scripts/sync-notion.mjs             # escribe ficheros
```

Variables opcionales: `NOTION_DB_ID`, `NOTION_MEDIO`, `NOTION_ESTADOS`, `OUT_DIR`.

## Notas

- El **ID de la base no cambia** aunque la renombres en Notion. El script usa
  el ID, nunca el nombre.
- Los nombres de `Estado` y `Medio` se resuelven contra el esquema real de la
  base **sin distinguir mayúsculas ni acentos**. Si renombras una opción en
  Notion, el script lo avisa por consola en lugar de fallar.
- Si algún día se usan **imágenes**, hay que descargarlas al repositorio en este
  paso: las URLs de archivos subidos a Notion caducan a las pocas horas.
