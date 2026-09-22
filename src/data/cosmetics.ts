// Cosmetics catalogue. Bought with in-game dollars (server-side ledger) or unlocked by level/prestige.
// NO real money anywhere. Prices are authoritative on the server.
export type CosmeticKind = 'calling_card' | 'emblem' | 'mask' | 'charm' | 'reticle' | 'token';
export interface CosmeticDef { id: string; kind: CosmeticKind; name: string; price?: number; unlockLevel?: number; prestige?: number }

const cards = ['Harbour Dawn', 'Neon Stack', 'Tram Line', 'Ridge Sunset', 'Signal Lost', 'Cold Front', 'Monsoon', 'Rooftop Run', 'Night Market', 'Ash Fall'];
const masks = ['Charcoal', 'Olive Drab', 'Sand', 'Arctic', 'Crimson Visor', 'Mirror Visor', 'Bone', 'Urban Grey'];
const charms = ['Brass Compass', 'Paracord Knot', 'Tiny Kettle', 'Dice Pair', 'Lantern', 'Key Ring'];

export const COSMETICS: CosmeticDef[] = [
  ...cards.map((n, i) => ({ id: `card_${i}`, kind: 'calling_card' as const, name: n, unlockLevel: 2 + i * 10 })),
  ...cards.map((n, i) => ({ id: `card_shop_${i}`, kind: 'calling_card' as const, name: `${n} (Animated)`, price: 800 + i * 100 })),
  ...masks.map((n, i) => ({ id: `mask_${i}`, kind: 'mask' as const, name: `${n} Mask`, ...(i < 4 ? { unlockLevel: 1 + i * 15 } : { price: 1500 }) })),
  ...charms.map((n, i) => ({ id: `charm_${i}`, kind: 'charm' as const, name: n, price: 600 })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: `emblem_p${i + 1}`, kind: 'emblem' as const, name: `Prestige ${i + 1}`, prestige: i + 1 })),
  { id: 'reticle_chevron', kind: 'reticle', name: 'Chevron Reticle', price: 400 },
  { id: 'reticle_ring', kind: 'reticle', name: 'Ring Reticle', price: 400 },
  /** Unlock token: permanently unlock one level-gated item early. */
  { id: 'unlock_token', kind: 'token', name: 'Unlock Token', price: 3000 },
];
export const COSMETIC_BY_ID: Record<string, CosmeticDef> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
