#!/usr/bin/env node
/**
 * Marca en Notion como "Publicada" las entradas de la última sincronización,
 * y rellena la fecha de publicación de las que no la tenían.
 *
 * SE EJECUTA DESPUÉS DEL PUSH, nunca antes: si se marcara primero y el push
 * fallara, Notion diría "Publicada" y la web no tendría la entrada.
 *
 * Uso:  NOTION_TOKEN=ntn_xxx node scripts/marcar-publicadas.mjs
 *       NOTION_TOKEN=ntn_xxx node scripts/marcar-publicadas.mjs --dry-run
 */
import { readFile, writeFile } from 'node:fs/promises';

const TOKEN = process.env.NOTION_TOKEN;
const DRY   = process.argv.includes('--dry-run');
const MANIFIESTO = '.bitacora-sync.json';

if (!TOKEN) { console.error('Falta NOTION_TOKEN'); process.exit(1); }

const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

// El nombre real de la opción se resuelve contra el esquema de la base, para
// no depender de cómo esté escrita ("Publicada" / "publicada" / con errata).
const DB_ID = process.env.NOTION_DB_ID || '3bf5d0d5-f0a5-804f-ab41-c3189166bc14';
const normaliza = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

async function nombreDePublicada() {
  const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, { headers: HEADERS });
  if (!res.ok) return 'Publicada';
  const db = await res.json();
  const ops = db.properties?.Estado?.multi_select?.options?.map(o => o.name) || [];
  return ops.find(o => normaliza(o) === 'publicada') || 'Publicada';
}

let manifiesto;
try {
  manifiesto = JSON.parse(await readFile(MANIFIESTO, 'utf8'));
} catch {
  console.log('No hay nada pendiente de marcar (no existe el manifiesto).');
  process.exit(0);
}

const pendientes = manifiesto.entradas || [];
if (!pendientes.length) { console.log('Nada que marcar: la Bitácora ya estaba al día.'); process.exit(0); }

const PUBLICADA = await nombreDePublicada();

let ok = 0, fallos = 0;
for (const e of pendientes) {
  // "Estado" es multi_select: se sustituye por Publicada, de modo que
  // "Lista para publicar" desaparece y la entrada no reentra en la próxima pasada.
  const properties = { Estado: { multi_select: [{ name: PUBLICADA }] } };

  // Si la tabla no tenía fecha, se escribe la que se usó al publicar.
  if (e.fechaAsignada && e.fecha) {
    properties['Fecha de publicación'] = { date: { start: e.fecha } };
  }

  if (DRY) {
    console.log(`  · (simulación) ${e.titulo}${e.fechaAsignada ? ` + fecha ${e.fecha}` : ''}`);
    ok++; continue;
  }

  const res = await fetch(`https://api.notion.com/v1/pages/${e.id}`, {
    method: 'PATCH', headers: HEADERS, body: JSON.stringify({ properties }),
  });

  if (res.ok) {
    console.log(`  ✓ Publicada: ${e.titulo}${e.fechaAsignada ? `   (fecha asignada: ${e.fecha})` : ''}`);
    ok++;
  } else {
    console.error(`  ✗ No se pudo marcar "${e.titulo}": ${res.status} ${await res.text()}`);
    fallos++;
  }
}

// El manifiesto se vacía solo si TODO fue bien; si algo falló, se conserva
// para poder reintentar sin volver a sincronizar.
if (!DRY && !fallos) {
  await writeFile(MANIFIESTO, JSON.stringify({ fecha: manifiesto.fecha, entradas: [] }, null, 2), 'utf8');
}

console.log(`\nMarcadas ${ok} entradas como Publicada${fallos ? `, ${fallos} con error` : ''}.`);
if (fallos) process.exit(1);
