import { createSign } from "node:crypto";

interface GitHubAppJwtInput {
  appId: string;
  nowSeconds?: number;
  privateKeyPem: string;
}

interface GitHubInstallationAccessTokenInput extends GitHubAppJwtInput {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  installationId: string;
}

interface InstallationTokenResponse {
  token?: string;
}

const githubApiVersion = "2022-11-28";

export function createGitHubAppJwt(input: GitHubAppJwtInput): string {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
    }),
  );
  const payload = base64UrlEncode(
    JSON.stringify({
      exp: nowSeconds + 540,
      iat: nowSeconds - 60,
      iss: input.appId,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(input.privateKeyPem);

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export async function getGitHubInstallationAccessToken(
  input: GitHubInstallationAccessTokenInput,
): Promise<string> {
  const apiBaseUrl = input.apiBaseUrl?.replace(/\/$/, "") ?? "https://api.github.com";
  const fetcher = input.fetcher ?? fetch;
  const jwt = createGitHubAppJwt(input);
  const response = await fetcher(
    `${apiBaseUrl}/app/installations/${input.installationId}/access_tokens`,
    {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt}`,
        "x-github-api-version": githubApiVersion,
      },
      method: "POST",
    },
  );
  const payload = (await response.json()) as InstallationTokenResponse;

  if (!response.ok || !payload.token) {
    throw new Error("GitHub installation token request failed.");
  }

  return payload.token;
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}
