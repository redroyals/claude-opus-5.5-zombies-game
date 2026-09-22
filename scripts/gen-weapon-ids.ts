import { WEAPON_LIST } from '../src/data/weapons.ts';
const lines = ['# WEAPON_IDS', '', 'Canonical multiplayer weapon ids (source of truth: `src/data/weapons.ts`). Model files go at `assets/weapons/<id>.glb`.', 'Names are original and faction-neutral; "inspiration" is a loose silhouette brief only (no real trademarks/markings).', '', '`id | class | name | inspiration`', '', '```'];
for (const w of WEAPON_LIST) lines.push(`${w.id} | ${w.cls} | ${w.name} | ${w.inspiration}`);
lines.push('```', '', `Total: ${WEAPON_LIST.length}`);
console.log(lines.join('\n'));
