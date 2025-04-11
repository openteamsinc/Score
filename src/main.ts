import core from "@actions/core";
import { context } from "@actions/github";
import fetchPackageScore, {
  getCategorizedScores,
  Score,
} from "./fetch/fetchPackageScore";

import fs from "fs/promises";
import getLine from "./utils/getLine";
import fetchNoteDescriptions from "./fetch/fetchNoteDescriptions";
import { createMessage, getLog } from "./messages";
import { pyprojectParser } from "./pypi/pyprojectParser";
import { getModifiedLines } from "./utils/diffUtils";
import {
  getCLIOption,
  getFileOption,
  packageJSONParser,
  requirementsParser,
} from "./utils/cli";

async function makeNoticeFn(filePath: string) {
  const noteDescriptions = await fetchNoteDescriptions();
  const postNotice = ({
    name,
    score,
    lineNumber,
  }: {
    name: string;
    score: Score;
    lineNumber: number;
  }) => {
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

export function getBaseRef(): string | null {
  return context.payload.pull_request?.["base"]?.ref || null;
}

async function getLinesToProcess(
  filePath: string,
  branchOrBoolFlag: string,
): Promise<number[] | null> {
  if (branchOrBoolFlag === "") {
    return null;
  }
  if (branchOrBoolFlag === "false") {
    return null;
  }
  const baseRef = branchOrBoolFlag === "true" ? getBaseRef() : branchOrBoolFlag;
  if (baseRef == null) {
    core.setFailed(
      `Error: Unable to determine the base branch. either from github or diff-only option`,
    );
    return null;
  }

  return getModifiedLines(filePath, baseRef);
}

type ParserFN = (content: string) => string[];
async function run(
  ecosystem: string,
  filePath: string,
  parser: ParserFN,
  diffOnly: string,
) {
  const content = await fs.readFile(filePath, { encoding: "utf-8" });
  const linesToProcess = await getLinesToProcess(filePath, diffOnly);

  const reqs = parser(content);

  const postNotice = await makeNoticeFn(filePath);

  const pScores = reqs.map(async (name) => {
    let lineNumber = getLine(content, name);
    if (lineNumber == null && linesToProcess != null) {
      console.warn(
        `Warning: diff-only option is set, but ${name} was not found in the diff`,
      );
      return;
    }

    if (lineNumber == null) {
      lineNumber = 0;
    }

    if (linesToProcess != null && !linesToProcess.includes(lineNumber)) {
      console.info(`Skipping ${name} as it is not modified in the diff`);
      return;
    }

    const { score } = await fetchPackageScore(ecosystem, name);
    return postNotice({ name, score, lineNumber });
  });

  await Promise.all(pScores);
}

async function main() {
  const diffOnly: string =
    getCLIOption("diff-only") || core.getInput("diff-only");

  const requirements = await getFileOption(
    "requirements-txt",
    "requirements.txt",
  );
  if (requirements != null) {
    run("pypi", requirements, requirementsParser, diffOnly);
  } else {
    console.log("No requirements.txt file found.");
  }

  const pyproject = await getFileOption("pyproject-toml", "pyproject.toml");
  if (pyproject != null) {
    run("pypi", pyproject, pyprojectParser, diffOnly);
  } else {
    console.log("No pyproject.toml file found.");
  }
  const packageJSON = await getFileOption("package-json", "package.json");
  if (packageJSON != null) {
    run("npm", packageJSON, packageJSONParser, diffOnly);
  } else {
    console.log("No package.json file found.");
  }
}

main();
