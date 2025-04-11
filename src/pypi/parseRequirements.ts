// Assuming the Requirement types are defined in a separate file or above
// Re-defining here for completeness in this code block:

// Represents a standard package requirement (e.g., 'requests[security]>=2.8.1')
export type StandardRequirement = {
  type: "requirement";
  line: string; // Store original line for reference / complex parsing later
  name: string;
  extras?: string[];
  specifiers?: string[];
  marker?: string;
  hash_options?: string[];
};

// Represents an editable install (e.g., '-e .', '-e git+https://...')
type EditableRequirement = {
  type: "editable";
  line: string;
  path_or_url: string;
  is_vcs: boolean;
};

// Represents a direct URL or path to an archive (e.g., 'https://...', './pkg.whl', 'name @ https://...')
type ArchiveRequirement = {
  type: "archive";
  line: string;
  url_or_path: string;
  name?: string;
  hash_options?: string[];
};

// Represents a reference to another file (e.g., '-r base.txt', '-c constraints.txt')
type FileReferenceRequirement = {
  type: "file_reference";
  line: string;
  reference_type: "requirement" | "constraint";
  filename: string;
};

// Represents a pip command-line option (e.g., '--index-url ...')
type OptionRequirement = {
  type: "option";
  line: string;
  option_string: string;
};

// Discriminated union representing any single parsed line/directive
export type Requirement =
  | StandardRequirement
  | EditableRequirement
  | ArchiveRequirement
  | FileReferenceRequirement
  | OptionRequirement;

// The overall output: an array of parsed requirements/directives
export type Requirements = Requirement[];

// --- Helper Function ---

/**
 * Pre-processes raw file content to handle line continuations (\).
 * Joins lines ending with '\' with the subsequent line.
 * Also removes comments AFTER joining lines.
 */
