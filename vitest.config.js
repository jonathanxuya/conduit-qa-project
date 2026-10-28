import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "frontend/src/setupTests.js",
    css: true,
    coverage: {
      provider: "v8",
      // lcov lo consume SonarCloud; text/json-summary sirven para el reporte del pipeline.
      reporter: ["text", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      include: ["backend/**/*.js", "frontend/src/**/*.{js,jsx}"],
      exclude: [
        "**/*.test.{js,jsx}",
        "backend/test-utils/**",
        "backend/migrations/**",
        "backend/seeders/**",
        "frontend/src/setupTests.js",
        "frontend/src/reportWebVitals.js",
      ],
    },
  },
});
