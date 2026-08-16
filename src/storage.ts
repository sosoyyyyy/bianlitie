import { App, normalizePath, TFile, TFolder } from "obsidian";
import {
  ATTACHMENT_ROOT,
  CATEGORIES,
  MAX_IMAGES_PER_NOTE,
  ROOT_FOLDER,
  type Category,
  type CategoryFilter
} from "./constants";
import type { GeneratedMetadata, StickyNoteRecord } from "./types";
import {
  extractSearchTerms,
  formatCreated,
  formatFileTimestamp,
  makeSnippet,
  normalizeImagePaths,
  normalizeList,
  normalizeManualTags,
  pad,
  parseCreated,
  sanitizeAttachmentFileName,
  stripFrontmatter
} from "./utils";

export interface ParsedNote {
  category: Category;
  created: string;
  updated: string;
  tags: string[];
  keywords: string[];
  manualTags: string[];
  images: string[];
  body: string;
}

export interface ImageUpload {
  name: string;
  mimeType: string;
  data: ArrayBuffer;
}

export interface NoteSnapshot {
  note: ParsedNote;
  raw: string;
  mtime: number;
}

export class NoteConflictError extends Error {
  constructor() {
    super("这条便利贴在编辑期间已发生变化，请重新载入后再编辑。");
    this.name = "NoteConflictError";
  }
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

