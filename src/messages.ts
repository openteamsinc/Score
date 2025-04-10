import core from "@actions/core";
import { CategorizedScore, ScoreValues } from "./fetch/fetchPackageScore";
import { NoteDescrs } from "./fetch/fetchNoteDescriptions";

const noLog = () => {};

export function getLog(status: string) {
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

export function createMessage(
  noteDescriptions: NoteDescrs,
  name: string,
  category: string,
  catScore: CategorizedScore,
): [string, string] {
  const { value, notes } = catScore;
  const messages = notes
    .map((code) => noteDescriptions[code]?.description || code)
    .join("\n");
  const message = `\n * ${messages}`;
  const title = `${category}: ${value} - ${name}`;
  return [title, message];
}
