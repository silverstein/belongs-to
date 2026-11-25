import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { eveVite } from "eve/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), eveVite({ eveBuildCommand: "npm run build:eve" })],
  resolve: { alias: { "@": fileURLToPath(new URL("./web", import.meta.url)) } },
  define: {
    __BELONGS_TO_PASSWORD_REQUIRED__: JSON.stringify(
      Boolean(process.env.BELONGS_TO_PASSWORD || (process.env.VERCEL && process.env.VERCEL_ENV !== "development")),
    ),
  },
});
