const DEFAULT_LANDING_BASE_URL = 'http://vssckksko4c4s0cwwkg0kkcc.141.140.0.90.sslip.io';

function normalizeBaseUrl(value: string | undefined) {
  return value?.trim().replace(/\/$/, '');
}

export function getBeneficiaryLoginUrl() {
  const appPublicUrl = normalizeBaseUrl(import.meta.env.VITE_APP_PUBLIC_URL);
  const configuredLoginUrl = normalizeBaseUrl(import.meta.env.VITE_BENEFICIARY_LOGIN_URL);

  return configuredLoginUrl
    || (appPublicUrl ? `${appPublicUrl}/client/login` : `${DEFAULT_LANDING_BASE_URL}/client/login`);
}
