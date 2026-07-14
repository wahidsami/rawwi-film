import { joinPromptSections, renderListSection, renderSection, renderStructuredSection } from "./sectionAssembler.js";
import type { V3PromptReasoningContract, V3PromptReasoningStage } from "./builderTypes.js";

function renderStage(stage: V3PromptReasoningStage, index: number): string {
  const lines: string[] = [
    `- key: ${stage.key}`,
    `- purpose: ${stage.purpose}`,
  ];

  if (stage.description) lines.push(`- description: ${stage.description}`);
  if (stage.inputs && stage.inputs.length > 0) lines.push(renderListSection("inputs", stage.inputs));
  if (stage.outputs && stage.outputs.length > 0) lines.push(renderListSection("outputs", stage.outputs));
  if (stage.notes && stage.notes.length > 0) lines.push(renderListSection("notes", stage.notes));

  return `### Stage ${index + 1}: ${stage.title}\n${lines.join("\n")}`;
}

export function renderReasoningStageAssembly(contract: V3PromptReasoningContract): string {
  const sections: Array<string | null> = [
    contract.overview ? renderSection("Overview", contract.overview) : null,
    contract.principles && contract.principles.length > 0 ? renderListSection("Core Principles", contract.principles) : null,
    ...contract.stages.map((stage, index) => renderStage(stage, index)),
  ];

  return renderSection(contract.title, joinPromptSections(sections));
}

export function renderReasoningStagesOnly(contract: V3PromptReasoningContract): string {
  return contract.stages.map((stage, index) => renderStage(stage, index)).join("\n\n");
}

export function renderReasoningStageCatalog(contract: V3PromptReasoningContract): string {
  return renderStructuredSection("Reasoning Contract Catalog", {
    title: contract.title,
    overview: contract.overview ?? null,
    principles: contract.principles ?? [],
    stages: contract.stages.map((stage) => ({
      key: stage.key,
      title: stage.title,
      purpose: stage.purpose,
      inputs: stage.inputs ?? [],
      outputs: stage.outputs ?? [],
    })),
  });
}

