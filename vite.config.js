import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// IMPORTANT : mets ici EXACTEMENT le nom de ton repo GitHub
// Exemple si ton repo s'appelle "genre-rater" :
const REPO_NAME = "genre-rater";

export default defineConfig({
  base: `/${REPO_NAME}/`,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["genres.txt", "pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "Genre Rater",
        short_name: "GenreRater",
        start_url: `/${REPO_NAME}/`,
        scope: `/${REPO_NAME}/`,
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          { src: `/${REPO_NAME}/pwa-192.png`, sizes: "192x192", type: "image/png" },
          { src: `/${REPO_NAME}/pwa-512.png`, sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// IMPORTANT: remplace par le nom de TON repo GitHub
const REPO_NAME = "genre-rater";

export default defineConfig({
  base: `/${REPO_NAME}/`,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["genres.txt", "pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "Genre Rater",
        short_name: "GenreRater",
        start_url: `/${REPO_NAME}/`,
        scope: `/${REPO_NAME}/`,
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          { src: `/${REPO_NAME}/pwa-192.png`, sizes: "192x192", type: "image/png" },
          { src: `/${REPO_NAME}/pwa-512.png`, sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