function preprocessContent(content: string): string[] {
  const rawLines = content.split(/\r?\n/);
  const logicalLines: string[] = [];
  let currentLine = "";

  for (const rawLine of rawLines) {
    const trimmedLine = rawLine.trim();
    if (trimmedLine.endsWith("\\")) {
      currentLine += trimmedLine.slice(0, -1).trimEnd() + " "; // Append line part without '\', add space
    } else {
      currentLine += trimmedLine;
      // Process the completed logical line
      if (currentLine) {
        // Find comment start '#' that's not part of a URL fragment
        const commentMatch = currentLine.match(/(^|\s)#/);
        const commentIndex =
          commentMatch && commentMatch.index
            ? commentMatch.index + commentMatch[1].length
            : -1;

        if (commentIndex !== -1) {
          // Check if '#' is inside quotes (simplistic check)
          const beforeComment = currentLine.substring(0, commentIndex);
          const quoteCount = (beforeComment.match(/["']/g) || []).length;
          if (quoteCount % 2 === 0) {
            // Not inside quotes
            logicalLines.push(beforeComment.trim());
          } else {
            // Inside quotes, treat as part of the string
            logicalLines.push(currentLine);
          }
        } else {
          logicalLines.push(currentLine);
        }
      }
      currentLine = ""; // Reset for the next logical line
    }
  }
  // Add any remaining part if the file ends mid-continuation (unlikely but possible)
  if (currentLine.trim()) {
    logicalLines.push(currentLine.trim());
  }

  return logicalLines.filter((line) => line && !line.startsWith("#")); // Remove empty lines and full-line comments
}

// --- Main Parsing Function ---

/**
 * Parses a requirements file asynchronously.
 * Handles common pip requirements syntax including options, file references,
 * editable installs, archives/URLs, and standard package specifiers.
 * It also handles line continuations (\) and comments (#).
 *
 * @param filename The path to the requirements file.
 * @returns A Promise resolving to an array of Requirement objects.
 * @throws If the file cannot be read.
 */
export function parseRequirement(line: string): Requirement | null {
  const trimmedLine = line.trim(); // Already trimmed but good practice

  // 1. Check for Options (e.g., --index-url)
  if (trimmedLine.startsWith("--")) {
    return {
      type: "option",
      line: trimmedLine,
      option_string: trimmedLine,
    };
  }

  // 2. Check for File References (e.g., -r, -c)
  const fileRefMatch = trimmedLine.match(/^-(r|c)\s+(.+)/);
  if (fileRefMatch) {
    return {
      type: "file_reference",
      line: trimmedLine,
      reference_type: fileRefMatch[1] === "r" ? "requirement" : "constraint",
      filename: fileRefMatch[2].trim(),
    };
  }

  // 3. Check for Editable installs (e.g., -e)
  const editableMatch = trimmedLine.match(/^-e\s+(.+)/);
  if (editableMatch) {
    const pathOrUrl = editableMatch[1].trim();
    const isVcs = /^(git|hg|svn|bzr)\+/.test(pathOrUrl); // Basic VCS check
    return {
      type: "editable",
      line: trimmedLine,
      path_or_url: pathOrUrl,
      is_vcs: isVcs,
    };
  }

  // 4. Check for Archives/URLs/Paths (heuristic based)
  //    Includes 'name @ url/path' syntax
  let nameFromAt: string | undefined = undefined;
  let urlOrPathPart = trimmedLine;
  const atMatch = trimmedLine.match(/^(.+?)\s+@\s+(.+)$/);
  if (atMatch) {
    nameFromAt = atMatch[1].trim();
    urlOrPathPart = atMatch[2].trim();
  }

  const isUrl = /^(https?|ftp):\/\//.test(urlOrPathPart);
  const isLocalPath =
    urlOrPathPart.startsWith(".") || urlOrPathPart.startsWith("/");
  // Basic check for common archive extensions
  const looksLikeArchive = /\.(whl|zip|tar\.gz|tgz|tar\.bz2|tar)$/i.test(
    urlOrPathPart,
  );

  // Treat as archive if it's a URL, looks like an archive file,
  // or if specified with 'name @ ...' syntax.
  if (isUrl || (isLocalPath && looksLikeArchive) || nameFromAt) {
    // Basic hash extraction (can be multiple)
    const hashOptions: string[] = [];
    let mainPart = urlOrPathPart;
    const hashRegex = /\s*--hash=(\S+:\S+)/g;
    let hashMatch;
    while ((hashMatch = hashRegex.exec(mainPart)) !== null) {
      hashOptions.push(hashMatch[0].trim());
    }
    // Remove hashes from the main part for cleaner url/path
    mainPart = mainPart.replace(hashRegex, "").trim();

    return {
      type: "archive",
      line: trimmedLine, // Store original full line
      url_or_path: mainPart,
      name: nameFromAt, // Use name if found via 'name @ ...'
      hash_options: hashOptions.length > 0 ? hashOptions : undefined,
    };
  }

  // 5. Assume Standard Requirement (package name, potentially with extras, versions, markers)
  //    This parsing is complex (PEP 440, PEP 508). This is a simplified version.
  try {
    // Isolate hashes first
    const hashOptions: string[] = [];
    let mainPart = trimmedLine;
    const hashRegex = /\s*--hash=(\S+:\S+)/g;
    let hashMatch;
    while ((hashMatch = hashRegex.exec(mainPart)) !== null) {
      hashOptions.push(hashMatch[0].trim());
    }
    mainPart = mainPart.replace(hashRegex, "").trim();

    // Isolate marker (if present)
    let marker: string | undefined = undefined;
    const markerSplit = mainPart.split(";", 2);
    if (markerSplit.length === 2) {
      mainPart = markerSplit[0].trim();
      marker = markerSplit[1].trim();
    }

    // Isolate extras (if present) - Handles one set of brackets
    let extras: string[] | undefined = undefined;
    const extrasMatch = mainPart.match(/^([^[]+)\[([^\]]+)\](.*)$/);
    let namePart = mainPart; // Part potentially containing name and specifiers
    let specifiersPart = ""; // Part containing only specifiers

    if (extrasMatch) {
      namePart = extrasMatch[1].trim(); // Name is before '['
      extras = extrasMatch[2]
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e);
      specifiersPart = extrasMatch[3].trim(); // Specifiers after ']'
    } else {
      // Find first version specifier operator to split name and specifiers
      const specifierOperators = ["==", "!=", "<=", ">=", "<", ">", "~="];
      let specIndex = -1;

      for (const op of specifierOperators) {
        const idx = mainPart.indexOf(op);
        if (idx !== -1 && (specIndex === -1 || idx < specIndex)) {
          specIndex = idx;
        }
      }

      if (specIndex !== -1) {
        namePart = mainPart.substring(0, specIndex).trim();
        specifiersPart = mainPart.substring(specIndex).trim();
      } else {
        // No operators found, assume entire string is the name
        namePart = mainPart.trim();
        specifiersPart = "";
      }
    }

    // Split specifiers string by commas
    const specifiers = specifiersPart
      ? specifiersPart
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s) // Remove empty strings
      : undefined; // Use undefined if empty for consistency

    // Basic validation: namePart should not be empty
    if (!namePart) {
      throw new Error("Could not extract package name.");
    }

    return {
      type: "requirement",
      line: trimmedLine, // Store original logical line
      name: namePart,
      extras: extras,
      specifiers: specifiers,
      marker: marker,
      hash_options: hashOptions.length > 0 ? hashOptions : undefined,
    };
  } catch (e: unknown) {
    if (!(e instanceof Error)) {
      throw e; // Re-throw if not an Error instance
    }
    console.warn(
      `Skipping line due to parsing error: "${trimmedLine}". Error: ${e.message}`,
    );
    // Optionally push an 'error' type requirement or just skip
  }
  return null;
}

export function parseRequirements(content: string): Requirements {
  const logicalLines = preprocessContent(content);
  const requirements: Requirements = [];

  for (const line of logicalLines) {
    const req = parseRequirement(line);
    if (req) {
      requirements.push(req);
    }
  }

  return requirements;
}
