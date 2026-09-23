// Dev server for long headless runs: same config, but no HMR and no file watching, so editing the repo while an
// e2e script is running cannot reload the page under it. Usage: vite --config e2e/vite.noreload.config.mjs --port 5183
import base from '../vite.config.ts';
export default { ...base, server: { ...(base.server ?? {}), hmr: false, watch: { ignored: ['**/*'] } } };
