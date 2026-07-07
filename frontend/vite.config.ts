import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    hmr: process.env.NODE_ENV === "production" ? false : true,
    host: true,
    //https: {
    //  key: fs.readFileSync("./192.168.0.6-key.pem"),
    //  cert: fs.readFileSync("./192.168.0.6.pem"),
    //},
  },
});
