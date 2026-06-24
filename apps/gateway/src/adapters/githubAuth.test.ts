import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGitHubAppJwt, getGitHubInstallationAccessToken } from "./githubAuth";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs1" }).toString();

describe("GitHub App authentication", () => {
  it("creates an RS256 GitHub App JWT", () => {
    const jwt = createGitHubAppJwt({
      appId: "12345",
      nowSeconds: 1_782_000_000,
      privateKeyPem,
    });
    const [encodedHeader, encodedPayload, encodedSignature] = jwt.split(".");

    expect(decodeJson(encodedHeader)).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    expect(decodeJson(encodedPayload)).toEqual({
      exp: 1_782_000_540,
      iat: 1_781_999_940,
      iss: "12345",
    });
    expect(
      createVerify("RSA-SHA256")
        .update(`${encodedHeader}.${encodedPayload}`)
        .verify(publicKey, base64UrlDecode(encodedSignature)),
    ).toBe(true);
  });

  it("exchanges a GitHub App JWT for an installation token", async () => {
    const requests: Array<{ headers: Headers; method: string; url: string }> = [];
    const token = await getGitHubInstallationAccessToken({
      apiBaseUrl: "https://api.github.test",
      appId: "12345",
      fetcher: async (url, init) => {
        requests.push({
          headers: new Headers(init?.headers),
          method: init?.method ?? "GET",
          url: String(url),
        });

        return Response.json({
          token: "installation-token",
        });
      },
      installationId: "999",
      nowSeconds: 1_782_000_000,
      privateKeyPem,
    });

    expect(token).toBe("installation-token");
    expect(requests).toHaveLength(1);
    const request = requests[0];

    if (!request) {
      throw new Error("Expected one GitHub token request.");
    }

    expect(request.url).toBe("https://api.github.test/app/installations/999/access_tokens");
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toMatch(/^Bearer .+\..+\..+$/);
    expect(request.headers.get("accept")).toBe("application/vnd.github+json");
    expect(request.headers.get("x-github-api-version")).toBe("2022-11-28");
  });
});

function decodeJson(value: string | undefined): unknown {
  if (!value) {
    throw new Error("Expected JWT segment.");
  }

  return JSON.parse(base64UrlDecode(value).toString("utf8")) as unknown;
}

function base64UrlDecode(value: string | undefined): Buffer {
  if (!value) {
    throw new Error("Expected base64url value.");
  }

  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
