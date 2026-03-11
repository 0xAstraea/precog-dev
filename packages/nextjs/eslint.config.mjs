import { defineConfig, globalIgnores } from "eslint/config";
import tsParser from "@typescript-eslint/parser";

export default defineConfig([globalIgnores([
    "**/.next",
    "**/node_modules/",
    "**/*.less",
    "**/*.css",
    "**/*.scss",
    "**/*.json",
    "**/*.png",
    "**/*.svg",
    "**/generated/**/*",
]), {
    languageOptions: {
        parser: tsParser,
    }
}]);