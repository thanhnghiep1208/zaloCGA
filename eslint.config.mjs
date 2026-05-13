import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: "ikc/pragmatic-react-hooks",
    rules: {
      // Hydration gates, auth redirects, theme init, and Firestore guards often set local state once in an effect.
      "react-hooks/set-state-in-effect": "off",
      // React Compiler rule conflicts with intentional memoization in providers and report summaries.
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
