import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    hmr: {
      clientPort: 443,
    },
    host: true,
    allowedHosts: ["eliminate-gibberish-sponge.ngrok-free.dev"],
  },
});
