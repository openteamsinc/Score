import core from "@actions/core";
import fetchPackageScore, {
  getCategorizedScores,
  Score,
} from "./fetch/fetchPackageScore";

import {
  parseRequirements,
  StandardRequirement,
} from "./pypi/parseRequirements";
import * as fs from "fs/promises";
import getLine from "./utils/getLine";
import fetchNoteDescriptions from "./fetch/fetchNoteDescriptions";
import { createMessage, getLog } from "./messages";

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

type ParserFN = (content: string) => Promise<string[]>;
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

async function getFileOption(opt: string, fallback: string) {
  const value: string | null = core.getInput(opt);
  if (value === "false") {
    return null;
  }
  if (value.length > 0) {
    return value;
  }
  if (await fs.exists(fallback)) {
    return fallback;
  }
  return null;
}

async function requirementsParser(content: string): Promise<string[]> {
  const reqs = await parseRequirements(content);
  return reqs
    .filter((req): req is StandardRequirement => req.type === "requirement")
    .map(({ name }) => name);
}

async function main() {
  const requirements = await getFileOption(
    "requirements-txt",
    "requirements.txt",
  );
  if (requirements != null) {
    run("pypi", requirements, requirementsParser);
  }

  // const packageJSON = core.getInput("package-json");
  // const diff_only = core.getInput("annotate-diff-only");
}

main();
