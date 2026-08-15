import { App, normalizePath, TFile, TFolder } from "obsidian";
import { CATEGORIES, ROOT_FOLDER, type Category, type CategoryFilter } from "./constants";
import type { GeneratedMetadata, StickyNoteRecord } from "./types";
import {
  extractSearchTerms,
  formatCreated,
  formatFileTimestamp,
  makeSnippet,
  normalizeList,
  sanitizeFilePart,
  stripFrontmatter,
  titleFromContent
} from "./utils";

interface ParsedNote {
  category: Category;
  created: string;
  tags: string[];
  keywords: string[];
  body: string;
}

export class StickyNoteStorage {
  constructor(private readonly app: App) {}

  async ensureFolders(): Promise<void> {
    await this.ensureFolder(ROOT_FOLDER);
    for (const category of CATEGORIES) {
      await this.ensureFolder(normalizePath(`${ROOT_FOLDER}/${category}`));
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) return;
    if (existing) throw new Error(`${path} 已存在，但不是文件夹。`);
    await this.app.vault.createFolder(path);
  }

  async createNote(category: Category, originalContent: string): Promise<TFile> {
    await this.ensureFolders();
    const now = new Date();
    const folder = normalizePath(`${ROOT_FOLDER}/${category}`);
    const titlePart = sanitizeFilePart(titleFromContent(originalContent));
    const baseName = `${formatFileTimestamp(now)}-${titlePart}`;
    const path = this.uniquePath(folder, baseName);
    const frontmatter = [
      "---",
      `category: ${category}`,
      `created: ${formatCreated(now)}`,
      "tags: []",
      "keywords: []",
      "---",
      ""
    ].join("\n");
    return this.app.vault.create(path, `${frontmatter}${originalContent}`);
  }

  private uniquePath(folder: string, baseName: string): string {
    let counter = 0;
    while (true) {
      const suffix = counter === 0 ? "" : `-${counter + 1}`;
      const candidate = normalizePath(`${folder}/${baseName}${suffix}.md`);
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
      counter += 1;
    }
  }

  async updateGeneratedMetadata(file: TFile, metadata: GeneratedMetadata): Promise<void> {
    if (!this.isManagedFile(file)) throw new Error("拒绝修改便利贴目录之外的文件。代理输出的元数据未写入。");
    const tags = normalizeList(metadata.tags);
    const keywords = normalizeList(metadata.keywords);
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.tags = tags;
      frontmatter.keywords = keywords;
    });
  }

  async search(query: string, category: CategoryFilter = "全部", limit = 50): Promise<StickyNoteRecord[]> {
    const terms = extractSearchTerms(query);
    const records: StickyNoteRecord[] = [];
    const files = this.app.vault.getMarkdownFiles().filter((file) => this.isManagedFile(file));

    for (const file of files) {
      const raw = await this.app.vault.cachedRead(file);
      const parsed = this.parseNote(raw, file);
      if (category !== "全部" && parsed.category !== category) continue;

      const record = this.toRecord(file, parsed, query, terms);
      if (terms.length === 0 || record.score > 0) records.push(record);
    }

    return records
      .sort((left, right) => right.score - left.score || right.file.stat.ctime - left.file.stat.ctime)
      .slice(0, limit);
  }

  async findRelevant(question: string, limit = 6): Promise<StickyNoteRecord[]> {
    return this.search(question, "全部", limit);
  }

  private isManagedFile(file: TFile): boolean {
    return file.extension.toLocaleLowerCase() === "md" && file.path.startsWith(`${ROOT_FOLDER}/`);
  }

  private toRecord(file: TFile, parsed: ParsedNote, query: string, terms: string[]): StickyNoteRecord {
    const title = file.basename;
    const titleText = title.toLocaleLowerCase();
    const tagText = parsed.tags.join(" ").toLocaleLowerCase();
    const keywordText = parsed.keywords.join(" ").toLocaleLowerCase();
    const bodyText = parsed.body.toLocaleLowerCase();
    let score = 0;

    for (const term of terms) {
      if (titleText.includes(term)) score += 10;
      if (tagText.includes(term)) score += 9;
      if (keywordText.includes(term)) score += 8;
      if (bodyText.includes(term)) score += 3;
    }
    const exact = query.toLocaleLowerCase().trim();
    if (exact && `${titleText} ${tagText} ${keywordText} ${bodyText}`.includes(exact)) score += 12;

    return {
      file,
      title,
      category: parsed.category,
      created: parsed.created,
      tags: parsed.tags,
      keywords: parsed.keywords,
      body: parsed.body,
      snippet: makeSnippet(parsed.body),
      score
    };
  }

  private parseNote(raw: string, file: TFile): ParsedNote {
    const cache = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const folderCategory = CATEGORIES.find((category) => file.path.startsWith(`${ROOT_FOLDER}/${category}/`));
    const cachedCategory = cache?.category;
    const category = CATEGORIES.find((item) => item === cachedCategory) ?? folderCategory ?? "工作";
    const created = typeof cache?.created === "string" ? cache.created : this.readScalar(raw, "created");
    const tags = normalizeList(cache?.tags ?? this.readList(raw, "tags"));
    const keywords = normalizeList(cache?.keywords ?? this.readList(raw, "keywords"));

    return {
      category,
      created,
      tags,
      keywords,
      body: stripFrontmatter(raw)
    };
  }

  private readScalar(raw: string, field: string): string {
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
    const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, "mu"));
    return match?.[1]?.trim().replace(/^['"]|['"]$/gu, "") ?? "";
  }

  private readList(raw: string, field: string): string[] {
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
    const inlineMatch = frontmatter.match(new RegExp(`^${field}:\\s*\\[([^\\]]*)\\]`, "mu"));
    if (inlineMatch) {
      return (inlineMatch[1] ?? "").split(",").map((item) => item.trim().replace(/^['"]|['"]$/gu, "")).filter(Boolean);
    }
    const blockMatch = frontmatter.match(new RegExp(`^${field}:\\s*\\r?\\n((?:\\s+-\\s+.*(?:\\r?\\n|$))*)`, "mu"));
    if (!blockMatch) return [];
    return (blockMatch[1] ?? "")
      .split(/\r?\n/u)
      .map((line) => line.replace(/^\s+-\s+/u, "").trim().replace(/^['"]|['"]$/gu, ""))
      .filter(Boolean);
  }
}
