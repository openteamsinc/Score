import fs from "fs/promises";

export default async function exists(filename: string): Promise<boolean> {
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
