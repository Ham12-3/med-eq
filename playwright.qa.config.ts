import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// pnpm qa:roles: the M6 role walkthrough in qa/, on the same server and test database as e2e.
export default defineConfig({ ...base, testDir: "qa", testMatch: "*.qa.ts", use: { ...base.use, trace: "off" } });
