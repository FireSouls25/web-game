import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only modules must never ship in production bundles.
// They live under src/dev/ and are loaded via dynamic import()
// guarded by `import.meta.env.DEV`. This plugin is a safety net:
// it fails `vite build --mode production` if a prod chunk imports them.
function noDevInProd() {
  return {
    name: 'no-dev-in-prod',
    enforce: 'pre' as const,
    resolveId(source: string, importer: string | undefined) {
      if (
        process.env.NODE_ENV === 'production' &&
        importer &&
        !importer.includes('/src/dev/') &&
        !importer.includes('node_modules') &&
        (source === './dev/testLevels' ||
          source === '../dev/testLevels' ||
          source.includes('/dev/') ||
          source.includes('src/dev'))
      ) {
        throw new Error(
          `[no-dev-in-prod] "${importer}" imports dev-only module "${source}". ` +
            `Use dynamic import() behind import.meta.env.DEV instead.`,
        );
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), noDevInProd()],
  define: {
    // Compile-time flag for dev-profile-only code paths.
    // In prod builds this becomes `false` so bundlers drop DEV branches.
    __DEV_PROFILE__: JSON.stringify(mode !== 'production'),
  },
  build: {
    sourcemap: mode !== 'production',
  },
  server: {
    port: 5173,
  },
}));
