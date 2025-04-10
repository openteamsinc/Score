type NoteDescr = {
  description: string;
};
export type NoteDescrs = {
  [code: string]: NoteDescr;
};
export default async function fetchNoteDescriptions(): Promise<NoteDescrs> {
  const url = `https:/opensourcescore.dev/notes/categories`;

  const response = await fetch(url);
  const data = await response.json();
  if (response.status !== 200) {
    console.error(data);
    throw new Error(`Server error fetching package score: ${response.status}`);
  }

  return data.notes;
}
