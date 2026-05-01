export const RAAWI_AI_NOT_CONNECTED_MESSAGE = 'Raawi AI is not connected';

const RAAWI_AI_CONNECTION_ERROR_PATTERN =
  /openai|open ai|ai provider|api key|unauthorized|authentication|insufficient[_\s-]?quota|quota|credit|billing|payment required|rate limit|429|tokens per min|requests per min|overloaded|server overloaded|service unavailable|temporarily unavailable|fetch failed|socket hang up|connection error|etimedout|timeout|timed out|raawi ai overloading/i;

export function isRaawiAiConnectionIssue(message: string | null | undefined): boolean {
  return RAAWI_AI_CONNECTION_ERROR_PATTERN.test(String(message ?? ''));
}

export function getPublicAnalysisErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  return isRaawiAiConnectionIssue(message) ? RAAWI_AI_NOT_CONNECTED_MESSAGE : message;
}
