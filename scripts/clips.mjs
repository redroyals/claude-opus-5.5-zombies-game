// Zombie clip plan: [our clip name, Meshy animation-library action id] (docs.meshy.ai/en/api/animation-library).
// Meshy animation-library action ids -> our clip names (docs.meshy.ai/en/api/animation-library)
const A = { shamble: 637, orcwalk: 669, run: 659, attack: 214, death: 184, crawl: 340, scream: 386 };
export const CLIPS = {
  z_shambler: [['walk', A.shamble], ['run', A.run], ['attack', A.attack], ['death', A.death], ['scream', A.scream]],
  z_runner: [['walk', A.shamble], ['run', A.run], ['attack', A.attack], ['death', A.death], ['scream', A.scream]],
  z_brute: [['walk', A.orcwalk], ['run', A.run], ['attack', A.attack], ['death', A.death], ['scream', A.scream]],
  z_crawler: [['walk', A.shamble], ['crawl', A.crawl], ['attack', A.attack], ['death', A.death]],
  z_fast: [['walk', A.shamble], ['run', A.run], ['attack', A.attack], ['death', A.death], ['scream', A.scream]],
  z_boss: [['walk', A.orcwalk], ['run', A.run], ['attack', A.attack], ['death', A.death], ['scream', A.scream]],
};
