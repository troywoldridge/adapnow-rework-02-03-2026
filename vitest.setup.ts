// Vitest setup: mock server-only (it throws in Node/test context)
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
