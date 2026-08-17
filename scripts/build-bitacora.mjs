#!/usr/bin/env node
/**
 * Genera ideas.html (la Bitácora) a partir de los markdown del repositorio.
 *
 * Fuente de verdad: src/content/bitacora/*.md  (los escribe sync-notion.mjs).
 * Plantilla:        scripts/bitacora.template.html  — el mismo ideas.html pero
 *                   con <!--ENTRADAS--> en lugar del contenido de <main>.
 *
 * No toca Notion ni la red: es determinista y se puede ejecutar mil veces.
 * Va SIEMPRE entre sync-notion.mjs y el git commit; si no, el markdown cambia
 * y la web no.
 *
 * Uso:  node scripts/build-bitacora.mjs
 *       node scripts/build-bitacora.mjs --check   (no escribe; solo dice si cambiaría)
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI      = dirname(fileURLToPath(import.meta.url));
const RAIZ      = join(AQUI, '..');
const CONTENIDO = process.env.CONTENT_DIR || join(RAIZ, 'src/content/bitacora');
const PLANTILLA = process.env.TEMPLATE || join(AQUI, 'bitacora.template.html');
const SALIDA    = process.env.OUT_FILE || join(RAIZ, 'ideas.html');
const CHECK     = process.argv.includes('--check');

const MARCADOR = '<!--ENTRADAS-->';

/* Color del punto por categoría. Los nombres se comparan sin acentos ni
   mayúsculas, así que "TaskOol", "Taskool" y "taskool" son lo mismo. */
const COLORES = {
  newco:       '#5FB544',
  taskool:     '#66C8FF',
  technetium:  '#A78BFA',
  personal:    '#EDE3D2',
};
const COLOR_POR_DEFECTO = '#EDE3D2';

const MES    = ['enero','febrero','marzo','abril','mayo','junio',
                'julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MES_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const normaliza = s => String(s).toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').trim();

/* ------------------------- frontmatter ------------------------- */

function separar(texto) {
  const t = texto.replace(/^﻿/, '');
  if (!t.startsWith('---')) return { meta: {}, cuerpo: t };
  const fin = t.indexOf('\n---', 3);
  if (fin === -1) return { meta: {}, cuerpo: t };
  const cabecera = t.slice(3, fin);
  const cuerpo   = t.slice(t.indexOf('\n', fin + 1) + 1);
  const meta = {};
  for (const linea of cabecera.split('\n')) {
    const m = linea.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^".*"$/.test(v)) v = v.slice(1, -1).replace(/\\"/g, '"');
    meta[m[1]] = v;
  }
  return { meta, cuerpo };
}

/* --------------------- markdown -> HTML ----------------------- */

/* Los marcadores \u0000n\u0000 aparcan los caracteres escapados en el markdown
   (\* \_ \`) para que no los interprete el propio conversor. */
