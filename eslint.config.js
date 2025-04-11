import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-plugin-prettier";

export default tseslint.config([
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    extends: [eslint.configs.recommended],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    extends: [tseslint.configs.recommended],
  },
  {
    plugins: {
      prettier,
    },
    rules: {
      "prettier/prettier": [
        1,
        {
          endOfLine: "lf",
          // printWidth: 180,
          semi: true,
          // tabWidth: 2,
          trailingComma: "all",
        },
      ],
    },
  },
]);
