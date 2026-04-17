import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const helloPath = resolve(__dirname, "..", "hello.md");

describe("hello.md smoke test", () => {
  it("exists at the repo root", () => {
    expect(existsSync(helloPath)).toBe(true);
  });

  it("contains the expected heading", () => {
    const contents = readFileSync(helloPath, "utf8");
    expect(contents).toMatch(/^# Hello from the Factory$/m);
  });
});
