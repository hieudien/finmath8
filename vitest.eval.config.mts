import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Đo chất lượng AI thật (tốn tiền, cần GEMINI_KEY trong .env). Chạy: npm run eval. Không nằm trong `npm test`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { include: ["evals/**/*.eval.ts"], testTimeout: 1_800_000, fileParallelism: false },
});
