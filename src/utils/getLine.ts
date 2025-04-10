export default function getLine(
  content: string,
  text: string,
): number | undefined {
  // Split the content into lines, handling both \n and \r\n line endings
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    // Check if the current line includes the search text
    if (lines[i].includes(text)) {
      // Return the 1-based line number (index + 1)
      return i + 1;
    }
  }

  return undefined;
}
