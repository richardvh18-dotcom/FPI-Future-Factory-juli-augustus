// vite.config.ts
import { defineConfig } from "file:///D:/Antygravity/FPI-Future-Factory-juli-augustus/node_modules/vite/dist/node/index.js";
import react from "file:///D:/Antygravity/FPI-Future-Factory-juli-augustus/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { VitePWA } from "file:///D:/Antygravity/FPI-Future-Factory-juli-augustus/node_modules/vite-plugin-pwa/dist/index.js";

// vite.pwa.config.ts
var pwaConfig = {
  registerType: "autoUpdate",
  injectRegister: "auto",
  workbox: {
    globPatterns: ["**/*.{js,css,html,ico,png,svg,json,woff,woff2}"],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "firestore-cache",
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24 * 7
            // 1 week
          },
          cacheableResponse: {
            statuses: [0, 200]
          }
        }
      },
      {
        urlPattern: /^https:\/\/storage\.googleapis\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "storage-cache",
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24 * 30
            // 30 dagen
          },
          cacheableResponse: {
            statuses: [0, 200]
          }
        }
      }
    ]
  },
  includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
  manifest: {
    name: "FPi Future Factory Hub",
    short_name: "FPi Factory",
    description: "Manufacturing Execution System voor FPi Future Factory",
    theme_color: "#0f172a",
    background_color: "#ffffff",
    display: "standalone",
    orientation: "any",
    scope: "/",
    start_url: "/",
    icons: [
      { src: "favicon.ico", sizes: "64x64 32x32 24x24 16x16", type: "image/x-icon" },
      { src: "logo192.png", type: "image/png", sizes: "192x192" },
      { src: "logo512.png", type: "image/png", sizes: "512x512", purpose: "any maskable" }
    ]
  }
};

