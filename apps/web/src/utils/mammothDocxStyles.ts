/**
 * Mammoth styleMap: map common Word paragraph styles → CSS classes for script workspace.
 * Unknown styles fall back to default paragraph handling.
 */
export const DOCX_SCRIPT_STYLE_MAP = [
  "p[style-name='Title'] => h1.script-docx-title:fresh",
  "p[style-name='Subtitle'] => h2.script-docx-subtitle:fresh",
  "p[style-name='Heading 1'] => h2.script-heading-1:fresh",
  "p[style-name='Heading 2'] => h3.script-heading-2:fresh",
  "p[style-name='Heading 3'] => h4.script-heading-3:fresh",
  "p[style-name='Scene Heading'] => p.script-scene-heading:fresh",
  "p[style-name='Action'] => p.script-action:fresh",
  "p[style-name='Character'] => p.script-character:fresh",
  "p[style-name='Dialogue'] => p.script-dialogue:fresh",
  "p[style-name='Parenthetical'] => p.script-parenthetical:fresh",
  "p[style-name='Transition'] => p.script-transition:fresh",
  "p[style-name='General'] => p.script-general:fresh",
  "p[style-name='عنوان'] => h1.script-docx-title:fresh",
  "p[style-name='عنوان 1'] => h2.script-heading-1:fresh",
  "p[style-name='عنوان 2'] => h3.script-heading-2:fresh",
  "p[style-name='عنوان 3'] => h4.script-heading-3:fresh",
].join("\n");
