// Procedural camo materials (no textures/models): MeshStandardMaterial + injected GLSL.
// Base patterns (woodland, digital, tiger, hex, splinter, topo, glacier, ember) and animated
// mastery finishes: Gilded (gold), Argent (chrome), Prism (iridescent), Void Matter (dark, star-flecked).
import * as THREE from 'three';
import type { CamoPattern } from '../shared/camos';

const PATTERN_ID: Record<CamoPattern, number> = { woodland: 0, digital: 1, tiger: 2, hex: 3, splinter: 4, topo: 5, glacier: 6, ember: 7, gold: 8, chrome: 9, prism: 10, void: 11 };
const PALETTES: Record<CamoPattern, [number, number, number]> = {
  woodland: [0x3d4a2a, 0x6b5a3a, 0x1f2616], digital: [0x5a6470, 0x8a95a0, 0x2e343b], tiger: [0x6b6a3a, 0x2a2a1a, 0x9a8a50],
  hex: [0x2b3340, 0x4a5a70, 0x151a22], splinter: [0x8a8f7a, 0x4f5a3f, 0x2a2e22], topo: [0x6d5c43, 0xa38e66, 0x3a3024],
  glacier: [0xcfe3ef, 0x8fb3cc, 0x5a7d99], ember: [0x2a1a14, 0xc2461a, 0xffb347],
  gold: [0xffc84a, 0xb8860b, 0xfff1b0], chrome: [0xdfe6ee, 0x8e9aa8, 0xffffff], prism: [0xff4fd8, 0x3fe0ff, 0xfff05a], void: [0x08040f, 0x3a1466, 0xb26bff],
};

export const camoUniforms = { uTime: { value: 0 } };

export function tickCamos(dt: number) { camoUniforms.uTime.value += dt; }

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function camoMaterial(pattern: CamoPattern = 'woodland', scale = 6): THREE.MeshStandardMaterial {
  const key = `${pattern}:${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const id = PATTERN_ID[pattern];
  const [c0, c1, c2] = PALETTES[pattern].map((c) => new THREE.Color(c));
  const metallic = id >= 8;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: metallic ? 1 : 0.25, roughness: id === 9 ? 0.08 : id === 8 ? 0.22 : id >= 10 ? 0.18 : 0.7 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = camoUniforms.uTime;
    Object.assign(sh.uniforms, { uC0: { value: c0 }, uC1: { value: c1 }, uC2: { value: c2 }, uPat: { value: id }, uScale: { value: scale } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCamoPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamoPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vCamoPos; uniform float uTime; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform int uPat; uniform float uScale;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*n3(p); p*=2.03; a*=0.5; } return s; }
vec3 camoColor(vec3 p, vec3 nrm, vec3 viewDir){
  p *= uScale;
  if (uPat==0) { float v=fbm(p*0.8); return v<0.42?uC2:(v<0.55?uC0:uC1); }
  if (uPat==1) { vec3 q=floor(p*3.0)/3.0; float v=fbm(q); return v<0.45?uC2:(v<0.58?uC0:uC1); }
  if (uPat==2) { float v=sin(p.x*4.0+fbm(p)*6.0); return v>0.55?uC1:(v>-0.2?uC0:uC2); }
  if (uPat==3) { vec2 q=p.xy*2.0; q.x*=1.1547; q.y+=mod(floor(q.x),2.0)*0.5; vec2 f=abs(fract(q)-0.5); float e=max(f.x*1.5+f.y, f.y*2.0); return e>0.95?uC2:mix(uC0,uC1,step(0.5,h3(floor(vec3(q,0.0))))); }
  if (uPat==4) { float v=fbm(vec3(p.x*2.0+p.y, p.y*0.3, p.z)); return v<0.45?uC2:(v<0.6?uC1:uC0); }
  if (uPat==5) { float v=fbm(p*0.6)*10.0; float l=abs(fract(v)-0.5); return l<0.06?uC2:mix(uC0,uC1,fract(v*0.1)); }
  if (uPat==6) { float v=fbm(p*1.3+vec3(0.0,uTime*0.02,0.0)); float crack=smoothstep(0.48,0.5,v)-smoothstep(0.5,0.52,v); return mix(mix(uC0,uC1,v),uC2,crack); }
  if (uPat==7) { float v=fbm(p+vec3(0.0,-uTime*0.4,0.0)); float glow=smoothstep(0.55,0.75,v); return mix(uC0,mix(uC1,uC2,glow),glow*(0.7+0.3*sin(uTime*3.0))); }
  float fres = pow(1.0-max(dot(nrm, viewDir),0.0), 2.0);
  if (uPat==8) { float sweep=smoothstep(0.9,1.0,sin(p.x*0.6+p.y*0.3-uTime*1.8)); return mix(uC1,uC0,0.6+0.4*fbm(p*0.5))+uC2*sweep*0.6+fres*0.2; }
  if (uPat==9) { float band=0.5+0.5*sin(p.y*1.5+uTime*0.7); return mix(uC1,uC0,band)+uC2*fres*0.6; }
  if (uPat==10) { float hue=fract(dot(nrm,vec3(0.3,0.6,0.1))+fres*0.8+uTime*0.08+fbm(p*0.4)*0.3);
    vec3 rgb=clamp(abs(mod(hue*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0); return mix(rgb,uC2,0.15)+fres*0.3; }
  // void matter
  float swirl=fbm(p*0.7+vec3(uTime*0.15,0.0,-uTime*0.1));
  float stars=step(0.985,h3(floor(p*18.0)+floor(uTime*2.0)));
  return mix(uC0,uC1,swirl*swirl)+uC2*(stars*1.5+fres*0.8);
}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= camoColor(vCamoPos, normalize(vNormal), normalize(vViewPosition));');
    if (id >= 7) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += camoColor(vCamoPos, normalize(vNormal), normalize(vViewPosition)) * ${id === 11 ? '0.25' : id === 7 ? '0.35' : '0.08'};`);
  };
  m.customProgramCacheKey = () => `camo-${key}`;
  cache.set(key, m);
  return m;
}
