import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Also expose NEXT_PUBLIC_* values to the browser. These names are public by convention,
  // just like VITE_*; secret server-only keys remain unexposed.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
});
