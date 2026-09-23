// Zombies-only HUD layer: the chalk round counter, perk bottles, active power-up timers and the zone name.
// Injected into #hud so the extraction HUD stays untouched; hidden outside Zombies.
import { PERKS, type PerkId } from '../zombies/rules';
import { POWERUP_INFO, type PowerUpKind } from '../zombies/powerups';
import { summaryCells, survivedTitle, type ZRunStats } from '../zombies/summary';

const CSS = `
#zhud { position:absolute; inset:0; pointer-events:none; display:none; }
#zhud.on { display:block; }
#zround { position:absolute; left:34px; bottom:150px; font:900 86px/1 Georgia, 'Times New Roman', serif; color:#b3120c;
  text-shadow:0 0 18px rgba(200,20,10,.55), 2px 2px 0 #300; letter-spacing:4px; transition:color .6s, transform .6s; }
#zround.flash { color:#fff; transform:scale(1.15); }
#zround .tally { font-size:64px; letter-spacing:10px; }
#zperks { position:absolute; left:34px; bottom:252px; display:flex; gap:8px; }
.zperk { width:34px; height:46px; border-radius:6px 6px 10px 10px; box-shadow:0 0 12px currentColor; border:2px solid rgba(255,255,255,.35);
  display:flex; align-items:flex-end; justify-content:center; font:700 9px monospace; color:#fff; padding-bottom:3px; }
#zpups { position:absolute; left:50%; bottom:118px; transform:translateX(-50%); display:flex; gap:14px; }
.zpup { width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center; font:900 20px Georgia, serif;
  color:#fff; background:rgba(0,0,0,.55); border:3px solid; position:relative; }
.zpup i { position:absolute; bottom:-16px; font:700 11px monospace; font-style:normal; color:#ddd; }
.zpup.blink { animation: zblink .25s steps(2) infinite; }
@keyframes zblink { 50% { opacity:.25 } }
#zzone { position:absolute; top:24px; left:50%; transform:translateX(-50%); font:700 13px monospace; letter-spacing:.3em; color:#c8b89a; opacity:.8; }
#zzone.below { top:62px; }
#zpoints { position:absolute; left:34px; bottom:100px; font:900 30px Georgia, serif; color:#f0d890; text-shadow:0 0 10px rgba(0,0,0,.8); }
#hud.zmode .hud-tr, #hud.zmode .region-row, #hud.zmode .salvage, #hud.zmode .armor-row, #hud.zmode .inv:first-child { display:none !important; }
#zover { position:fixed; inset:0; z-index:40; display:none; align-items:center; justify-content:center; flex-direction:column;
  background:radial-gradient(ellipse at center, rgba(40,0,0,.78), rgba(0,0,0,.94)); color:#e8dcc8; }
#zover.on { display:flex; }
#zover h1 { font:900 64px/1.1 Georgia, serif; color:#c0140c; text-shadow:0 0 24px rgba(200,20,10,.6); margin:0 0 6px; text-align:center; }
#zover .sub { font:14px monospace; letter-spacing:.3em; color:#a89880; margin-bottom:28px; }
#zover .grid { display:grid; grid-template-columns:repeat(3, 170px); gap:14px; margin-bottom:30px; }
#zover .cell { border:1px solid rgba(200,160,120,.25); padding:12px 10px; text-align:center; background:rgba(0,0,0,.35); }
#zover .v { font:900 30px Georgia, serif; color:#f0d890; }
#zover .k { font:11px monospace; letter-spacing:.2em; color:#998a74; margin-top:4px; }
#zover .btns { display:flex; gap:14px; pointer-events:auto; }
`;

export class ZHud {
  private root: HTMLElement;
  private round: HTMLElement;
  private perks: HTMLElement;
  private pups: HTMLElement;
  private zone: HTMLElement;
  private points: HTMLElement;
  private over: HTMLElement;
  private lastRound = -1;
  private lastPerks = '';
  private lastPups = '';
  private flashT = 0;

