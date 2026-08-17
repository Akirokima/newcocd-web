#!/usr/bin/env node
/**
 * Sincroniza la Bitácora de Notion -> markdown en el vault de Obsidian.
 *
 * Notion es donde se escribe; el vault es donde vive el markdown; el
 * repositorio sólo guarda el bitacora.html ya generado, que es lo que sirve la
 * web. Los .md NO están en el repositorio.
 *
 * No forma parte del build: primero escribe los ficheros, después
 * build-bitacora.mjs los convierte en página. Si la API de Notion falla, la
 * web sigue como estaba: no se regenera nada a medias.
 *
 * Uso:  NOTION_TOKEN=ntn_xxx node scripts/sync-notion.mjs
 *       NOTION_TOKEN=ntn_xxx node scripts/sync-notion.mjs --dry-run
 *
 * Variables: OUT_DIR o BITACORA_DIR para cambiar la carpeta de destino.
 */

import { writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const TOKEN   = process.env.NOTION_TOKEN;
// El ID de la base NO cambia aunque se renombre la base en Notion.
const DB_ID   = process.env.NOTION_DB_ID || '3bf5d0d5-f0a5-804f-ab41-c3189166bc14';
/* Dónde se escribe el markdown.
   El destino normal es la carpeta del vault de Obsidian: ahí es donde Andrés
   lee y busca las entradas. El repositorio NO guarda los .md; sólo guarda
   bitacora.html, que es lo que sirve la web.
   GitHub Actions no ve el vault, así que le pasa BITACORA_DIR apuntando a una
   carpeta temporal suya: genera, construye la página y la sube. La copia del
   vault se pone al día sola en la siguiente publicación desde el Mac. */
const OUT_DIR = process.env.OUT_DIR
  || process.env.BITACORA_DIR
  || '/Users/arm/Library/CloudStorage/GoogleDrive-akirokima@gmail.com/My Drive/Obsidian Folder/Obsidian_ARM/Brain/brian/fuentes/Bitácora_web';   // ← ajustar si el vault se mueve

const MEDIO   = process.env.NOTION_MEDIO || 'Web NewCo';
// Los nombres se comparan sin distinguir mayúsculas ni acentos contra las
// opciones reales de la base, así que no importa cómo estén escritos aquí.
const ESTADOS = (process.env.NOTION_ESTADOS || 'Lista para publicar,Publicada')
  .split(',').map(s => s.trim()).filter(Boolean);

/* "Privada" veta la publicación gane lo que gane: una entrada así no sale
   nunca, y si ya estaba publicada se retira de la web en esta misma pasada.
   En Notion no se toca nada: sigue ahí con su texto.
   "Archivada" es lo contrario: no significa nada para la web, sólo sirve para
   limpiar la vista de Notion, y por eso ni suma ni resta. Ojo con una cosa:
   como el filtro exige "Lista para publicar" o "Publicada", archivar una
   entrada QUITÁNDOLE "Publicada" sí la retiraría. El dry-run lo avisa. */
const VETO = 'Privada';
const NEUTRO = 'Archivada';
const DRY = process.argv.includes('--dry-run');

if (!TOKEN) { console.error('Falta NOTION_TOKEN'); process.exit(1); }

const API = 'https://api.notion.com/v1';
const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

async function notion(path, init = {}, intento = 1) {
  const res = await fetch(`${API}${path}`, { ...init, headers: HEADERS });
  if (res.status === 429 || res.status >= 500) {
    if (intento > 4) throw new Error(`Notion ${res.status} en ${path} tras 4 intentos`);
    const espera = Number(res.headers.get('retry-after') || 2) * 1000 * intento;
    console.warn(`  ↻ ${res.status}; reintento ${intento} en ${espera}ms`);
    await new Promise(r => setTimeout(r, espera));
    return notion(path, init, intento + 1);
  }
  if (!res.ok) throw new Error(`Notion ${res.status} en ${path}: ${await res.text()}`);
  return res.json();
}

/* ---------------------------- consulta ---------------------------- */

/* Los nombres de las opciones se resuelven contra el esquema REAL de la base:
   así el script no se rompe si en Notion se corrige una errata, una tilde o
   una mayúscula (la opción llegó a llamarse "LIsta para publicar"). */
const normaliza = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

async function opcionesDe(propiedad) {
  const db = await notion(`/databases/${DB_ID}`);
  const p = db.properties?.[propiedad];
  return p?.multi_select?.options?.map(o => o.name)
      ?? p?.select?.options?.map(o => o.name) ?? [];
}

function resolver(pedidos, disponibles, etiqueta) {
  const out = [];
  for (const q of pedidos) {
    const real = disponibles.find(o => normaliza(o) === normaliza(q));
    if (real) { if (real !== q) console.log(`  · "${q}" → "${real}" (nombre real en Notion)`); out.push(real); }
    else console.warn(`  ⚠ ${etiqueta}: no existe la opción "${q}". Disponibles: ${disponibles.join(', ')}`);
  }
  return out;
}

async function consultarEntradas() {
  const [opEstado, opMedio] = await Promise.all([opcionesDe('Estado'), opcionesDe('Medio')]);
  const estados = resolver(ESTADOS, opEstado, 'Estado');
  const medios  = resolver([MEDIO], opMedio, 'Medio');
  if (!estados.length) throw new Error('Ningún estado válido: revisa NOTION_ESTADOS.');
  if (!medios.length)  throw new Error(`El medio "${MEDIO}" no existe en la base.`);
  /* Las archivadas se traen aunque no sean publicables, sólo para poder avisar
     en el dry-run de que se van a caer de la web por haber perdido "Publicada".
     Sin esto desaparecerían en silencio. */
  const consultados = [...estados, ...resolver([NEUTRO], opEstado, 'Estado')];

  const filter = {
    and: [
      { property: 'Medio', multi_select: { contains: medios[0] } },
      { or: consultados.map(e => ({ property: 'Estado', multi_select: { contains: e } })) },
    ],
  };
  const sorts = [{ property: 'Fecha de publicación', direction: 'descending' }];
  const out = [];
  let cursor;
  do {
    const body = JSON.stringify({ filter, sorts, page_size: 100, start_cursor: cursor });
    const data = await notion(`/databases/${DB_ID}/query`, { method: 'POST', body });
    out.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function bloquesDe(id) {
  const out = [];
  let cursor;
  do {
    const q = cursor ? `?start_cursor=${cursor}&page_size=100` : '?page_size=100';
    const data = await notion(`/blocks/${id}/children${q}`);
    for (const b of data.results) {
      if (b.has_children && ['bulleted_list_item','numbered_list_item','quote','toggle'].includes(b.type)) {
        b.__hijos = await bloquesDe(b.id);
      }
      out.push(b);
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

/* ------------------------ Notion -> markdown ------------------------ */

function esc(t) { return t.replace(/([*_`])/g, '\\$1'); }

function rich(arr = []) {
  return arr.map(t => {
    let s = esc(t.plain_text ?? '');
    const a = t.annotations || {};
    if (a.code) s = '`' + (t.plain_text ?? '') + '`';
    if (a.bold) s = `**${s}**`;
    if (a.italic) s = `*${s}*`;
    if (t.href) s = `[${s}](${t.href})`;
    return s;
  }).join('');
}

function bloqueAMd(b, nivel = 0) {
  const t = b.type;
  const sangria = '  '.repeat(nivel);
  const hijos = (b.__hijos || []).map(h => bloqueAMd(h, nivel + 1)).filter(Boolean).join('\n');
  const conHijos = s => hijos ? `${s}\n${hijos}` : s;

  switch (t) {
    case 'paragraph':          { const s = rich(b.paragraph.rich_text); return s ? conHijos(sangria + s) : ''; }
    case 'heading_1':          return conHijos(`${sangria}## ${rich(b.heading_1.rich_text)}`);
    case 'heading_2':          return conHijos(`${sangria}## ${rich(b.heading_2.rich_text)}`);
    case 'heading_3':          return conHijos(`${sangria}### ${rich(b.heading_3.rich_text)}`);
    case 'bulleted_list_item': return conHijos(`${sangria}- ${rich(b.bulleted_list_item.rich_text)}`);
    case 'numbered_list_item': return conHijos(`${sangria}1. ${rich(b.numbered_list_item.rich_text)}`);
    case 'quote':              return conHijos(`${sangria}> ${rich(b.quote.rich_text)}`);
    case 'callout':            return conHijos(`${sangria}> ${rich(b.callout.rich_text)}`);
    case 'to_do':              return conHijos(`${sangria}- [${b.to_do.checked ? 'x' : ' '}] ${rich(b.to_do.rich_text)}`);
    case 'code':               return `${sangria}\`\`\`${b.code.language || ''}\n${rich(b.code.rich_text)}\n\`\`\``;
    case 'divider':            return `${sangria}---`;
    case 'image': {
      const url = b.image?.external?.url || b.image?.file?.url || '';
      const alt = rich(b.image?.caption || []);
      // Aviso: las URLs de imágenes subidas a Notion CADUCAN. Si algún día se
      // usan imágenes, hay que descargarlas al repositorio en este paso.
      return url ? `${sangria}![${alt}](${url})` : '';
    }
    default: return '';
  }
}

function aMarkdown(bloques) {
  const lineas = [];
  let listaPrevia = null;                       // 'ul' | 'ol' | null
  for (const b of bloques) {
    const md = bloqueAMd(b);
    if (!md) continue;
    const m = md.match(/^\s*([-*]|\d+\.)\s/);
    const lista = m ? (m[1] === '-' || m[1] === '*' ? 'ul' : 'ol') : null;
    // línea en blanco salvo entre elementos de la MISMA lista
    if (lineas.length && !(lista && lista === listaPrevia)) lineas.push('');
    lineas.push(md);
    listaPrevia = lista;
  }
  return lineas.join('\n').trim() + '\n';
}

/* ---------------------------- utilidades ---------------------------- */

const slugify = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);

const yaml = v => `"${String(v).replace(/"/g, '\\"')}"`;

function propTexto(p) {
  if (!p) return '';
  if (p.type === 'title')     return p.title.map(t => t.plain_text).join('');
  if (p.type === 'rich_text') return p.rich_text.map(t => t.plain_text).join('');
  if (p.type === 'url')       return p.url || '';
  if (p.type === 'date')      return p.date?.start || '';
  if (p.type === 'multi_select') return p.multi_select.map(o => o.name).join(', ');
  return '';
}

/* ------------------------------ main ------------------------------ */

const entradas = await consultarEntradas();
console.log(`Entradas en Notion con Medio="${MEDIO}" y Estado ∈ [${ESTADOS}]: ${entradas.length}`);

/* Red de seguridad contra una ruta mal puesta: si la carpeta madre no existe,
   mkdir crearía un árbol entero en un sitio equivocado y las entradas
   acabarían en un limbo silencioso. Mejor parar y decirlo. */
const MADRE = dirname(OUT_DIR);
if (!existsSync(MADRE)) {
  console.error(`No existe la carpeta ${MADRE}, así que no voy a crear ${OUT_DIR} a ciegas.`);
  console.error(`Comprueba la ruta del vault, o define BITACORA_DIR con la carpeta correcta.`);
  process.exit(1);
}
await mkdir(OUT_DIR, { recursive: true });
const escritos = new Set();
const nuevas = [];                       // pendientes de marcar en Notion tras el push
const HOY = new Date().toISOString().slice(0, 10);
let vacias = 0, privadas = 0, archivadas = 0;

for (const p of entradas) {
  const props  = p.properties;
  const titulo = propTexto(props['Título']).replace(/\*\*/g, '').trim();
  const cats   = props['Categorías']?.multi_select?.map(o => o.name) || [];
  const estado = props['Estado']?.multi_select?.map(o => o.name) || [];
  const fuente = propTexto(props['Fuente']);

  if (!titulo) { console.warn('  · entrada sin título, omitida'); continue; }

  // "Privada" gana a todo lo demás: la entrada no se escribe, y si había un
  // .md de una pasada anterior lo retira el barrido del final.
  if (estado.some(e => normaliza(e) === normaliza(VETO))) {
    console.log(`  · "${titulo}" está marcada ${VETO}: no se publica`
      + (estado.some(e => normaliza(e) === 'publicada') ? ' y se retira de la web' : ''));
    privadas++;
    continue;
  }

  /* Sólo puede llegar aquí sin ser publicable si entró por "Archivada".
     Archivar no despublica: para que una entrada archivada siga en la web
     tiene que conservar también "Publicada". */
  if (!estado.some(e => ESTADOS.some(x => normaliza(x) === normaliza(e)))) {
    console.warn(`  ⚠ "${titulo}" está ${NEUTRO} y ya no tiene "Publicada": se retira de la web.`
      + ` Si quieres que siga publicada, vuelve a marcarle "Publicada" en Notion.`);
    archivadas++;
    continue;
  }

  // Fecha de publicación: se respeta SIEMPRE la de la tabla. Solo si está en
  // blanco y la entrada está lista para publicar, se toma la de hoy (y se
  // escribe de vuelta en Notion al marcarla, para que la tabla no quede coja).
  const fechaTabla = propTexto(props['Fecha de publicación']);
  const lista      = estado.some(e => normaliza(e).startsWith('lista para publicar'));
  const fechaAsignada = !fechaTabla && lista;
  const fecha = fechaTabla || (lista ? HOY : (p.created_time || '').slice(0, 10));

  const cuerpo = aMarkdown(await bloquesDe(p.id));
  if (cuerpo.trim().length < 20) {
    console.warn(`  · "${titulo}" no tiene contenido en Notion: omitida`);
    vacias++;
    continue;
  }

  const slug   = slugify(titulo);
  const nombre = `${fecha}-${slug}.md`;
  const categoria = cats[0] || 'NewCo';

  /* Frontmatter. Los siete primeros campos son los que consume
     build-bitacora.mjs para montar la página; no se tocan.
     Los cuatro últimos son para Obsidian: etiquetas para buscar y filtrar en
     el vault, alias para que el enlace por título funcione, y los dos enlaces
     de ida y vuelta (a Notion, donde se edita; a la web, donde se lee).
     Todos los valores van en una sola línea: el lector de frontmatter del
     generador no entiende listas YAML multilínea. */
  const etiquetas = ['bitacora', `bitacora/${slugify(categoria)}`];
  const fm = [
    '---',
    `titulo: ${yaml(titulo)}`,
    `fecha: ${yaml(fecha)}`,
    `slug: ${yaml(slug)}`,
    `categoria: ${yaml(categoria)}`,
    `estado: ${yaml(estado.join(', '))}`,
    fuente ? `fuente: ${yaml(fuente)}` : null,
    `notionId: ${yaml(p.id)}`,
    `tags: [${etiquetas.join(', ')}]`,
    `aliases: [${yaml(titulo)}]`,
    `notion: ${yaml(`https://www.notion.so/${p.id.replace(/-/g, '')}`)}`,
    `web: ${yaml(`https://akirokima.github.io/newcocd-web/bitacora.html#${slug}`)}`,
    '---',
    '',
  ].filter(Boolean).join('\n');

  if (!DRY) await writeFile(join(OUT_DIR, nombre), fm + cuerpo, 'utf8');
  escritos.add(nombre);
  if (!estado.includes('Publicada')) nuevas.push({ id: p.id, titulo, fecha, fechaAsignada });
  console.log(`  ✓ ${nombre}`
    + (estado.includes('Publicada') ? '' : '   (pendiente de marcar en Notion)')
    + (fechaAsignada ? `   [sin fecha en la tabla: se le asigna ${fecha}]` : ''));
}

/* Lo que ya no cumple el filtro se retira de la web: marcada Privada, pasada a
   Borrador, cambiada de medio, o archivada sin dejarle "Publicada". El fichero
   sólo desaparece de esta carpeta; en Notion la entrada sigue intacta. */
const existentes = (await readdir(OUT_DIR).catch(() => [])).filter(f => f.endsWith('.md'));
const retiradas = existentes.filter(f => !escritos.has(f));
for (const f of retiradas) {
  console.log(`  ✗ retirada de la web: ${f}`);
  if (!DRY) await unlink(join(OUT_DIR, f));
}
if (retiradas.length) {
  console.log(`    (${retiradas.length} entrada(s) dejan de estar en la web. En Notion no se toca nada.`
    + ` Si alguna no debía salir, revisa que conserve "Publicada" en Estado.)`);
}

// Manifiesto de la pasada. Lo consume marcar-publicadas.mjs DESPUÉS del push:
// si se marcara antes y el push fallara, Notion diría "Publicada" y la web no
// tendría la entrada.
if (!DRY) {
  await writeFile('.bitacora-sync.json',
    JSON.stringify({ fecha: new Date().toISOString(), entradas: nuevas }, null, 2), 'utf8');
}

console.log(`\nSincronizadas ${escritos.size} entradas en ${OUT_DIR}`
  + `${vacias ? `, ${vacias} omitidas por estar vacías` : ''}`
  + `${privadas ? `, ${privadas} marcadas ${VETO}` : ''}`
  + `${archivadas ? `, ${archivadas} ${NEUTRO}s sin "Publicada"` : ''}`
  + `${retiradas.length ? `, ${retiradas.length} retiradas de la web` : ''}`
  + `.${DRY ? ' (simulación: no se ha tocado ningún fichero)' : ''}`);
if (nuevas.length) console.log(`Pendientes de marcar como Publicada en Notion: ${nuevas.length}`);
