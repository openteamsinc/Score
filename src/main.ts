import fetchPackageScore, { CategorizedScore } from './fetch/fetchPackageScore';
import core from '@actions/core';

import { parseRequirements, StandardRequirement } from './pypi/parseRequirements';
import * as fs from 'fs/promises';
import getLine from './utils/getLine';
import fetchNoteDescriptions, { NoteDescrs } from './fetch/fetchNoteDescriptions';

const ScoreValues = {
  HEALTHY: 'Healthy',
  MATURE: 'Mature',
  CAUTION_NEEDED: 'Caution Needed',
  MODERATE_RISK: 'Moderate Risk',
  HIGH_RISK: 'High Risk',
  EXPERIMENTAL: 'Experimental',
  STALE: 'Stale',
  LEGACY: 'Legacy',
  UNKNOWN: 'Unknown',
  PLACEHOLDER: 'Placeholder',
};

const noLog = (message: string, properties: unknown) => {};

function getLog(status: string) {
  switch (status) {
    case ScoreValues.MATURE:
    case ScoreValues.HEALTHY:
      return noLog;
    case ScoreValues.HIGH_RISK:
    case ScoreValues.UNKNOWN:
      return core.error;
    case ScoreValues.PLACEHOLDER:
    case ScoreValues.CAUTION_NEEDED:
      return core.notice;
    default:
      return core.warning;
  }
}

function createMessage(noteDescriptions: NoteDescrs, name: string, category: string, catScore: CategorizedScore): [string, string] {
  const { value, notes } = catScore;
  const messages = notes.map((code) => noteDescriptions[code]?.description || code).join('\n');
  const message = `Notes:\n${messages}`;
  const title = `${category}: ${value} - ${name}`;
  return [title, message];
}

async function main() {
  const filePath = 'requirements.txt';
  const noteDescriptions = await fetchNoteDescriptions();
  const content = await fs.readFile(filePath, { encoding: 'utf-8' });

  const postNotice = ({ name, score }) => {
    const lineNumber = getLine(content, name);

    for (const category of ['maturity', 'health_risk', 'security', 'legal']) {
      const logFn = getLog(score[category].value);
      const [title, message] = createMessage(noteDescriptions, name, category, score[category]);
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
    .filter((req): req is StandardRequirement => req.type === 'requirement')
    .map(({ name }) => {
      return fetchPackageScore('pypi', name)
        .then(({ score }) => ({
          name,
          score,
        }))
        .then(postNotice);
    });

  await Promise.all(pScores);
}

main();
