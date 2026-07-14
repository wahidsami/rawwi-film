import { joinPromptSections, renderListSection, renderSection, renderStructuredSection } from "./sectionAssembler.js";
import type { V3PromptSemanticLayer } from "./builderTypes.js";

export function renderSemanticLayerSection(semanticLayer: V3PromptSemanticLayer): string {
  const parts: Array<string | null> = [
    renderListSection("Core Question", [
      "What does this sentence actually mean before any legal judgment?",
      "Who is speaking?",
      "Who is being addressed or described?",
      "What does Story Memory change, if anything?",
    ]),
    semanticLayer.purpose ? renderSection("Purpose", semanticLayer.purpose) : null,
    semanticLayer.meaningQuestions && semanticLayer.meaningQuestions.length > 0
      ? renderListSection("Meaning Questions", semanticLayer.meaningQuestions)
      : null,
    semanticLayer.narrativeIntentOptions && semanticLayer.narrativeIntentOptions.length > 0
      ? renderListSection("Narrative Intent Options", semanticLayer.narrativeIntentOptions)
      : null,
    semanticLayer.conversationRoles && semanticLayer.conversationRoles.length > 0
      ? renderListSection("Conversation Roles", semanticLayer.conversationRoles)
      : null,
    semanticLayer.sceneRoles && semanticLayer.sceneRoles.length > 0
      ? renderListSection("Scene Roles", semanticLayer.sceneRoles)
      : null,
    semanticLayer.outputs && semanticLayer.outputs.length > 0 ? renderListSection("Semantic Outputs", semanticLayer.outputs) : null,
    semanticLayer.states && semanticLayer.states.length > 0 ? renderListSection("Semantic States", semanticLayer.states) : null,
    semanticLayer.signals && semanticLayer.signals.length > 0 ? renderListSection("Semantic Signals", semanticLayer.signals) : null,
    semanticLayer.examples
      ? renderStructuredSection("Examples", {
          good: semanticLayer.examples.good ?? [],
          bad: semanticLayer.examples.bad ?? [],
          edgeCases: semanticLayer.examples.edgeCases ?? [],
          falsePositives: semanticLayer.examples.falsePositives ?? [],
          falseNegatives: semanticLayer.examples.falseNegatives ?? [],
        })
      : null,
    semanticLayer.notes && semanticLayer.notes.length > 0 ? renderListSection("Notes", semanticLayer.notes) : null,
  ];

  return renderSection(semanticLayer.title, joinPromptSections(parts));
}

