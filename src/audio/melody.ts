// Pure note generation for the hidden side-quest songs (no WebAudio here, so it can be tested).
// A name seeds the key and the melody so every map's song differs without any sample files.

export interface SongNote { t: number; dur: number; freq: number; voice: 'bass' | 'pad' | 'lead' | 'kick' | 'hat' }

/** Unsigned 32-bit string hash. */
export function songSeed(name: string): number {
  let h = 0;
  for (const c of name) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Ten bars (~24 s at a 0.3 s beat) of minor-pentatonic chords, drums and a seeded lead. */
export function easterSong(name: string, beat = 0.3, bars = 10): SongNote[] {
  const h = songSeed(name);
  const root = 110 * Math.pow(2, (h % 7) / 12);
  const scale = [0, 3, 5, 7, 10, 12, 15];
  const out: SongNote[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const chord = [0, 5, 3, 4][bar % 4];
    const base = root * Math.pow(2, scale[chord] / 12);
    const tb = bar * beat * 8;
    out.push({ t: tb, dur: beat * 8, freq: base / 2, voice: 'bass' }, { t: tb, dur: beat * 8, freq: base * 1.5, voice: 'pad' });
    for (let k = 0; k < 8; k++) {
      if (k % 2 === 0) out.push({ t: tb + k * beat, dur: 0.08, freq: 6000, voice: 'hat' });
      if (k === 0 || k === 4) out.push({ t: tb + k * beat, dur: 0.25, freq: 90, voice: 'kick' });
      const bits = (h >>> ((bar * 8 + k) % 24)) >>> 0;
      if (((h >>> ((k + bar) % 31)) & 1) === 1) out.push({ t: tb + k * beat, dur: beat * 0.9, freq: root * 2 * Math.pow(2, scale[bits % scale.length] / 12), voice: 'lead' });
    }
  }
  return out;
}
