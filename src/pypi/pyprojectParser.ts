import { TOML } from "bun";
import { parseRequirement } from "./parseRequirements";

type PyProjectToml = {
  project?: {
    dependencies?: string[];
  };
  tool?: {
    poetry?: {
      dependencies?: Record<string, any>;
      dev_dependencies?: Record<string, any>;
    };
  };
};

export function pyprojectParser(content: string): string[] {
  const parsedContent = TOML.parse(content) as PyProjectToml;
  const dependencies = [];

  // Standard pyproject.toml dependencies - PEP 621
  if (Array.isArray(parsedContent.project?.dependencies)) {
    for (const dep of parsedContent.project.dependencies) {
      // Extract just the package name from dependency strings
      const req = parseRequirement(dep);
      if (req != null && req.type === "requirement" && req.name) {
        dependencies.push(req.name);
      }
    }
  }

  // Poetry dependencies
  if (parsedContent.tool?.poetry?.dependencies) {
    Object.keys(parsedContent.tool.poetry.dependencies)
      .filter((key) => key !== "python" && key.length > 0)
      .forEach((key) => dependencies.push(key));
  }

  // Poetry dev dependencies
  if (parsedContent.tool?.poetry?.dev_dependencies) {
    Object.keys(parsedContent.tool.poetry.dev_dependencies)
      .filter((key) => key.length > 0)
      .forEach((key) => dependencies.push(key));
  }

  return dependencies;
}
