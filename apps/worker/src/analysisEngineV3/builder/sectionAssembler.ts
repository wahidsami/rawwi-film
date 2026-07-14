import { stableSerializePromptValue } from "./builderContext.js";
import type { V3PromptJsonValue } from "./builderTypes.js";

function indentLines(text: string, indent = "  "): string {
  return text
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

function renderValue(value: V3PromptJsonValue, indentLevel = 0): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "- (none)";
    return value
      .map((item) => {
        const rendered = renderValue(item, indentLevel + 1);
        const prefix = `${"  ".repeat(indentLevel)}- `;
        if (!rendered.includes("\n")) return `${prefix}${rendered}`;
        return `${prefix}${rendered.replace(/\n/g, `\n${"  ".repeat(indentLevel + 1)}`)}`;
      })
      .join("\n");
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return "{}";

  return entries
    .map(([key, entryValue]) => {
      const rendered = renderValue(entryValue, indentLevel + 1);
      if (!rendered.includes("\n")) {
        return `${"  ".repeat(indentLevel)}${key}: ${rendered}`;
      }
      return `${"  ".repeat(indentLevel)}${key}:\n${indentLines(rendered, `${"  ".repeat(indentLevel + 1)}`)}`;
    })
    .join("\n");
}

export function renderSection(title: string, body: string): string {
  return `## ${title}\n${body}`;
}

export function renderRawSection(title: string, content: string): string {
  return renderSection(title, content);
}

export function renderListSection(title: string, items: readonly string[]): string {
  if (items.length === 0) {
    return renderSection(title, "- (none)");
  }

  return renderSection(
    title,
    items
      .map((item) => {
        if (!item.includes("\n")) return `- ${item}`;
        return `- ${item.split("\n").map((line, index) => (index === 0 ? line : `  ${line}`)).join("\n")}`;
      })
      .join("\n"),
  );
}

export function renderStructuredSection(title: string, value: V3PromptJsonValue): string {
  return renderSection(title, renderValue(value));
}

export function renderStableJsonSection(title: string, value: V3PromptJsonValue): string {
  return renderSection(title, stableSerializePromptValue(value));
}

export function joinPromptSections(sections: Array<string | null | undefined>): string {
  return sections.filter((section): section is string => typeof section === "string" && section.length > 0).join("\n\n");
}

