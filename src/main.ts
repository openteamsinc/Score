import core from "@actions/core";
import fetchPackageScore, {
  getCategorizedScores,
  Score,
} from "./fetch/fetchPackageScore";

import {
  parseRequirements,
  StandardRequirement,
} from "./pypi/parseRequirements";
import fs from "fs/promises";
import getLine from "./utils/getLine";
import fetchNoteDescriptions from "./fetch/fetchNoteDescriptions";
import { createMessage, getLog } from "./messages";
import { pyprojectParser } from "./pypi/pyprojectParser";

async function makeNoticeFn(filePath: string, content: string) {
  const noteDescriptions = await fetchNoteDescriptions();
  const postNotice = ({ name, score }: { name: string; score: Score }) => {
    const lineNumber = getLine(content, name);

    for (const [category, categoryScore] of getCategorizedScores(score)) {
      const logFn = getLog(categoryScore.value);
      const [title, message] = createMessage(
        noteDescriptions,
        name,
        category,
        categoryScore,
      );
      logFn(message, {
        title,
        file: filePath,
        startLine: lineNumber,
        endLine: lineNumber,
      });
    }
  };
  return postNotice;
}

type ParserFN = (content: string) => string[];
async function run(ecosystem: string, filePath: string, parser: ParserFN) {
  const content = await fs.readFile(filePath, { encoding: "utf-8" });

  const reqs = await parser(content);

  const postNotice = await makeNoticeFn(filePath, content);

  const pScores = reqs.map(async (name) => {
    const { score } = await fetchPackageScore(ecosystem, name);
    return postNotice({ name, score });
  });

  await Promise.all(pScores);
}

function packageJSONParser(content: string): string[] {
  const parsedContent = JSON.parse(content);
  const dependencies = {
    ...parsedContent.dependencies,
    ...parsedContent.devDependencies,
  };
  return Object.keys(dependencies).filter((key) => key.length > 0);
}

function requirementsParser(content: string): string[] {
  const reqs = parseRequirements(content);
  return reqs
    .filter((req): req is StandardRequirement => req.type === "requirement")
    .map(({ name }) => name);
}

function getCLIOption(opt: string): string | null {
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

async function exists(filename: string): Promise<boolean> {
  try {
    await fs.stat(filename);
    return true;
  } catch (error) {
    // Only return false for ENOENT (file not found) errors
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    // Re-throw any other errors (permission issues, etc.)
    throw error;
  }
}
async function getFileOption(opt: string, fallback: string) {
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

async function main() {
  const requirements = await getFileOption(
    "requirements-txt",
    "requirements.txt",
  );
  if (requirements != null) {
    run("pypi", requirements, requirementsParser);
  } else {
    console.log("No requirements.txt file found.");
  }

  const pyproject = await getFileOption("pyproject-toml", "pyproject.toml");
  if (pyproject != null) {
    run("pypi", pyproject, pyprojectParser);
  } else {
    console.log("No pyproject.toml file found.");
  }
  const packageJSON = await getFileOption("package-json", "package.json");
  if (packageJSON != null) {
    run("npm", packageJSON, packageJSONParser);
  } else {
    console.log("No package.json file found.");
  }
}

main();
