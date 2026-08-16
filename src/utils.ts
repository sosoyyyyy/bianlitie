export function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function formatCreated(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseCreated(value: string): number {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/u);
  if (!match) return 0;
  const [, year, month, day, hours, minutes] = match;
  const timestamp = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes)).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function formatFileTimestamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function titleFromContent(content: string): string {
  const firstMeaningfulLine = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (firstMeaningfulLine ?? "新便利贴").slice(0, 24);
}

export function sanitizeFilePart(value: string): string {
  const sanitized = value
    .replace(/[\\/:*?"<>|#^\[\]]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[. ]+$/gu, "");
  return sanitized || "新便利贴";
}

export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) return markdown;
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u);
  return match ? markdown.slice(match[0].length) : markdown;
}

export function makeSnippet(body: string, maxLength = 150): string {
  const compact = body.replace(/\s+/gu, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact;
}

export function normalizeList(values: unknown, maxItems = 8): string[] {
  const raw = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const result: string[] = [];
  for (const item of raw) {
    const value = String(item).replace(/^#+/u, "").replace(/[\r\n]/gu, " ").trim().slice(0, 40);
    if (value && !result.includes(value)) result.push(value);
    if (result.length >= maxItems) break;
  }
  return result;
}

export function normalizeManualTag(value: string): string {
  return value
    .replace(/^#+/u, "")
    .replace(/[\r\n]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 30);
}

export function normalizeManualTags(values: unknown, maxItems = 20): string[] {
  const raw = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const result: string[] = [];
  for (const item of raw) {
    const value = normalizeManualTag(String(item));
    if (value && !result.includes(value)) result.push(value);
    if (result.length >= maxItems) break;
  }
  return result;
}

export function sanitizeAttachmentFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[\\/:*?"<>|\[\]\u0000-\u001f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[. ]+$/gu, "");
  if (!cleaned) return "image";

  const dotIndex = cleaned.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === cleaned.length - 1) return cleaned.slice(0, 80);
  const base = cleaned.slice(0, dotIndex).trim().slice(0, 70) || "image";
  const extension = cleaned.slice(dotIndex + 1).replace(/[^a-zA-Z0-9]/gu, "").slice(0, 10);
  return extension ? `${base}.${extension}` : base;
}

export function normalizeImagePaths(values: unknown, maxItems = 5): string[] {
  const raw = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const result: string[] = [];
  for (const item of raw) {
    const value = String(item).replace(/[\r\n]/gu, "").trim().slice(0, 500);
    if (value && !result.includes(value)) result.push(value);
    if (result.length >= maxItems) break;
  }
  return result;
}

export function extractSearchTerms(query: string): string[] {
  const normalized = query.toLocaleLowerCase().trim();
  if (!normalized) return [];

  const terms = new Set<string>([normalized]);
  const chunks = normalized.split(/[\s,，。.!！?？;；:：、/\\|()（）\[\]{}]+/u).filter(Boolean);
  for (const chunk of chunks) {
    terms.add(chunk);
    if (/^[\p{Script=Han}]+$/u.test(chunk) && chunk.length > 2) {
      for (let index = 0; index < chunk.length - 1; index += 1) {
        terms.add(chunk.slice(index, index + 2));
      }
    }
  }
  return [...terms].filter((term) => term.length > 0);
}
