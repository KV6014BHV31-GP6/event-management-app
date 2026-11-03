import { defineConfig } from "vite";

// Preserve Host and Origin so the reviewed loopback proxy can enforce same-origin writes.
const proxy = {
  "/api/v1": { target: "http://127.0.0.1:5202", changeOrigin: false },
  "/uploads": { target: "http://127.0.0.1:5202", changeOrigin: false },
};
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5201,
    strictPort: true,
    proxy,
    fs: { allow: [".."] },
  },
  preview: { host: "127.0.0.1", port: 5201, strictPort: true, proxy },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.js"],
    restoreMocks: true,
  },
});
