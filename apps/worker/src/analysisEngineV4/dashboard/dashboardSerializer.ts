import type { CognitiveDashboard } from "./dashboardTypes.js";

export function serializeCognitiveDashboard(dashboard: CognitiveDashboard): string {
  return `${JSON.stringify(dashboard, null, 2)}\n`;
}

