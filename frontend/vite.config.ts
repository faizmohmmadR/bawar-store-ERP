import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  let apiOrigin = "'self'";
  if (env.VITE_API_URL && !env.VITE_API_URL.startsWith('/')) {
    const apiUrl = new URL(env.VITE_API_URL);
    if (!['http:', 'https:'].includes(apiUrl.protocol)) {
      throw new Error('VITE_API_URL must use HTTP or HTTPS.');
    }
    apiOrigin = apiUrl.origin;
  }

  return {
    server: {
      host: "::",
      port: 8080,
      headers: {
        "Cache-Control": "no-store",
      },
      hmr: {
        overlay: true,
      },
    },
    plugins: [
      {
        name: 'api-content-security-policy',
        transformIndexHtml(html) {
          return html
            .replaceAll('__API_ORIGIN__', apiOrigin)
            .replaceAll('__DEV_CONNECT_SOURCES__', command === 'serve'
              ? 'ws://localhost:* ws://127.0.0.1:*' : '');
        },
      },
      react(),
      mode === 'development' &&
      componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom"],
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
