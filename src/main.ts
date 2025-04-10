import fetchPackageScore, { CategorizedScore } from "./fetch/fetchPackageScore";
import core from "@actions/core";

import {
  parseRequirements,
  StandardRequirement,
} from "./pypi/parseRequirements";
import * as fs from "fs/promises";
import getLine from "./utils/getLine";
import fetchNoteDescriptions from "./fetch/fetchNoteDescriptions";
import { createMessage, getLog } from "./messages";

async function main() {
  const filePath = "requirements.txt";
  const noteDescriptions = await fetchNoteDescriptions();
  const content = await fs.readFile(filePath, { encoding: "utf-8" });

  const postNotice = ({ name, score }) => {
    const lineNumber = getLine(content, name);

    for (const category of ["maturity", "health_risk", "security", "legal"]) {
      const logFn = getLog(score[category].value);
      const [title, message] = createMessage(
        noteDescriptions,
        name,
        category,
        score[category]
      );
      logFn(message, {
        title,
        file: filePath,
        startLine: lineNumber,
        endLine: lineNumber,
      });
    }
  };

  const reqs = await parseRequirements(content);

  const pScores = reqs
    .filter((req): req is StandardRequirement => req.type === "requirement")
    .map(({ name }) => {
      return fetchPackageScore("pypi", name)
        .then(({ score }) => ({
          name,
          score,
        }))
        .then(postNotice);
    });

  await Promise.all(pScores);
}

main();
