export const RAAWI_AI_NOT_AVAILABLE_MESSAGE = 'Raawi AI is currently unavailable. The analysis could not be completed. Please try again later.';
export const RAAWI_AI_NOT_CONNECTED_MESSAGE = RAAWI_AI_NOT_AVAILABLE_MESSAGE;

const RAAWI_AI_CONNECTION_ERROR_PATTERN =
  /openai|open ai|ai provider|api key|unauthorized|authentication|insufficient[_\s-]?quota|quota|credit|billing|payment required|rate limit|429|tokens per min|requests per min|overloaded|server overloaded|service unavailable|temporarily unavailable|fetch failed|socket hang up|connection error|etimedout|timeout|timed out|raawi ai overloading/i;

export function isRaawiAiConnectionIssue(message: string | null | undefined): boolean {
  const value = String(message ?? '');
  return /^(AI_PROVIDER_UNAVAILABLE|AI_QUOTA_EXCEEDED|AI_TIMEOUT|AI_INVALID_RESPONSE)$/i.test(value) || RAAWI_AI_CONNECTION_ERROR_PATTERN.test(value);
}

export function getPublicAnalysisErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  return isRaawiAiConnectionIssue(message) ? RAAWI_AI_NOT_AVAILABLE_MESSAGE : message;
}
