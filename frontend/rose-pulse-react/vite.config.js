import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const proxyOrigin = process.env.VITE_DEMO_PROXY_ORIGIN || "http://127.0.0.1:5206";
const demoPort = Number(process.env.VITE_DEMO_PORT || 5205);
// Preserve Host and Origin so the reviewed loopback proxy can enforce same-origin writes.
const proxy = {
  "/api/v1": { target: proxyOrigin, changeOrigin: false },
  "/api/v2": { target: proxyOrigin, changeOrigin: false },
  "/uploads": { target: proxyOrigin, changeOrigin: false },
};
export default defineConfig({
  plugins: [
    {
      name: "rose-public-shell",
      generateBundle(_, bundle) {
        const assets = [
          "/index.html",
          "/icon.svg",
          "/manifest.webmanifest",
          "/images/community-lake.jpg",
          ...Object.keys(bundle)
            .filter(
              (path) => path.startsWith("assets/") && /\.(js|css)$/.test(path),
            )
            .map((path) => `/${path}`),
        ];
        const hash = createHash("sha256").update(assets.join("\n"));
        for (const file of [
          "public/icon.svg",
          "public/manifest.webmanifest",
          "public/images/community-lake.jpg",
          "src/pwa/sw-template.js",
        ])
          hash.update(readFileSync(new URL(file, import.meta.url)));
        const revision = hash.digest("hex").slice(0, 16);
        const source = readFileSync(
          new URL("./src/pwa/sw-template.js", import.meta.url),
          "utf8",
        )
          .replace("__REVISION__", revision)
          .replace("__SHELL_ASSETS__", JSON.stringify(assets));
        this.emitFile({ type: "asset", fileName: "sw.js", source });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: demoPort,
    strictPort: true,
    proxy,
    fs: { allow: [".."] },
  },
  preview: { host: "127.0.0.1", port: demoPort, strictPort: true, proxy },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.js"],
    restoreMocks: true,
  },
});
