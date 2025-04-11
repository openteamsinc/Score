import core from "@actions/core";

import {
  parseRequirements,
  StandardRequirement,
} from "../pypi/parseRequirements";
import exists from "./exists";

export function packageJSONParser(content: string): string[] {
  const parsedContent = JSON.parse(content);
  const dependencies = {
    ...parsedContent.dependencies,
    ...parsedContent.devDependencies,
  };
  return Object.keys(dependencies).filter((key) => key.length > 0);
}

export function requirementsParser(content: string): string[] {
  const reqs = parseRequirements(content);
  return reqs
    .filter((req): req is StandardRequirement => req.type === "requirement")
    .map(({ name }) => name);
}

export function getCLIOption(opt: string): string | null {
  // First check command line arguments
  const args = process.argv.slice(2);
  const cliOpt = `--${opt}`;
  const cliArgIndex = args.findIndex((arg) => arg === cliOpt);

  if (cliArgIndex !== -1 && cliArgIndex < args.length - 1) {
    const value = args[cliArgIndex + 1];
    return value;
  }
  return null;
}

export async function getFileOption(opt: string, fallback: string) {
  const value: string | null = getCLIOption(opt) || core.getInput(opt);
  if (value === "false") {
    return null;
  }
  if (value.length > 0) {
    return value;
  }
  if (await exists(fallback)) {
    return fallback;
  }
  return null;
}
