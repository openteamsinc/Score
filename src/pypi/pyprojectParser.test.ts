import { describe, expect, it } from "bun:test";
import { pyprojectParser } from "./pyprojectParser";

describe("pyprojectParser", () => {
  it("should parse standard PEP 621 dependencies", () => {
    const content = `
[project]
dependencies = [
  "requests",
  "flask>=2.0.0",
  "numpy==1.21.0",
  "pandas[excel]"
]
`;
    const result = pyprojectParser(content);
    expect(result).toEqual(["requests", "flask", "numpy", "pandas"]);
  });

  it("should parse Poetry dependencies", () => {
    const content = `
[tool.poetry]
name = "my-project"
version = "0.1.0"

[tool.poetry.dependencies]
python = "^3.8"
requests = "*"
flask = ">=2.0.0"
numpy = "1.21.0"
`;
    const result = pyprojectParser(content);
    expect(result).toEqual(["requests", "flask", "numpy"]);
  });

  it("should parse Poetry dev dependencies", () => {
    const content = `
[tool.poetry]
name = "my-project"
version = "0.1.0"

[tool.poetry.dev_dependencies]
pytest = "^6.0.0"
black = "^21.5b2"
mypy = "^0.812"
`;
    const result = pyprojectParser(content);
    expect(result).toEqual(["pytest", "black", "mypy"]);
  });

  it("should parse both standard and Poetry dependencies", () => {
    const content = `
[project]
dependencies = [
  "requests",
  "flask>=2.0.0"
]

[tool.poetry.dependencies]
python = "^3.8"
numpy = "1.21.0"
pandas = "*"

[tool.poetry.dev_dependencies]
pytest = "^6.0.0"
`;
    const result = pyprojectParser(content);
    expect(result).toEqual(["requests", "flask", "numpy", "pandas", "pytest"]);
  });

  it("should handle empty dependencies", () => {
    const content = `
[project]
name = "my-project"
version = "0.1.0"
`;
    const result = pyprojectParser(content);
    expect(result).toEqual([]);
  });

  it("should handle complex dependency specifications", () => {
    const content = `
[project]
dependencies = [
  "django>2.1; os_name != 'nt'",
  "gidgethub[httpx]>4.0.0",
  "requests[security,socks]>=2.18.4"
]
`;
    const result = pyprojectParser(content);
    expect(result).toEqual(["django", "gidgethub", "requests"]);
  });
});