function inline(t) {
  t = t.replace(/\\([*_`])/g, (_, c) => `\u0000${c.charCodeAt(0)}\u0000`);
  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
                '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  t = t.replace(/\u0000(\d+)\u0000/g, (_, c) => String.fromCharCode(Number(c)));
  return t;
}

function md2html(md) {
  const out = [];
  let lista = null;          // 'ul' | 'ol' | null
  let codigo = null;         // acumulador dentro de ```

  const cerrarLista = () => { if (lista) { out.push(`</${lista}>`); lista = null; } };
  const abrirLista = tipo => {
    if (lista !== tipo) { cerrarLista(); out.push(`<${tipo}>`); lista = tipo; }
  };

  for (const bruta of md.split('\n')) {
    const l = bruta.replace(/\s+$/, '');
    const s = l.trim();                       // la sangría de las listas anidadas se aplana

    if (codigo !== null) {
      if (s.startsWith('```')) {
        out.push(`<pre><code>${codigo.join('\n')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`);
        codigo = null;
      } else codigo.push(l);
      continue;
    }
    if (s.startsWith('```')) { cerrarLista(); codigo = []; continue; }

    if (!s) continue;                          // las líneas en blanco no separan nada
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(s)) { cerrarLista(); continue; }  // separadores: se ignoran

    const h = s.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      cerrarLista();
      out.push(`<h3>${inline(h[2].replace(/^[*\s]+|[*\s]+$/g, ''))}</h3>`);
      continue;
    }
    if (s.startsWith('> ')) {
      cerrarLista();
      out.push(`<blockquote>${inline(s.slice(2))}</blockquote>`);
      continue;
    }
    if (/^[-*]\s/.test(s)) {
      abrirLista('ul');
      out.push(`<li>${inline(s.replace(/^[-*]\s*/, '').replace(/^\[[ xX]\]\s*/, ''))}</li>`);
      continue;
    }
    if (/^\d+\.\s/.test(s)) {
      abrirLista('ol');
      out.push(`<li>${inline(s.replace(/^\d+\.\s*/, ''))}</li>`);
      continue;
    }
    cerrarLista();
    out.push(`<p>${inline(s)}</p>`);
  }
  if (codigo !== null) out.push(`<pre><code>${codigo.join('\n')}</code></pre>`);
  cerrarLista();
  return out.join('\n');
}

/* ---------------------------- utilidades ---------------------------- */

const attr = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

function fechas(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return { es: iso || '', en: iso || '' };
  const [, y, mm, d] = m;
  return {
    es: `${Number(d)} ${MES[Number(mm) - 1]} ${y}`,
    en: `${MES_EN[Number(mm) - 1]} ${Number(d)}, ${y}`,
  };
}

/* ------------------------------ main ------------------------------ */

const plantilla = await readFile(PLANTILLA, 'utf8');
if (!plantilla.includes(MARCADOR)) {
  console.error(`La plantilla no contiene ${MARCADOR}: ${PLANTILLA}`);
  process.exit(1);
}

const ficheros = (await readdir(CONTENIDO).catch(err => {
  console.error(`No se puede leer ${CONTENIDO}: ${err.message}`);
  process.exit(1);
})).filter(f => f.endsWith('.md')).sort();

if (!ficheros.length) {
  console.error(`No hay entradas en ${CONTENIDO}. ¿Falta ejecutar sync-notion.mjs?`);
  process.exit(1);
}

const entradas = [];
for (const f of ficheros) {
  const { meta, cuerpo } = separar(await readFile(join(CONTENIDO, f), 'utf8'));
  const titulo = meta.titulo || '';
  const slug   = meta.slug || f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
  const fecha  = meta.fecha || f.slice(0, 10);
  if (!titulo) { console.warn(`  ⚠ ${f}: sin título en el frontmatter, omitida`); continue; }
  if (cuerpo.trim().length < 20) { console.warn(`  ⚠ ${f}: sin contenido, omitida`); continue; }
  entradas.push({ f, titulo, slug, fecha, categoria: meta.categoria || '', fuente: meta.fuente || '', cuerpo });
}

// Más recientes arriba; a igualdad de fecha, orden estable por título.
entradas.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.titulo.localeCompare(b.titulo, 'es'));

const vistos = new Set();
const articulos = entradas.map(e => {
  if (vistos.has(e.slug)) console.warn(`  ⚠ slug repetido "${e.slug}" (${e.f}): los enlaces directos serán ambiguos`);
  vistos.add(e.slug);

  const { es, en } = fechas(e.fecha);
  const color = COLORES[normaliza(e.categoria)] || COLOR_POR_DEFECTO;
  const fuente = e.fuente
    ? `<p class="src"><a href="${attr(e.fuente)}" target="_blank" rel="noopener noreferrer">Publicado originalmente aquí</a></p>`
    : '';

  return `<article class="post" id="${attr(e.slug)}" style="--dot:${color}">
  <button class="row" aria-expanded="false" aria-controls="c-${attr(e.slug)}">
    <span class="dot" aria-hidden="true"></span>
    <time datetime="${attr(e.fecha)}" class="date" data-es="${attr(es)}" data-en="${attr(en)}">${es}</time>
    <span class="title">${attr(e.titulo)}</span>
    <span class="chev" aria-hidden="true"></span>
  </button>
  <div class="body" id="c-${attr(e.slug)}"><div class="inner">${md2html(e.cuerpo)}${fuente}</div></div>
</article>`;
});

const html = plantilla.replace(MARCADOR, () => articulos.join('\n'));
const previo = await readFile(SALIDA, 'utf8').catch(() => null);
const cambia = previo !== html;

if (CHECK) {
  console.log(cambia ? 'ideas.html quedaría desactualizado: hay que regenerarlo.' : 'ideas.html está al día.');
  process.exit(cambia ? 1 : 0);
}

await writeFile(SALIDA, html, 'utf8');
console.log(`ideas.html regenerado: ${entradas.length} entradas, ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`
  + (cambia ? '' : ' (sin cambios)'));
for (const e of entradas) console.log(`  · ${e.fecha}  ${e.titulo}`);
