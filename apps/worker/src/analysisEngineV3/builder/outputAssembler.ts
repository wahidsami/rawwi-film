import { renderListSection, renderSection, renderStableJsonSection } from "./sectionAssembler.js";
import type { V3PromptOutputSchema } from "./builderTypes.js";

export function renderOutputSchemaSection(outputSchema: V3PromptOutputSchema): string {
  const parts: string[] = [];

  if (outputSchema.notes && outputSchema.notes.length > 0) {
    parts.push(renderListSection("Notes", outputSchema.notes));
  }

  parts.push(
    renderStableJsonSection("JSON Contract", {
      title: outputSchema.title,
      fields: outputSchema.fields.map((field) => ({
        description: field.description,
        name: field.name,
        required: field.required ?? false,
      })),
      example: outputSchema.example ?? null,
    }),
  );

  return renderSection(outputSchema.title, parts.join("\n\n"));
}