  constructor(onRestart: () => void, onMenu: () => void) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.root = document.createElement('div');
    this.root.id = 'zhud';
    this.root.innerHTML = '<div id="zzone"></div><div id="zperks"></div><div id="zround"></div><div id="zpoints"></div><div id="zpups"></div>';
    document.getElementById('hud')!.appendChild(this.root);
    this.round = this.root.querySelector('#zround')!;
    this.perks = this.root.querySelector('#zperks')!;
    this.pups = this.root.querySelector('#zpups')!;
    this.zone = this.root.querySelector('#zzone')!;
    this.points = this.root.querySelector('#zpoints')!;
    this.over = document.createElement('div');
    this.over.id = 'zover';
    this.over.innerHTML = '<h1 id="zover-title"></h1><div class="sub" id="zover-sub"></div><div class="grid" id="zover-grid"></div><div class="btns"><button class="btn primary" id="zover-again">PLAY AGAIN</button><button class="btn" id="zover-menu">MAIN MENU</button></div>';
    document.body.appendChild(this.over);
    this.over.querySelector('#zover-again')!.addEventListener('click', () => { this.showGameOver(null); onRestart(); });
    this.over.querySelector('#zover-menu')!.addEventListener('click', () => { this.showGameOver(null); onMenu(); });
  }

  /** Map flavour for the boss bar and the game-over screen. */
  setMap(name: string, flavor: { bossTitle?: string; gameOverSub?: string } = {}): void {
    this.bossTitle = flavor.bossTitle ?? 'THE WARDEN';
    this.overSub = flavor.gameOverSub ?? `${name.toUpperCase()} · OVERRUN`;
    (this.over.querySelector('#zover-sub') as HTMLElement).textContent = this.overSub;
  }

  private bossTitle = 'THE WARDEN';
  private overSub = '';

  show(on: boolean): void {
    this.root.classList.toggle('on', on);
    document.getElementById('hud')!.classList.toggle('zmode', on);
    const bn = document.querySelector('#boss .boss-name');
    if (bn) bn.textContent = on ? this.bossTitle : 'WARDEN-9 · ELITE INFECTED';
    if (!on) this.lastRound = -1;
  }

  update(dt: number, f: { round: number; points: number; perks: PerkId[]; pups: { kind: PowerUpKind; t: number }[]; zone: string }): void {
    if (f.round !== this.lastRound) {
      this.lastRound = f.round;
      const n = Math.max(0, f.round);
      // Classic tally marks for the first five rounds, numerals afterwards.
      this.round.innerHTML = n === 0 ? '' : n <= 5 ? `<span class="tally">${'|'.repeat(n).replace('|||||', '<s>||||</s>')}</span>` : String(n);
      this.round.classList.add('flash');
      this.flashT = 1.2;
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.round.classList.remove('flash'); }
    this.points.textContent = f.points.toLocaleString('en-US');
    const pk = f.perks.join(',');
    if (pk !== this.lastPerks) {
      this.lastPerks = pk;
      this.perks.innerHTML = f.perks.map((p) => {
        const d = PERKS[p];
        const c = '#' + d.color.toString(16).padStart(6, '0');
        return `<div class="zperk" style="background:${c};color:${c}"><span style="color:#fff">${d.name.slice(0, 4)}</span></div>`;
      }).join('');
    }
    const pu = f.pups.map((p) => `${p.kind}:${Math.ceil(p.t)}:${p.t < 5 ? 1 : 0}`).join(',');
    if (pu !== this.lastPups) {
      this.lastPups = pu;
      this.pups.innerHTML = f.pups.map((p) => {
        const i = POWERUP_INFO[p.kind];
        const c = '#' + i.color.toString(16).padStart(6, '0');
        return `<div class="zpup ${p.t < 5 ? 'blink' : ''}" style="border-color:${c};box-shadow:0 0 14px ${c}">${i.icon}<i>${Math.ceil(p.t)}</i></div>`;
      }).join('');
    }
    if (this.zone.textContent !== f.zone) this.zone.textContent = f.zone;
    // Drop the zone label under the boss bar while it is up.
    this.zone.classList.toggle('below', (document.getElementById('boss')?.style.display ?? 'none') === 'block');
  }

  showGameOver(s: ZRunStats | null): void {
    this.over.classList.toggle('on', !!s);
    if (!s) return;
    this.over.querySelector('#zover-title')!.textContent = survivedTitle(s.round);
    this.over.querySelector('#zover-grid')!.innerHTML = summaryCells(s).map(([k, v]) => `<div class="cell"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
  }
}
