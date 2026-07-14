export function joinNonEmptySections(sections: Array<string | null | undefined>): string {
  return sections
    .filter((section): section is string => typeof section === "string" && section.trim().length > 0)
    .join("\n\n");
}

