import { exec } from "child_process";
import util from "util";
import core from "@actions/core";
import exists from "./exists";

const execPromise = util.promisify(exec);

/**
 * Fetches the base branch from the remote
 * @param baseRef The base branch reference to fetch
 * @throws Error if the fetch operation fails
 */
export async function fetchBaseBranch(baseRef: string): Promise<void> {
  try {
    await execPromise(`git fetch origin ${baseRef}`);
  } catch (error) {
    throw new Error(
      `Failed to fetch origin/${baseRef}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Gets the diff between the base branch and HEAD for a specific file
 * @param baseRef The base branch reference
 * @param filePath Path to the file to diff
 * @returns The diff output
 * @throws Error if the diff operation fails
 */
export async function getFileDiff(
  baseRef: string,
  filePath: string,
): Promise<string> {
  try {
    console.debug(`git diff origin/${baseRef} HEAD -- ${filePath}`);
    const { stdout } = await execPromise(
      `git diff --no-color origin/${baseRef} HEAD -- ${filePath}`,
    );
    console.log(stdout);
    return stdout;
  } catch (error) {
    throw new Error(
      `Failed to get diff for ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Parses a git diff hunk header to extract the starting line number
 * @param hunkHeader The hunk header line (starts with @@)
 * @returns The starting line number or null if parsing fails
 */
export function parseHunkHeader(hunkHeader: string): number | null {
  const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(hunkHeader);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Parses the diff output to extract modified line numbers
 * @param diffOutput The diff output from git
 * @returns An object containing the modified line numbers and whether a hunk header was found
 */

export function parseModifiedLines(diffOutput: string): {
  modifiedLines: number[];
  foundHunkHeader: boolean;
} {
  const patchLines = diffOutput.split("\n");
  const modifiedLines: number[] = [];
  let lineNumber = 0;
  let foundHunkHeader = false;

  for (const line of patchLines) {
    // Trim whitespace from the beginning of the line for more robust parsing
    const trimmedLine = line.trimStart();

    if (trimmedLine.startsWith("@@")) {
      foundHunkHeader = true;
      const parsedLineNumber = parseHunkHeader(trimmedLine);
      if (parsedLineNumber !== null) {
        lineNumber = parsedLineNumber;
      }
    } else if (trimmedLine.startsWith("+") && !trimmedLine.startsWith("+++")) {
      modifiedLines.push(lineNumber);
      lineNumber++;
    } else if (!trimmedLine.startsWith("-")) {
      lineNumber++;
    }
  }

  return { modifiedLines, foundHunkHeader };
}

/**
 * Gets the modified lines for a specific file in a pull request
 * @param filePath Path to the file to check
 * @param baseRef The base branch reference
 * @returns Array of modified line numbers
 */
export async function getModifiedLines(
  filePath: string,
  baseRef: string,
): Promise<number[]> {
  try {
    // Validate file path
    if (!(await exists(filePath))) {
      core.warning(`File ${filePath} does not exist or cannot be accessed`);
      return [];
    }

    // Fetch base branch and get diff
    try {
      await fetchBaseBranch(baseRef);
      const diffOutput = await getFileDiff(baseRef, filePath);

      // Parse modified lines
      const { modifiedLines, foundHunkHeader } = parseModifiedLines(diffOutput);

      if (!foundHunkHeader && diffOutput.trim() !== "") {
        core.warning(
          `No diff hunks found for ${filePath}, but diff output was not empty`,
        );
      }
      console.log(
        `Found ${modifiedLines.length} modified lines in ${filePath}`,
      );
      return modifiedLines;
    } catch (error) {
      core.warning(`${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  } catch (error) {
    core.error(
      `Unexpected error in getModifiedLines: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}
