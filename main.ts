// Entrypoint penyerahan: memindahkan game dan screenshot yang sudah jadi ke
// direktori output, lalu menulis dossier.json yang merangkum isinya. Program
// ini hanya menyalin file lokal dan memanggil library dossier; ia tidak
// memakai jaringan dan tidak mengubah game itu sendiri.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// Direktori tempat file ini berada: game/ dan screenshots/ tinggal di sebelahnya.
const here = dirname(fileURLToPath(import.meta.url));

// Tujuan penyerahan: dari environment, atau /output bila tidak disebut.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });

// Pindahkan game utuh ke <out>/game.
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });

// Siapkan <out>/screenshots, lalu isi dari screenshots/ lokal bila ada.
const shotsOut = join(outDir, 'screenshots');
mkdirSync(shotsOut, { recursive: true });
const shotsLocal = join(here, 'screenshots');
if (existsSync(shotsLocal)) {
  cpSync(shotsLocal, shotsOut, { recursive: true });
}

// Susun dossier dari isi direktori output dan tulis sebagai dossier.json.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