  async createNote(category: Category, originalContent: string, manualTags: string[] = []): Promise<TFile> {
    await this.ensureFolders();
    const now = new Date();
    const folder = normalizePath(`${ROOT_FOLDER}/${category}`);
    const baseName = formatFileTimestamp(now);
    const path = this.uniquePath(folder, baseName);
    const frontmatter = [
      "---",
      `category: ${category}`,
      `created: ${formatCreated(now)}`,
      `updated: ${formatCreated(now)}`,
      "tags: []",
      "keywords: []",
      `manualTags: ${JSON.stringify(normalizeManualTags(manualTags))}`,
      "images: []",
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

  async saveImages(uploads: ImageUpload[], savedAt = new Date()): Promise<string[]> {
    if (uploads.length > MAX_IMAGES_PER_NOTE) throw new Error(`每条便利贴最多添加 ${MAX_IMAGES_PER_NOTE} 张图片。`);
    const folder = normalizePath(`${ATTACHMENT_ROOT}/${savedAt.getFullYear()}/${pad(savedAt.getMonth() + 1)}`);
    await this.ensureFolderTree(folder);
    const created: TFile[] = [];
    try {
      for (const upload of uploads) {
        const fileName = this.ensureImageExtension(sanitizeAttachmentFileName(upload.name), upload.mimeType);
        const path = this.uniqueAttachmentPath(folder, fileName);
        created.push(await this.app.vault.createBinary(path, upload.data));
      }
      return created.map((file) => file.path);
    } catch (error) {
      for (const file of created) {
        try {
          await this.app.vault.trash(file, false);
        } catch {
          // 仅回收本次刚创建的附件；回收失败时保留文件，避免进一步的数据风险。
        }
      }
      throw error;
    }
  }

  async discardCreatedImages(paths: string[]): Promise<void> {
    for (const path of normalizeImagePaths(paths, MAX_IMAGES_PER_NOTE)) {
      if (!this.isManagedAttachmentPath(path)) continue;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      try {
        await this.app.vault.trash(file, false);
      } catch (error) {
        console.warn("无法回收未绑定的便利贴附件。", error);
      }
    }
  }

  getImageResourcePath(path: string): string | null {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) return null;
    const resource = this.app.vault.getResourcePath(file);
    const separator = resource.includes("?") ? "&" : "?";
    return `${resource}${separator}bianlitieMtime=${file.stat.mtime}`;
  }

  async readNote(file: TFile): Promise<ParsedNote> {
    if (!this.isManagedFile(file)) throw new Error("这不是便利贴目录中的 Markdown 文件。");
    const raw = await this.app.vault.read(file);
    return this.parseNote(raw, file);
  }

  async readNoteSnapshot(file: TFile): Promise<NoteSnapshot> {
    if (!this.isManagedFile(file)) throw new Error("这不是便利贴目录中的 Markdown 文件。");
    const raw = await this.app.vault.read(file);
    return {
      note: this.parseNote(raw, file),
      raw,
      mtime: file.stat.mtime
    };
  }

  async updateNote(
    file: TFile,
    expectedRaw: string,
    body: string,
    manualTags: string[],
    images: string[],
    updatedAt: Date | null
  ): Promise<void> {
    if (!this.isManagedFile(file)) throw new Error("拒绝修改便利贴目录之外的文件。");
    await this.app.vault.process(file, (currentRaw) => {
      if (currentRaw !== expectedRaw) throw new NoteConflictError();
      return this.replaceBodyAndUserMetadata(currentRaw, body, manualTags, images, updatedAt);
    });
  }

  async updateImagePath(oldPath: string, newPath: string): Promise<void> {
    const normalizedOld = normalizePath(oldPath);
    const normalizedNew = normalizePath(newPath);
    const files = this.app.vault.getMarkdownFiles().filter((file) => this.isManagedFile(file));
    for (const file of files) {
      const note = await this.readNote(file);
      if (!note.images.includes(normalizedOld)) continue;
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter.images = normalizeImagePaths(note.images.map((path) => path === normalizedOld ? normalizedNew : path));
      });
    }
  }

  async trashNote(file: TFile): Promise<void> {
    if (!this.isManagedFile(file)) throw new Error("拒绝删除便利贴目录之外的文件。");
    const fileManager = this.app.fileManager as typeof this.app.fileManager & {
      trashFile?: (target: TFile) => Promise<void>;
    };
    if (typeof fileManager.trashFile === "function") {
      await fileManager.trashFile(file);
      return;
    }
    await this.app.vault.trash(file, false);
  }

  async search(query: string, category: CategoryFilter = "全部", limit = 50): Promise<StickyNoteRecord[]> {
    const terms = extractSearchTerms(query);
    const records: StickyNoteRecord[] = [];
    const files = this.app.vault.getMarkdownFiles().filter((file) => this.isManagedFile(file));

    for (const file of files) {
      const raw = await this.app.vault.read(file);
      const parsed = this.parseNote(raw, file);
      if (category !== "全部" && parsed.category !== category) continue;

      const record = this.toRecord(file, parsed, query, terms);
      if (terms.length === 0 || record.score > 0) records.push(record);
    }

    return records
      .sort((left, right) => right.modifiedTimestamp - left.modifiedTimestamp || right.score - left.score)
      .slice(0, limit);
  }

  async findRelevant(question: string, limit = 6): Promise<StickyNoteRecord[]> {
    return this.search(question, "全部", limit);
  }

  isManagedFile(file: TFile): boolean {
    return file.extension.toLocaleLowerCase() === "md"
      && CATEGORIES.some((category) => file.path.startsWith(`${ROOT_FOLDER}/${category}/`));
  }

  isManagedAttachmentPath(path: string): boolean {
    const normalized = normalizePath(path);
    return normalized === ATTACHMENT_ROOT || normalized.startsWith(`${ATTACHMENT_ROOT}/`);
  }

  isImagePath(path: string): boolean {
    return /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/iu.test(path);
  }

  private toRecord(file: TFile, parsed: ParsedNote, query: string, terms: string[]): StickyNoteRecord {
    const title = makeSnippet(parsed.body, 80) || "暂无内容";
    const modifiedTimestamp = parseCreated(parsed.updated) || file.stat.mtime;
    const titleText = `${file.basename} ${title}`.toLocaleLowerCase();
    const tagText = parsed.tags.join(" ").toLocaleLowerCase();
    const manualTagText = parsed.manualTags.join(" ").toLocaleLowerCase();
    const keywordText = parsed.keywords.join(" ").toLocaleLowerCase();
    const bodyText = parsed.body.toLocaleLowerCase();
    const categoryText = parsed.category.toLocaleLowerCase();
    let score = 0;

    for (const term of terms) {
      if (titleText.includes(term)) score += 10;
      if (manualTagText.includes(term)) score += 11;
      if (tagText.includes(term)) score += 9;
      if (keywordText.includes(term)) score += 8;
      if (categoryText.includes(term)) score += 7;
      if (bodyText.includes(term)) score += 3;
    }
    const exact = query.toLocaleLowerCase().trim();
    if (exact && `${titleText} ${manualTagText} ${tagText} ${keywordText} ${categoryText} ${bodyText}`.includes(exact)) score += 12;

    return {
      file,
      title,
      category: parsed.category,
      created: parsed.created,
      modified: parsed.updated || formatCreated(new Date(file.stat.mtime)),
      modifiedTimestamp,
      tags: parsed.tags,
      keywords: parsed.keywords,
      manualTags: parsed.manualTags,
      images: parsed.images,
      body: parsed.body,
      snippet: makeSnippet(parsed.body),
      score
    };
  }

  private parseNote(raw: string, file: TFile): ParsedNote {
    const folderCategory = CATEGORIES.find((category) => file.path.startsWith(`${ROOT_FOLDER}/${category}/`));
    const storedCategory = this.readScalar(raw, "category");
    const category = CATEGORIES.find((item) => item === storedCategory) ?? folderCategory ?? "工作";
    const created = this.readScalar(raw, "created");
    const updated = this.readScalar(raw, "updated");
    const tags = normalizeList(this.readList(raw, "tags"));
    const keywords = normalizeList(this.readList(raw, "keywords"));
    const manualTags = normalizeManualTags(this.readList(raw, "manualTags"));
    const images = normalizeImagePaths(this.readList(raw, "images"), MAX_IMAGES_PER_NOTE);

    return {
      category,
      created,
      updated,
      tags,
      keywords,
      manualTags,
      images,
      body: stripFrontmatter(raw)
    };
  }

  private replaceBodyAndUserMetadata(
    raw: string,
    body: string,
    manualTags: string[],
    images: string[],
    updatedAt: Date | null
  ): string {
    const match = raw.match(/^---(\r?\n)([\s\S]*?)(\r?\n)---(?:\r?\n)?/u);
    if (!match) throw new Error("便利贴缺少可识别的 YAML frontmatter，已停止保存以避免损坏文件。");

    const newline = match[1] ?? "\n";
    let nextFrontmatter = match[2] ?? "";
    nextFrontmatter = this.replaceFrontmatterField(
      nextFrontmatter,
      "manualTags",
      JSON.stringify(normalizeManualTags(manualTags)),
      newline
    );
    nextFrontmatter = this.replaceFrontmatterField(
      nextFrontmatter,
      "images",
      JSON.stringify(normalizeImagePaths(images, MAX_IMAGES_PER_NOTE)),
      newline
    );
    if (updatedAt) {
      nextFrontmatter = this.replaceFrontmatterField(nextFrontmatter, "updated", formatCreated(updatedAt), newline);
    }
    return `---${newline}${nextFrontmatter}${newline}---${newline}${body}`;
  }

  private replaceFrontmatterField(frontmatter: string, field: string, value: string, newline: string): string {
    const lines = frontmatter.split(/\r?\n/u);
    const start = lines.findIndex((line) => new RegExp(`^${field}:`, "u").test(line));
    const replacement = `${field}: ${value}`;
    if (start < 0) return `${frontmatter}${frontmatter ? newline : ""}${replacement}`;

    let end = start + 1;
    while (end < lines.length && /^\s+/u.test(lines[end] ?? "")) end += 1;
    lines.splice(start, end - start, replacement);
    return lines.join(newline);
  }

  private async ensureFolderTree(path: string): Promise<void> {
    const segments = normalizePath(path).split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      await this.ensureFolder(current);
    }
  }

  private uniqueAttachmentPath(folder: string, fileName: string): string {
    const dotIndex = fileName.lastIndexOf(".");
    const hasExtension = dotIndex > 0 && dotIndex < fileName.length - 1;
    const base = hasExtension ? fileName.slice(0, dotIndex) : fileName;
    const extension = hasExtension ? fileName.slice(dotIndex) : "";
    let counter = 1;
    while (true) {
      const suffix = counter === 1 ? "" : `-${counter}`;
      const candidate = normalizePath(`${folder}/${base}${suffix}${extension}`);
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
      counter += 1;
    }
  }

  private ensureImageExtension(fileName: string, mimeType: string): string {
    if (/\.[a-zA-Z0-9]{1,10}$/u.test(fileName)) return fileName;
    const extensions: Record<string, string> = {
      "image/avif": "avif",
      "image/bmp": "bmp",
      "image/gif": "gif",
      "image/heic": "heic",
      "image/heif": "heif",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/svg+xml": "svg",
      "image/webp": "webp"
    };
    const extension = extensions[mimeType.toLocaleLowerCase()] ?? "jpg";
    return `${fileName}.${extension}`;
  }

  private readScalar(raw: string, field: string): string {
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
    const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, "mu"));
    return match?.[1]?.trim().replace(/^['"]|['"]$/gu, "") ?? "";
  }

  private readList(raw: string, field: string): string[] {
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
    const inlineMatch = frontmatter.match(new RegExp(`^${field}:\\s*(\\[[^\\r\\n]*\\])\\s*$`, "mu"));
    if (inlineMatch) {
      try {
        const parsed = JSON.parse(inlineMatch[1] ?? "[]") as unknown;
        if (Array.isArray(parsed)) return parsed.map((item) => String(item));
      } catch {
        // 兼容旧便利贴中不是严格 JSON 的 YAML 行内数组。
      }
      return (inlineMatch[1] ?? "")
        .replace(/^\[|\]$/gu, "")
        .split(",")
        .map((item) => item.trim().replace(/^['"]|['"]$/gu, ""))
        .filter(Boolean);
    }
    const blockMatch = frontmatter.match(new RegExp(`^${field}:\\s*\\r?\\n((?:\\s+-\\s+.*(?:\\r?\\n|$))*)`, "mu"));
    if (!blockMatch) return [];
    return (blockMatch[1] ?? "")
      .split(/\r?\n/u)
      .map((line) => line.replace(/^\s+-\s+/u, "").trim().replace(/^['"]|['"]$/gu, ""))
      .filter(Boolean);
  }
}
