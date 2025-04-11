import { test, expect, describe } from "bun:test";
import { parseHunkHeader, parseModifiedLines } from "./diffUtils";

describe("parseHunkHeader", () => {
  test("parses standard hunk header format", () => {
    const header = "@@ -1,7 +8,4 @@";
    expect(parseHunkHeader(header)).toBe(8);
  });

  test("parses hunk header without comma in second part", () => {
    const header = "@@ -1,7 +8 @@";
    expect(parseHunkHeader(header)).toBe(8);
  });

  test("parses hunk header without comma in first part", () => {
    const header = "@@ -1 +8,4 @@";
    expect(parseHunkHeader(header)).toBe(8);
  });

  test("parses hunk header without commas", () => {
    const header = "@@ -1 +8 @@";
    expect(parseHunkHeader(header)).toBe(8);
  });

  test("parses hunk header with larger numbers", () => {
    const header = "@@ -145,12 +156,23 @@";
    expect(parseHunkHeader(header)).toBe(156);
  });

  test("returns null for invalid hunk header", () => {
    const header = "@@ invalid format @@";
    expect(parseHunkHeader(header)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseHunkHeader("")).toBeNull();
  });

  test("handles hunk header with context", () => {
    const header = "@@ -15,7 +15,7 @@ function someContext() {";
    expect(parseHunkHeader(header)).toBe(15);
  });
});

describe("parseModifiedLines", () => {
  test("identifies added lines in a simple diff", () => {
    const diffOutput = `@@ -1,3 +1,5 @@
 const unchanged = true;
+const added1 = 'new line';
 const unchanged2 = false;
+const added2 = 'another new line';
 const unchanged3 = null;`;

    const result = parseModifiedLines(diffOutput);
    expect(result.modifiedLines).toEqual([2, 4]);
    expect(result.foundHunkHeader).toBe(true);
  });

  test("handles multiple hunks", () => {
    const diffOutput = `@@ -1,3 +1,4 @@
   const unchanged = true;
  +const added = 'new line';
   const unchanged2 = false;
   const unchanged3 = null;
  @@ -10,3 +11,5 @@
   function example() {
     return true;
   }
  +
  +const newFunction = () => {};`;

    // Add some debug logging
    const result = parseModifiedLines(diffOutput);

    expect(result.modifiedLines).toEqual([2, 14, 15]);
    expect(result.foundHunkHeader).toBe(true);
  });

  test("handles empty diff", () => {
    const diffOutput = "";
    const result = parseModifiedLines(diffOutput);
    expect(result.modifiedLines).toEqual([]);
    expect(result.foundHunkHeader).toBe(false);
  });

  test("handles diff with no actual changes", () => {
    const diffOutput = `diff --git a/file.ts b/file.ts
index 1234567..abcdefg 100644
--- a/file.ts
+++ b/file.ts`;

    const result = parseModifiedLines(diffOutput);
    expect(result.modifiedLines).toEqual([]);
    expect(result.foundHunkHeader).toBe(false);
  });

  test("handles removed lines correctly", () => {
    const diffOutput = `@@ -1,5 +1,3 @@
 const unchanged = true;
-const removed = 'to be removed';
 const unchanged2 = false;
-const alsoRemoved = 'going away';
 const unchanged3 = null;`;

    const result = parseModifiedLines(diffOutput);
    expect(result.modifiedLines).toEqual([]);
    expect(result.foundHunkHeader).toBe(true);
  });

  test("handles mixed additions and removals", () => {
    const diffOutput = `@@ -1,4 +1,4 @@
 const unchanged = true;
-const oldValue = 'original';
+const newValue = 'updated';
 const unchanged2 = false;
 const unchanged3 = null;`;

    const result = parseModifiedLines(diffOutput);
    expect(result.modifiedLines).toEqual([2]);
    expect(result.foundHunkHeader).toBe(true);
  });

  test("handles changes at file start", () => {
    const diffOutput = `@@ -0,0 +1,3 @@
+// New file
+const newVar = 'brand new';
+export default newVar;`;

    const result = parseModifiedLines(diffOutput);
    expect(result.modifiedLines).toEqual([1, 2, 3]);
    expect(result.foundHunkHeader).toBe(true);
  });
});