// vite.config.ts
import { execSync } from "child_process";
var __vite_injected_original_import_meta_url = "file:///D:/Antygravity/FPI-Future-Factory-juli-augustus/vite.config.ts";
var __filename = fileURLToPath(__vite_injected_original_import_meta_url);
var __dirname = path.dirname(__filename);
var gitHash = "unknown";
var buildStatus = "UNKNOWN";
try {
  gitHash = execSync("git rev-parse --short HEAD").toString().trim();
  const gitStatus = execSync("git status --porcelain").toString().trim();
  buildStatus = gitStatus ? "DIRTY" : "STABLE";
} catch (e) {
  console.warn("Could not read git status");
}
process.env.VITE_GIT_HASH = gitHash;
process.env.VITE_BUILD_STATUS = buildStatus;
var versionPath = path.resolve(__dirname, "public/version.json");
var version = "dev";
try {
  const versionData = JSON.parse(fs.readFileSync(versionPath, "utf-8"));
  version = versionData.version;
} catch (e) {
  console.warn("Could not read public/version.json");
}
var vite_config_default = defineConfig({
  plugins: [react(), VitePWA(pwaConfig)],
  resolve: {
    alias: {
      // Zorgt ervoor dat we @ kunnen gebruiken als kortere weg naar de src map
      "@": path.resolve(__dirname, "./src")
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/node_modules/@firebase/firestore") || id.includes("/node_modules/firebase/firestore")) {
            return "firebase-firestore";
          }
          if (id.includes("/node_modules/@firebase/auth") || id.includes("/node_modules/firebase/auth")) {
            return "firebase-auth";
          }
          if (id.includes("/node_modules/@firebase/storage") || id.includes("/node_modules/firebase/storage")) {
            return "firebase-storage";
          }
          if (id.includes("/node_modules/@firebase/functions") || id.includes("/node_modules/firebase/functions")) {
            return "firebase-functions";
          }
          if (id.includes("/node_modules/@firebase/app") || id.includes("/node_modules/firebase/app")) {
            return "firebase-core";
          }
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/") || id.includes("/node_modules/react-router-dom/") || id.includes("/node_modules/react-i18next/") || id.includes("/node_modules/i18next/")) {
            return "react-vendor";
          }
          if (id.includes("/node_modules/xlsx/")) {
            return "xlsx-vendor";
          }
          if (id.includes("/node_modules/jspdf/") || id.includes("/node_modules/jspdf-autotable/")) {
            return "jspdf-vendor";
          }
          if (id.includes("/node_modules/pdfjs-dist/")) {
            return "pdfjs-vendor";
          }
          if (id.includes("/node_modules/date-fns/")) {
            return "date-vendor";
          }
          if (id.includes("/node_modules/lucide-react/")) {
            return "icons-vendor";
          }
        }
      }
    }
  },
  server: {
    port: 3e3,
    strictPort: true,
    host: true,
    allowedHosts: [
      "localhost",
      ".app.github.dev",
      ".csb.app",
      "ffqznh-3000.csb.app"
    ]
    // hmr: {
    //   clientPort: 443, 
    // },
  },
  define: {
    // Injecteert de appId in de globale scope van de applicatie
    __app_id: JSON.stringify("fittings-app-v1"),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.VITE_APP_VERSION || version)
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAidml0ZS5wd2EuY29uZmlnLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiRDpcXFxcQW50eWdyYXZpdHlcXFxcRlBJLUZ1dHVyZS1GYWN0b3J5LWp1bGktYXVndXN0dXNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXEFudHlncmF2aXR5XFxcXEZQSS1GdXR1cmUtRmFjdG9yeS1qdWxpLWF1Z3VzdHVzXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9BbnR5Z3Jhdml0eS9GUEktRnV0dXJlLUZhY3RvcnktanVsaS1hdWd1c3R1cy92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnO1xyXG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xyXG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcclxuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gJ3VybCc7XHJcbmltcG9ydCBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnO1xyXG5pbXBvcnQgeyBwd2FDb25maWcgfSBmcm9tICcuL3ZpdGUucHdhLmNvbmZpZyc7XHJcblxyXG5jb25zdCBfX2ZpbGVuYW1lID0gZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpO1xyXG5jb25zdCBfX2Rpcm5hbWUgPSBwYXRoLmRpcm5hbWUoX19maWxlbmFtZSk7XHJcblxyXG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xyXG5cclxubGV0IGdpdEhhc2ggPSAndW5rbm93bic7XHJcbmxldCBidWlsZFN0YXR1cyA9ICdVTktOT1dOJztcclxudHJ5IHtcclxuICBnaXRIYXNoID0gZXhlY1N5bmMoJ2dpdCByZXYtcGFyc2UgLS1zaG9ydCBIRUFEJykudG9TdHJpbmcoKS50cmltKCk7XHJcbiAgY29uc3QgZ2l0U3RhdHVzID0gZXhlY1N5bmMoJ2dpdCBzdGF0dXMgLS1wb3JjZWxhaW4nKS50b1N0cmluZygpLnRyaW0oKTtcclxuICBidWlsZFN0YXR1cyA9IGdpdFN0YXR1cyA/ICdESVJUWScgOiAnU1RBQkxFJztcclxufSBjYXRjaCAoZSkge1xyXG4gIGNvbnNvbGUud2FybignQ291bGQgbm90IHJlYWQgZ2l0IHN0YXR1cycpO1xyXG59XHJcblxyXG5wcm9jZXNzLmVudi5WSVRFX0dJVF9IQVNIID0gZ2l0SGFzaDtcclxucHJvY2Vzcy5lbnYuVklURV9CVUlMRF9TVEFUVVMgPSBidWlsZFN0YXR1cztcclxuXHJcblxyXG4vLyBSZWFkIHZlcnNpb24gZnJvbSBwdWJsaWMvdmVyc2lvbi5qc29uXHJcbmNvbnN0IHZlcnNpb25QYXRoID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJ3B1YmxpYy92ZXJzaW9uLmpzb24nKTtcclxubGV0IHZlcnNpb24gPSAnZGV2JztcclxudHJ5IHtcclxuICBjb25zdCB2ZXJzaW9uRGF0YSA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHZlcnNpb25QYXRoLCAndXRmLTgnKSk7XHJcbiAgdmVyc2lvbiA9IHZlcnNpb25EYXRhLnZlcnNpb247XHJcbn0gY2F0Y2ggKGUpIHtcclxuICBjb25zb2xlLndhcm4oJ0NvdWxkIG5vdCByZWFkIHB1YmxpYy92ZXJzaW9uLmpzb24nKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFZpdGUgQ29uZmlndXJhdGllIFYyLjYgLSBWZXJjZWwgRGVwbG95bWVudCBGaXhcclxuICogKyBTUEEgcm91dGluZyBzdXBwb3J0XHJcbiAqICsgT3B0aW1pemVkIGJ1aWxkIGNvbmZpZ3VyYXRpb25cclxuICovXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XHJcbiAgcGx1Z2luczogW3JlYWN0KCksIFZpdGVQV0EocHdhQ29uZmlnKV0sXHJcbiAgcmVzb2x2ZToge1xyXG4gICAgYWxpYXM6IHtcclxuICAgICAgLy8gWm9yZ3QgZXJ2b29yIGRhdCB3ZSBAIGt1bm5lbiBnZWJydWlrZW4gYWxzIGtvcnRlcmUgd2VnIG5hYXIgZGUgc3JjIG1hcFxyXG4gICAgICAnQCc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpLFxyXG4gICAgfSxcclxuICB9LFxyXG5cclxuICBidWlsZDoge1xyXG4gICAgb3V0RGlyOiAnZGlzdCcsXHJcbiAgICBzb3VyY2VtYXA6IGZhbHNlLFxyXG4gICAgcmVwb3J0Q29tcHJlc3NlZFNpemU6IGZhbHNlLFxyXG4gICAgcm9sbHVwT3B0aW9uczoge1xyXG4gICAgICBvdXRwdXQ6IHtcclxuICAgICAgICBtYW51YWxDaHVua3MoaWQpIHtcclxuICAgICAgICAgIGlmICghaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcycpKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgLy8gU3BsaXQgRmlyZWJhc2UgaW50byBmZWF0dXJlIGNodW5rcyBzbyBubyBzaW5nbGUgdmVuZG9yIGNodW5rIGdyb3dzIHRvbyBsYXJnZS5cclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy9AZmlyZWJhc2UvZmlyZXN0b3JlJykgfHwgaWQuaW5jbHVkZXMoJy9ub2RlX21vZHVsZXMvZmlyZWJhc2UvZmlyZXN0b3JlJykpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdmaXJlYmFzZS1maXJlc3RvcmUnO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCcvbm9kZV9tb2R1bGVzL0BmaXJlYmFzZS9hdXRoJykgfHwgaWQuaW5jbHVkZXMoJy9ub2RlX21vZHVsZXMvZmlyZWJhc2UvYXV0aCcpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnZmlyZWJhc2UtYXV0aCc7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJy9ub2RlX21vZHVsZXMvQGZpcmViYXNlL3N0b3JhZ2UnKSB8fCBpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy9maXJlYmFzZS9zdG9yYWdlJykpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdmaXJlYmFzZS1zdG9yYWdlJztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy9AZmlyZWJhc2UvZnVuY3Rpb25zJykgfHwgaWQuaW5jbHVkZXMoJy9ub2RlX21vZHVsZXMvZmlyZWJhc2UvZnVuY3Rpb25zJykpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdmaXJlYmFzZS1mdW5jdGlvbnMnO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCcvbm9kZV9tb2R1bGVzL0BmaXJlYmFzZS9hcHAnKSB8fCBpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy9maXJlYmFzZS9hcHAnKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ2ZpcmViYXNlLWNvcmUnO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy9yZWFjdC8nKSB8fCBpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy9yZWFjdC1kb20vJykgfHwgaWQuaW5jbHVkZXMoJy9ub2RlX21vZHVsZXMvcmVhY3Qtcm91dGVyLWRvbS8nKSB8fCBpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy9yZWFjdC1pMThuZXh0LycpIHx8IGlkLmluY2x1ZGVzKCcvbm9kZV9tb2R1bGVzL2kxOG5leHQvJykpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdyZWFjdC12ZW5kb3InO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCcvbm9kZV9tb2R1bGVzL3hsc3gvJykpIHtcclxuICAgICAgICAgICAgcmV0dXJuICd4bHN4LXZlbmRvcic7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJy9ub2RlX21vZHVsZXMvanNwZGYvJykgfHwgaWQuaW5jbHVkZXMoJy9ub2RlX21vZHVsZXMvanNwZGYtYXV0b3RhYmxlLycpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAnanNwZGYtdmVuZG9yJztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy9wZGZqcy1kaXN0LycpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAncGRmanMtdmVuZG9yJztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy9kYXRlLWZucy8nKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gJ2RhdGUtdmVuZG9yJztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy9sdWNpZGUtcmVhY3QvJykpIHtcclxuICAgICAgICAgICAgcmV0dXJuICdpY29ucy12ZW5kb3InO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0sXHJcblxyXG4gIHNlcnZlcjoge1xyXG4gICAgcG9ydDogMzAwMCxcclxuICAgIHN0cmljdFBvcnQ6IHRydWUsXHJcbiAgICBob3N0OiB0cnVlLFxyXG4gICAgYWxsb3dlZEhvc3RzOiBbXHJcbiAgICAgICdsb2NhbGhvc3QnLFxyXG4gICAgICAnLmFwcC5naXRodWIuZGV2JyxcclxuICAgICAgJy5jc2IuYXBwJyxcclxuICAgICAgJ2ZmcXpuaC0zMDAwLmNzYi5hcHAnXHJcbiAgICBdLFxyXG4gICAgLy8gaG1yOiB7XHJcbiAgICAvLyAgIGNsaWVudFBvcnQ6IDQ0MywgXHJcbiAgICAvLyB9LFxyXG4gIH0sXHJcblxyXG4gIGRlZmluZToge1xyXG4gICAgLy8gSW5qZWN0ZWVydCBkZSBhcHBJZCBpbiBkZSBnbG9iYWxlIHNjb3BlIHZhbiBkZSBhcHBsaWNhdGllXHJcbiAgICBfX2FwcF9pZDogSlNPTi5zdHJpbmdpZnkoJ2ZpdHRpbmdzLWFwcC12MScpLFxyXG4gICAgJ2ltcG9ydC5tZXRhLmVudi5WSVRFX0FQUF9WRVJTSU9OJzogSlNPTi5zdHJpbmdpZnkocHJvY2Vzcy5lbnYuVklURV9BUFBfVkVSU0lPTiB8fCB2ZXJzaW9uKSxcclxuICB9LFxyXG59KTsiLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIkQ6XFxcXEFudHlncmF2aXR5XFxcXEZQSS1GdXR1cmUtRmFjdG9yeS1qdWxpLWF1Z3VzdHVzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJEOlxcXFxBbnR5Z3Jhdml0eVxcXFxGUEktRnV0dXJlLUZhY3RvcnktanVsaS1hdWd1c3R1c1xcXFx2aXRlLnB3YS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L0FudHlncmF2aXR5L0ZQSS1GdXR1cmUtRmFjdG9yeS1qdWxpLWF1Z3VzdHVzL3ZpdGUucHdhLmNvbmZpZy50c1wiO2ltcG9ydCB7IFZpdGVQV0FPcHRpb25zIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJztcclxuXHJcbmV4cG9ydCBjb25zdCBwd2FDb25maWc6IFBhcnRpYWw8Vml0ZVBXQU9wdGlvbnM+ID0ge1xyXG4gIHJlZ2lzdGVyVHlwZTogJ2F1dG9VcGRhdGUnLFxyXG4gIGluamVjdFJlZ2lzdGVyOiAnYXV0bycsXHJcbiAgd29ya2JveDoge1xyXG4gICAgZ2xvYlBhdHRlcm5zOiBbJyoqLyoue2pzLGNzcyxodG1sLGljbyxwbmcsc3ZnLGpzb24sd29mZix3b2ZmMn0nXSxcclxuICAgIHJ1bnRpbWVDYWNoaW5nOiBbXHJcbiAgICAgIHtcclxuICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcL2ZpcmVzdG9yZVxcLmdvb2dsZWFwaXNcXC5jb21cXC8uKi9pLFxyXG4gICAgICAgIGhhbmRsZXI6ICdOZXR3b3JrRmlyc3QnLFxyXG4gICAgICAgIG9wdGlvbnM6IHtcclxuICAgICAgICAgIGNhY2hlTmFtZTogJ2ZpcmVzdG9yZS1jYWNoZScsXHJcbiAgICAgICAgICBleHBpcmF0aW9uOiB7XHJcbiAgICAgICAgICAgIG1heEVudHJpZXM6IDUwLFxyXG4gICAgICAgICAgICBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiA3LCAvLyAxIHdlZWtcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZToge1xyXG4gICAgICAgICAgICBzdGF0dXNlczogWzAsIDIwMF0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICAgIHtcclxuICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcL3N0b3JhZ2VcXC5nb29nbGVhcGlzXFwuY29tXFwvLiovaSxcclxuICAgICAgICBoYW5kbGVyOiAnQ2FjaGVGaXJzdCcsXHJcbiAgICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgICAgY2FjaGVOYW1lOiAnc3RvcmFnZS1jYWNoZScsXHJcbiAgICAgICAgICBleHBpcmF0aW9uOiB7XHJcbiAgICAgICAgICAgIG1heEVudHJpZXM6IDMwLFxyXG4gICAgICAgICAgICBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzMCwgLy8gMzAgZGFnZW5cclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZToge1xyXG4gICAgICAgICAgICBzdGF0dXNlczogWzAsIDIwMF0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICBdLFxyXG4gIH0sXHJcbiAgaW5jbHVkZUFzc2V0czogWydmYXZpY29uLmljbycsICdhcHBsZS10b3VjaC1pY29uLnBuZycsICdtYXNrZWQtaWNvbi5zdmcnXSxcclxuICBtYW5pZmVzdDoge1xyXG4gICAgbmFtZTogJ0ZQaSBGdXR1cmUgRmFjdG9yeSBIdWInLFxyXG4gICAgc2hvcnRfbmFtZTogJ0ZQaSBGYWN0b3J5JyxcclxuICAgIGRlc2NyaXB0aW9uOiAnTWFudWZhY3R1cmluZyBFeGVjdXRpb24gU3lzdGVtIHZvb3IgRlBpIEZ1dHVyZSBGYWN0b3J5JyxcclxuICAgIHRoZW1lX2NvbG9yOiAnIzBmMTcyYScsXHJcbiAgICBiYWNrZ3JvdW5kX2NvbG9yOiAnI2ZmZmZmZicsXHJcbiAgICBkaXNwbGF5OiAnc3RhbmRhbG9uZScsXHJcbiAgICBvcmllbnRhdGlvbjogJ2FueScsXHJcbiAgICBzY29wZTogJy8nLFxyXG4gICAgc3RhcnRfdXJsOiAnLycsXHJcbiAgICBpY29uczogW1xyXG4gICAgICB7IHNyYzogJ2Zhdmljb24uaWNvJywgc2l6ZXM6ICc2NHg2NCAzMngzMiAyNHgyNCAxNngxNicsIHR5cGU6ICdpbWFnZS94LWljb24nIH0sXHJcbiAgICAgIHsgc3JjOiAnbG9nbzE5Mi5wbmcnLCB0eXBlOiAnaW1hZ2UvcG5nJywgc2l6ZXM6ICcxOTJ4MTkyJyB9LFxyXG4gICAgICB7IHNyYzogJ2xvZ281MTIucG5nJywgdHlwZTogJ2ltYWdlL3BuZycsIHNpemVzOiAnNTEyeDUxMicsIHB1cnBvc2U6ICdhbnkgbWFza2FibGUnIH1cclxuICAgIF0sXHJcbiAgfSxcclxufTsiXSwKICAibWFwcGluZ3MiOiAiO0FBQXFVLFNBQVMsb0JBQW9CO0FBQ2xXLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyxxQkFBcUI7QUFDOUIsT0FBTyxRQUFRO0FBQ2YsU0FBUyxlQUFlOzs7QUNIakIsSUFBTSxZQUFxQztBQUFBLEVBQ2hELGNBQWM7QUFBQSxFQUNkLGdCQUFnQjtBQUFBLEVBQ2hCLFNBQVM7QUFBQSxJQUNQLGNBQWMsQ0FBQyxnREFBZ0Q7QUFBQSxJQUMvRCxnQkFBZ0I7QUFBQSxNQUNkO0FBQUEsUUFDRSxZQUFZO0FBQUEsUUFDWixTQUFTO0FBQUEsUUFD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
