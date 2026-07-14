import { stableSerialize } from "./academyManifestUtils.js";
import type { AcademyManifest } from "./academyManifestTypes.js";

export function renderAcademyManifest(manifest: AcademyManifest): string {
  return stableSerialize(manifest);
}
