import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { BadRequestError } from "./errors.js";

export const LINK_TIMEOUT_MS = 10_000;
export const LINK_MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

export interface FetchedPage {
  readonly title: string;
  readonly text: string;
}
export type PageFetcher = (url: string) => Promise<FetchedPage>;

function ipv4Blocked(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** True for loopback, private, link-local and other non-public addresses. */
export function isBlockedAddress(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (isIP(lower) === 4) return ipv4Blocked(lower);
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1]) return ipv4Blocked(mapped[1]);
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    /^fe[89ab]/.test(lower) ||
    lower.startsWith("ff")
  );
}

/**
 * Parses a teacher-supplied link.
 * @throws BadRequestError for anything but a plain public http(s) address.
 */
export function parseLink(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestError(
      "Enter a valid web address.",
      "validation_failed",
    );
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username !== "" ||
    url.password !== "" ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    (isIP(host) !== 0 && isBlockedAddress(host)) ||
    (isIP(host) === 0 && !host.includes("."))
  )
    throw new BadRequestError(
      "That web address can't be added.",
      "validation_failed",
    );
  url.hash = "";
  return url;
}

function textOf(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const text = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return { title: title.replace(/\s+/g, " ").trim().slice(0, 200), text };
}

function get(
  url: URL,
  address: string,
  family: number,
): Promise<{
  status: number;
  location?: string;
  type: string;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        timeout: LINK_TIMEOUT_MS,
        headers: {
          "User-Agent": "gap-source-fetcher",
          Accept: "text/html,text/plain",
        },
        // Connect to the address we validated, so DNS cannot change underneath us.
        lookup: (_host, _opts, cb) => {
          cb(null, address, family);
        },
      } as https.RequestOptions,
      (res) => {
        const type = res.headers["content-type"] ?? "";
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({
            status,
            ...(location ? { location } : {}),
            type,
            body: "",
          });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > LINK_MAX_BYTES) {
            req.destroy(new Error("The page is too large."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({
            status,
            type,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("The site took too long to respond."));
    });
    req.on("error", reject);
    req.end();
  });
}

/** Fetches a public page server-side: blocked ranges, redirects re-checked, timeout and size cap. */
export const fetchPage: PageFetcher = async (start) => {
  let url = parseLink(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await lookup(host, { all: true });
    if (
      addresses.length === 0 ||
      addresses.some((a) => isBlockedAddress(a.address))
    )
      throw new Error("That address points to a private network.");
    const first = addresses[0];
    if (!first) throw new Error("Could not find that site.");
    const res = await get(url, first.address, first.family);
    if (res.location) {
      url = parseLink(new URL(res.location, url).toString());
      continue;
    }
    if (res.status < 200 || res.status >= 300)
      throw new Error(`The site returned an error (${String(res.status)}).`);
    if (!/text\/(html|plain)|application\/xhtml/i.test(res.type))
      throw new Error("Only web pages and text can be added.");
    return textOf(res.body);
  }
  throw new Error("Too many redirects.");
};
