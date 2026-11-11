import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { distributionManifest } from "../../scripts/rollup-distribution-manifest";

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({ exclude: ["@research-workbench/contracts"] }),
      distributionManifest("main")
    ],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "index.cjs"
        }
      }
    }
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({ exclude: ["@research-workbench/contracts"] }),
      distributionManifest("preload")
    ],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "index.cjs"
        }
      }
    }
  },
  renderer: {
    plugins: [react(), distributionManifest("renderer")]
  }
});
