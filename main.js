"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => BianlitiePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian8 = require("obsidian");

// src/constants.ts
var VIEW_TYPE_BIANLITIE = "bianlitie-view";
var ROOT_FOLDER = "\u4FBF\u5229\u8D34";
var ATTACHMENT_ROOT = "attachments/bianlitie";
var MAX_IMAGES_PER_NOTE = 5;
var CATEGORIES = ["\u751F\u6D3B", "\u526F\u4E1A", "\u5DE5\u4F5C"];
var DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
var DEFAULT_MODEL = "deepseek-chat";

// src/deepseek.ts
var import_obsidian = require("obsidian");

// src/utils.ts
function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}
function formatCreated(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function parseCreated(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/u);
  if (!match) return 0;
  const [, year, month, day, hours, minutes] = match;
  const timestamp = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes)).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
function formatFileTimestamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}
function stripFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return markdown;
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u);
  return match ? markdown.slice(match[0].length) : markdown;
}
function makeSnippet(body, maxLength = 150) {
  const compact = body.replace(/\s+/gu, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}\u2026` : compact;
}
function normalizeList(values, maxItems = 8) {
  const raw = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const result = [];
  for (const item of raw) {
    const value = String(item).replace(/^#+/u, "").replace(/[\r\n]/gu, " ").trim().slice(0, 40);
    if (value && !result.includes(value)) result.push(value);
    if (result.length >= maxItems) break;
  }
  return result;
}
function normalizeManualTag(value) {
  return value.replace(/^#+/u, "").replace(/[\r\n]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 30);
}
function normalizeManualTags(values, maxItems = 20) {
  const raw = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const result = [];
  for (const item of raw) {
    const value = normalizeManualTag(String(item));
    if (value && !result.includes(value)) result.push(value);
    if (result.length >= maxItems) break;
  }
  return result;
}
function sanitizeAttachmentFileName(fileName) {
  const cleaned = fileName.replace(/[\\/:*?"<>|\[\]\u0000-\u001f]/gu, " ").replace(/\s+/gu, " ").trim().replace(/[. ]+$/gu, "");
  if (!cleaned) return "image";
  const dotIndex = cleaned.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === cleaned.length - 1) return cleaned.slice(0, 80);
  const base = cleaned.slice(0, dotIndex).trim().slice(0, 70) || "image";
  const extension = cleaned.slice(dotIndex + 1).replace(/[^a-zA-Z0-9]/gu, "").slice(0, 10);
  return extension ? `${base}.${extension}` : base;
}
function normalizeImagePaths(values, maxItems = 5) {
  const raw = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const result = [];
  for (const item of raw) {
    const value = String(item).replace(/[\r\n]/gu, "").trim().slice(0, 500);
    if (value && !result.includes(value)) result.push(value);
    if (result.length >= maxItems) break;
  }
  return result;
}
function extractSearchTerms(query) {
  const normalized = query.toLocaleLowerCase().trim();
  if (!normalized) return [];
  const terms = /* @__PURE__ */ new Set([normalized]);
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

// src/deepseek.ts
var DeepSeekClient = class {
  constructor(getSettings) {
    this.getSettings = getSettings;
  }
  isConfigured() {
    const settings = this.getSettings();
    return settings.deepseekApiKey.trim().length > 0 && settings.deepseekModel.trim().length > 0;
  }
  async generateMetadata(originalContent, category) {
    const prompt = [
      "\u4F60\u662F\u79C1\u4EBA\u4FBF\u5229\u8D34\u7684\u5143\u6570\u636E\u52A9\u624B\u3002\u4E00\u7EA7\u5206\u7C7B\u5DF2\u7ECF\u7531\u7528\u6237\u624B\u52A8\u9009\u62E9\uFF0C\u7EDD\u5BF9\u4E0D\u8981\u4FEE\u6539\u6216\u91CD\u65B0\u5224\u65AD\u4E00\u7EA7\u5206\u7C7B\u3002",
      "\u53EA\u5206\u6790\u539F\u6587\uFF0C\u751F\u6210\u4FBF\u4E8E\u672C\u5730\u68C0\u7D22\u7684\u4E8C\u7EA7\u6807\u7B7E\u548C\u68C0\u7D22\u5173\u952E\u8BCD\u3002",
      '\u8FD4\u56DE\u4E25\u683C JSON\uFF1A{"tags":["..."],"keywords":["..."]}\u3002',
      "tags 2-5 \u4E2A\uFF0Ckeywords 3-8 \u4E2A\uFF0C\u77ED\u8BED\u8981\u7B80\u6D01\uFF1B\u4E0D\u8981\u6DFB\u52A0\u539F\u6587\u6CA1\u6709\u4F9D\u636E\u7684\u4E8B\u5B9E\u3002",
      `\u7528\u6237\u9009\u62E9\u7684\u4E00\u7EA7\u5206\u7C7B\uFF1A${category}`,
      "\u539F\u6587\u5982\u4E0B\uFF1A",
      originalContent
    ].join("\n");
    const content = await this.chat(
      [
        { role: "system", content: "\u53EA\u8F93\u51FA\u5408\u6CD5 JSON\uFF0C\u4E0D\u8981\u4F7F\u7528 Markdown \u4EE3\u7801\u5757\u3002" },
        { role: "user", content: prompt }
      ],
      true
    );
    const parsed = this.parseJsonObject(content);
    return {
      tags: normalizeList(parsed.tags, 5),
      keywords: normalizeList(parsed.keywords, 8)
    };
  }
  async answerFromNotes(question, candidates) {
    const sourceText = candidates.map((record, index) => {
      const body = record.body.length > 3e3 ? `${record.body.slice(0, 3e3)}\u2026` : record.body;
      return `[\u6765\u6E90 ${index + 1}] ${record.file.path}
${body}`;
    }).join("\n\n");
    const prompt = [
      "\u8BF7\u4EC5\u6839\u636E\u4E0B\u65B9\u4FBF\u5229\u8D34\u8D44\u6599\u56DE\u7B54\u7528\u6237\u95EE\u9898\u3002",
      "\u6BCF\u4E2A\u5173\u952E\u7ED3\u8BBA\u5C3D\u91CF\u7528 [\u6765\u6E90 N] \u6807\u6CE8\u4F9D\u636E\u3002",
      "\u5982\u679C\u8D44\u6599\u4E0D\u8DB3\u4EE5\u56DE\u7B54\uFF0C\u660E\u786E\u8BF4\u201C\u5728\u4FBF\u5229\u8D34\u4E2D\u6CA1\u6709\u627E\u5230\u8DB3\u591F\u4F9D\u636E\u201D\uFF0C\u4E0D\u8981\u4F7F\u7528\u5E38\u8BC6\u8865\u5168\u6216\u7F16\u9020\u3002",
      `\u7528\u6237\u95EE\u9898\uFF1A${question}`,
      "\u4FBF\u5229\u8D34\u8D44\u6599\uFF1A",
      sourceText
    ].join("\n\n");
    return this.chat([
      { role: "system", content: "\u4F60\u662F\u8C28\u614E\u7684\u79C1\u4EBA\u8D44\u6599\u95EE\u7B54\u52A9\u624B\uFF0C\u53EA\u80FD\u4F9D\u636E\u63D0\u4F9B\u7684\u4FBF\u5229\u8D34\u8D44\u6599\u56DE\u7B54\u3002" },
      { role: "user", content: prompt }
    ]);
  }
  async chat(messages, jsonMode = false) {
    const settings = this.getSettings();
    const apiKey = settings.deepseekApiKey.trim();
    const model = settings.deepseekModel.trim();
    if (!apiKey || !model) throw new Error("\u8BF7\u5148\u5728\u4FBF\u5229\u8D34\u8BBE\u7F6E\u4E2D\u586B\u5199 DeepSeek API Key \u548C\u6A21\u578B\u540D\u79F0\u3002");
    const body = {
      model,
      messages,
      temperature: 0.2,
      max_tokens: jsonMode ? 800 : 1800,
      stream: false
    };
    if (jsonMode) body.response_format = { type: "json_object" };
    const response = await (0, import_obsidian.requestUrl)({
      url: DEEPSEEK_ENDPOINT,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      throw: false
    });
    const payload = response.json;
    if (response.status < 200 || response.status >= 300) {
      throw new Error(payload?.error?.message || `DeepSeek \u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`);
    }
    const content = payload?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("DeepSeek \u8FD4\u56DE\u4E86\u7A7A\u5185\u5BB9\u3002");
    return content;
  }
  parseJsonObject(content) {
    const cleaned = content.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
    try {
      const value = JSON.parse(cleaned);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {
    }
    throw new Error("DeepSeek \u8FD4\u56DE\u7684\u6807\u7B7E\u683C\u5F0F\u65E0\u6548\u3002");
  }
};

// src/settings.ts
var import_obsidian2 = require("obsidian");
var BianlitieSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("bianlitie-settings");
    containerEl.createEl("h2", { text: "\u4FBF\u5229\u8D34\u8BBE\u7F6E" });
    containerEl.createEl("p", {
      text: "DeepSeek \u662F\u53EF\u9009\u80FD\u529B\u3002\u672A\u914D\u7F6E\u6216\u8BF7\u6C42\u5931\u8D25\u65F6\uFF0C\u539F\u59CB\u4FBF\u5229\u8D34\u4ECD\u4F1A\u6B63\u5E38\u4FDD\u5B58\u5E76\u53EF\u5728\u672C\u5730\u641C\u7D22\u3002",
      cls: "bianlitie-settings__intro"
    });
    new import_obsidian2.Setting(containerEl).setName("DeepSeek API Key").setDesc("\u4EC5\u4FDD\u5B58\u5728 Obsidian \u7684\u63D2\u4EF6\u6570\u636E\u4E2D\uFF0C\u4E0D\u4F1A\u5199\u5165\u6E90\u7801\u3002").addText((text) => {
      text.inputEl.type = "password";
      text.inputEl.autocomplete = "off";
      text.setPlaceholder("sk-\u2026").setValue(this.plugin.settings.deepseekApiKey).onChange(async (value) => {
        this.plugin.settings.deepseekApiKey = value.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian2.Setting(containerEl).setName("\u6A21\u578B\u540D\u79F0").setDesc("\u9ED8\u8BA4\u4F7F\u7528 deepseek-chat\u3002").addText((text) => text.setPlaceholder("deepseek-chat").setValue(this.plugin.settings.deepseekModel).onChange(async (value) => {
      this.plugin.settings.deepseekModel = value.trim();
      await this.plugin.saveSettings();
    }));
  }
};

// src/storage.ts
var import_obsidian3 = require("obsidian");
var NoteConflictError = class extends Error {
  constructor() {
    super("\u8FD9\u6761\u4FBF\u5229\u8D34\u5728\u7F16\u8F91\u671F\u95F4\u5DF2\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u8F7D\u5165\u540E\u518D\u7F16\u8F91\u3002");
    this.name = "NoteConflictError";
  }
};
var StickyNoteStorage = class {
  constructor(app) {
    this.app = app;
  }
  async ensureFolders() {
    await this.ensureFolder(ROOT_FOLDER);
    for (const category of CATEGORIES) {
      await this.ensureFolder((0, import_obsidian3.normalizePath)(`${ROOT_FOLDER}/${category}`));
    }
  }
  async ensureFolder(path) {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian3.TFolder) return;
    if (existing) throw new Error(`${path} \u5DF2\u5B58\u5728\uFF0C\u4F46\u4E0D\u662F\u6587\u4EF6\u5939\u3002`);
    await this.app.vault.createFolder(path);
  }
  async createNote(category, originalContent, manualTags = []) {
    await this.ensureFolders();
    const now = /* @__PURE__ */ new Date();
    const folder = (0, import_obsidian3.normalizePath)(`${ROOT_FOLDER}/${category}`);
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
  uniquePath(folder, baseName) {
    let counter = 0;
    while (true) {
      const suffix = counter === 0 ? "" : `-${counter + 1}`;
      const candidate = (0, import_obsidian3.normalizePath)(`${folder}/${baseName}${suffix}.md`);
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
      counter += 1;
    }
  }
  async updateGeneratedMetadata(file, metadata) {
    if (!this.isManagedFile(file)) throw new Error("\u62D2\u7EDD\u4FEE\u6539\u4FBF\u5229\u8D34\u76EE\u5F55\u4E4B\u5916\u7684\u6587\u4EF6\u3002\u4EE3\u7406\u8F93\u51FA\u7684\u5143\u6570\u636E\u672A\u5199\u5165\u3002");
    const tags = normalizeList(metadata.tags);
    const keywords = normalizeList(metadata.keywords);
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.tags = tags;
      frontmatter.keywords = keywords;
    });
  }
  async saveImages(uploads, savedAt = /* @__PURE__ */ new Date()) {
    if (uploads.length > MAX_IMAGES_PER_NOTE) throw new Error(`\u6BCF\u6761\u4FBF\u5229\u8D34\u6700\u591A\u6DFB\u52A0 ${MAX_IMAGES_PER_NOTE} \u5F20\u56FE\u7247\u3002`);
    const folder = (0, import_obsidian3.normalizePath)(`${ATTACHMENT_ROOT}/${savedAt.getFullYear()}/${pad(savedAt.getMonth() + 1)}`);
    await this.ensureFolderTree(folder);
    const created = [];
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
        }
      }
      throw error;
    }
  }
  async discardCreatedImages(paths) {
    for (const path of normalizeImagePaths(paths, MAX_IMAGES_PER_NOTE)) {
      if (!this.isManagedAttachmentPath(path)) continue;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof import_obsidian3.TFile)) continue;
      try {
        await this.app.vault.trash(file, false);
      } catch (error) {
        console.warn("\u65E0\u6CD5\u56DE\u6536\u672A\u7ED1\u5B9A\u7684\u4FBF\u5229\u8D34\u9644\u4EF6\u3002", error);
      }
    }
  }
  getImageResourcePath(path) {
    const file = this.app.vault.getAbstractFileByPath((0, import_obsidian3.normalizePath)(path));
    if (!(file instanceof import_obsidian3.TFile)) return null;
    const resource = this.app.vault.getResourcePath(file);
    const separator = resource.includes("?") ? "&" : "?";
    return `${resource}${separator}bianlitieMtime=${file.stat.mtime}`;
  }
  async readNote(file) {
    if (!this.isManagedFile(file)) throw new Error("\u8FD9\u4E0D\u662F\u4FBF\u5229\u8D34\u76EE\u5F55\u4E2D\u7684 Markdown \u6587\u4EF6\u3002");
    const raw = await this.app.vault.read(file);
    return this.parseNote(raw, file);
  }
  async readNoteSnapshot(file) {
    if (!this.isManagedFile(file)) throw new Error("\u8FD9\u4E0D\u662F\u4FBF\u5229\u8D34\u76EE\u5F55\u4E2D\u7684 Markdown \u6587\u4EF6\u3002");
    const raw = await this.app.vault.read(file);
    return {
      note: this.parseNote(raw, file),
      raw,
      mtime: file.stat.mtime
    };
  }
  async updateNote(file, expectedRaw, body, manualTags, images, updatedAt) {
    if (!this.isManagedFile(file)) throw new Error("\u62D2\u7EDD\u4FEE\u6539\u4FBF\u5229\u8D34\u76EE\u5F55\u4E4B\u5916\u7684\u6587\u4EF6\u3002");
    await this.app.vault.process(file, (currentRaw) => {
      if (currentRaw !== expectedRaw) throw new NoteConflictError();
      return this.replaceBodyAndUserMetadata(currentRaw, body, manualTags, images, updatedAt);
    });
  }
  async updateImagePath(oldPath, newPath) {
    const normalizedOld = (0, import_obsidian3.normalizePath)(oldPath);
    const normalizedNew = (0, import_obsidian3.normalizePath)(newPath);
    const files = this.app.vault.getMarkdownFiles().filter((file) => this.isManagedFile(file));
    for (const file of files) {
      const note = await this.readNote(file);
      if (!note.images.includes(normalizedOld)) continue;
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter.images = normalizeImagePaths(note.images.map((path) => path === normalizedOld ? normalizedNew : path));
      });
    }
  }
  async trashNote(file) {
    if (!this.isManagedFile(file)) throw new Error("\u62D2\u7EDD\u5220\u9664\u4FBF\u5229\u8D34\u76EE\u5F55\u4E4B\u5916\u7684\u6587\u4EF6\u3002");
    const fileManager = this.app.fileManager;
    if (typeof fileManager.trashFile === "function") {
      await fileManager.trashFile(file);
      return;
    }
    await this.app.vault.trash(file, false);
  }
  async search(query, category = "\u5168\u90E8", limit = 50) {
    const terms = extractSearchTerms(query);
    const records = [];
    const files = this.app.vault.getMarkdownFiles().filter((file) => this.isManagedFile(file));
    for (const file of files) {
      const raw = await this.app.vault.read(file);
      const parsed = this.parseNote(raw, file);
      if (category !== "\u5168\u90E8" && parsed.category !== category) continue;
      const record = this.toRecord(file, parsed, query, terms);
      if (terms.length === 0 || record.score > 0) records.push(record);
    }
    return records.sort((left, right) => right.modifiedTimestamp - left.modifiedTimestamp || right.score - left.score).slice(0, limit);
  }
  async findRelevant(question, limit = 6) {
    return this.search(question, "\u5168\u90E8", limit);
  }
  isManagedFile(file) {
    return file.extension.toLocaleLowerCase() === "md" && CATEGORIES.some((category) => file.path.startsWith(`${ROOT_FOLDER}/${category}/`));
  }
  isManagedAttachmentPath(path) {
    const normalized = (0, import_obsidian3.normalizePath)(path);
    return normalized === ATTACHMENT_ROOT || normalized.startsWith(`${ATTACHMENT_ROOT}/`);
  }
  isImagePath(path) {
    return /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/iu.test(path);
  }
  toRecord(file, parsed, query, terms) {
    const title = makeSnippet(parsed.body, 80) || "\u6682\u65E0\u5185\u5BB9";
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
  parseNote(raw, file) {
    const folderCategory = CATEGORIES.find((category2) => file.path.startsWith(`${ROOT_FOLDER}/${category2}/`));
    const storedCategory = this.readScalar(raw, "category");
    const category = CATEGORIES.find((item) => item === storedCategory) ?? folderCategory ?? "\u5DE5\u4F5C";
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
  replaceBodyAndUserMetadata(raw, body, manualTags, images, updatedAt) {
    const match = raw.match(/^---(\r?\n)([\s\S]*?)(\r?\n)---(?:\r?\n)?/u);
    if (!match) throw new Error("\u4FBF\u5229\u8D34\u7F3A\u5C11\u53EF\u8BC6\u522B\u7684 YAML frontmatter\uFF0C\u5DF2\u505C\u6B62\u4FDD\u5B58\u4EE5\u907F\u514D\u635F\u574F\u6587\u4EF6\u3002");
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
  replaceFrontmatterField(frontmatter, field, value, newline) {
    const lines = frontmatter.split(/\r?\n/u);
    const start = lines.findIndex((line) => new RegExp(`^${field}:`, "u").test(line));
    const replacement = `${field}: ${value}`;
    if (start < 0) return `${frontmatter}${frontmatter ? newline : ""}${replacement}`;
    let end = start + 1;
    while (end < lines.length && /^\s+/u.test(lines[end] ?? "")) end += 1;
    lines.splice(start, end - start, replacement);
    return lines.join(newline);
  }
  async ensureFolderTree(path) {
    const segments = (0, import_obsidian3.normalizePath)(path).split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      await this.ensureFolder(current);
    }
  }
  uniqueAttachmentPath(folder, fileName) {
    const dotIndex = fileName.lastIndexOf(".");
    const hasExtension = dotIndex > 0 && dotIndex < fileName.length - 1;
    const base = hasExtension ? fileName.slice(0, dotIndex) : fileName;
    const extension = hasExtension ? fileName.slice(dotIndex) : "";
    let counter = 1;
    while (true) {
      const suffix = counter === 1 ? "" : `-${counter}`;
      const candidate = (0, import_obsidian3.normalizePath)(`${folder}/${base}${suffix}${extension}`);
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
      counter += 1;
    }
  }
  ensureImageExtension(fileName, mimeType) {
    if (/\.[a-zA-Z0-9]{1,10}$/u.test(fileName)) return fileName;
    const extensions = {
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
  readScalar(raw, field) {
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
    const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, "mu"));
    return match?.[1]?.trim().replace(/^['"]|['"]$/gu, "") ?? "";
  }
  readList(raw, field) {
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
    const inlineMatch = frontmatter.match(new RegExp(`^${field}:\\s*(\\[[^\\r\\n]*\\])\\s*$`, "mu"));
    if (inlineMatch) {
      try {
        const parsed = JSON.parse(inlineMatch[1] ?? "[]");
        if (Array.isArray(parsed)) return parsed.map((item) => String(item));
      } catch {
      }
      return (inlineMatch[1] ?? "").replace(/^\[|\]$/gu, "").split(",").map((item) => item.trim().replace(/^['"]|['"]$/gu, "")).filter(Boolean);
    }
    const blockMatch = frontmatter.match(new RegExp(`^${field}:\\s*\\r?\\n((?:\\s+-\\s+.*(?:\\r?\\n|$))*)`, "mu"));
    if (!blockMatch) return [];
    return (blockMatch[1] ?? "").split(/\r?\n/u).map((line) => line.replace(/^\s+-\s+/u, "").trim().replace(/^['"]|['"]$/gu, "")).filter(Boolean);
  }
};

// src/view.ts
var import_obsidian7 = require("obsidian");

// src/action-modal.ts
var import_obsidian4 = require("obsidian");
var BianlitieActionModal = class extends import_obsidian4.Modal {
  constructor(app, options) {
    super(app);
    this.options = options;
  }
  onOpen() {
    this.modalEl.addClass("bianlitie-action-modal");
    this.titleEl.setText(this.options.title);
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: this.options.message, cls: "bianlitie-action-modal__message" });
    const actions = this.contentEl.createDiv({ cls: "bianlitie-action-modal__actions" });
    const cancelButton = actions.createEl("button", {
      text: this.options.cancelLabel ?? "\u53D6\u6D88",
      attr: { type: "button" }
    });
    const confirmButton = actions.createEl("button", {
      text: this.options.confirmLabel,
      cls: this.options.danger ? "bianlitie-action-modal__danger" : "mod-cta",
      attr: { type: "button" }
    });
    cancelButton.addEventListener("click", () => this.close());
    confirmButton.addEventListener("click", () => {
      this.close();
      void this.options.onConfirm();
    });
    window.setTimeout(() => cancelButton.focus(), 0);
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/ask-modal.ts
var import_obsidian5 = require("obsidian");
var AskStickyNotesModal = class extends import_obsidian5.Modal {
  constructor(app, storage, deepseek) {
    super(app);
    this.storage = storage;
    this.deepseek = deepseek;
  }
  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("bianlitie-ask-modal");
    contentEl.empty();
    const header = contentEl.createDiv({ cls: "bianlitie-ask__header" });
    const icon = header.createSpan({ cls: "bianlitie-ask__icon" });
    (0, import_obsidian5.setIcon)(icon, "message-circle-question");
    const heading = header.createDiv();
    heading.createEl("h2", { text: "\u95EE\u4FBF\u5229\u8D34" });
    heading.createEl("p", { text: "\u5148\u4ECE\u672C\u5730 Markdown \u627E\u8D44\u6599\uFF0C\u518D\u4EA4\u7ED9 DeepSeek \u56DE\u7B54\u3002" });
    const input = contentEl.createEl("textarea", {
      cls: "bianlitie-ask__input",
      attr: {
        rows: "4",
        placeholder: "\u4F8B\u5982\uFF1A\u4E0A\u6B21\u8C08\u5230\u7684\u53D1\u5E03\u8BA1\u5212\u662F\u4EC0\u4E48\uFF1F",
        "aria-label": "\u8F93\u5165\u8981\u5411\u4FBF\u5229\u8D34\u63D0\u95EE\u7684\u95EE\u9898"
      }
    });
    const askButton = contentEl.createEl("button", {
      text: "\u67E5\u627E\u5E76\u56DE\u7B54",
      cls: "bianlitie-primary-button bianlitie-ask__submit"
    });
    const output = contentEl.createDiv({ cls: "bianlitie-ask__output" });
    askButton.addEventListener("click", () => {
      void this.ask(input, askButton, output);
    });
  }
  async ask(input, button, output) {
    const question = input.value.trim();
    if (!question) {
      new import_obsidian5.Notice("\u8BF7\u5148\u8F93\u5165\u95EE\u9898\u3002");
      input.focus();
      return;
    }
    if (!this.deepseek.isConfigured()) {
      new import_obsidian5.Notice("\u8BF7\u5148\u5728\u201C\u8BBE\u7F6E \u2192 \u4FBF\u5229\u8D34\u201D\u4E2D\u586B\u5199 DeepSeek API Key \u548C\u6A21\u578B\u540D\u79F0\u3002");
      return;
    }
    button.disabled = true;
    button.setText("\u6B63\u5728\u672C\u5730\u67E5\u627E\u2026");
    output.empty();
    try {
      const candidates = await this.storage.findRelevant(question, 6);
      if (candidates.length === 0) {
        output.createEl("p", {
          text: "\u5728\u4FBF\u5229\u8D34\u4E2D\u6CA1\u6709\u627E\u5230\u4E0E\u8FD9\u4E2A\u95EE\u9898\u76F8\u5173\u7684\u8D44\u6599\uFF0C\u56E0\u6B64\u6CA1\u6709\u8C03\u7528 DeepSeek\u3002",
          cls: "bianlitie-ask__empty"
        });
        return;
      }
      button.setText("\u6B63\u5728\u4F9D\u636E\u8D44\u6599\u56DE\u7B54\u2026");
      const answer = await this.deepseek.answerFromNotes(question, candidates);
      output.createEl("h3", { text: "\u56DE\u7B54" });
      output.createEl("p", { text: answer, cls: "bianlitie-ask__answer" });
      this.renderSources(output, candidates);
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u95EE\u7B54\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002";
      output.createEl("p", { text: message, cls: "bianlitie-ask__error" });
    } finally {
      button.disabled = false;
      button.setText("\u67E5\u627E\u5E76\u56DE\u7B54");
    }
  }
  renderSources(container, records) {
    container.createEl("h3", { text: "\u5F15\u7528\u6765\u6E90" });
    const list = container.createDiv({ cls: "bianlitie-ask__sources" });
    records.forEach((record, index) => {
      const button = list.createEl("button", {
        cls: "bianlitie-source-link",
        attr: { type: "button" }
      });
      button.createSpan({ text: `[\u6765\u6E90 ${index + 1}]`, cls: "bianlitie-source-link__index" });
      button.createSpan({ text: record.title, cls: "bianlitie-source-link__title" });
      button.addEventListener("click", () => {
        void this.app.workspace.getLeaf(false).openFile(record.file);
        this.close();
      });
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/image-modal.ts
var import_obsidian6 = require("obsidian");
var BianlitieImageModal = class extends import_obsidian6.Modal {
  constructor(app, source, altText) {
    super(app);
    this.source = source;
    this.altText = altText;
  }
  onOpen() {
    this.modalEl.addClass("bianlitie-image-modal");
    this.contentEl.empty();
    const image = this.contentEl.createEl("img", {
      cls: "bianlitie-image-modal__image",
      attr: { src: this.source, alt: this.altText }
    });
    image.addEventListener("click", () => this.close());
    if (this.altText) this.contentEl.createEl("p", { text: this.altText, cls: "bianlitie-image-modal__caption" });
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/view.ts
var BianlitieView = class extends import_obsidian7.ItemView {
  constructor(leaf, storage, deepseek, getManualTagHistory, rememberManualTags) {
    super(leaf);
    this.storage = storage;
    this.deepseek = deepseek;
    this.getManualTagHistory = getManualTagHistory;
    this.rememberManualTags = rememberManualTags;
    this.selectedCategory = null;
    this.searchCategory = "\u5168\u90E8";
    this.searchTimer = null;
    this.vaultRefreshTimer = null;
    this.searchSequence = 0;
    this.pendingImageSequence = 0;
    this.composerDraft = null;
    this.draft = null;
    this.searchUi = null;
    this.viewportCleanup = null;
    this.viewportFrame = null;
    this.keyboardRecoveryFrame = null;
    this.keyboardOpen = false;
    this.activeEditor = null;
  }
  getViewType() {
    return VIEW_TYPE_BIANLITIE;
  }
  getDisplayText() {
    return "\u4FBF\u5229\u8D34";
  }
  getIcon() {
    return "sticky-note";
  }
  async onOpen() {
    this.render();
  }
  render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("bianlitie-view");
    const shell = container.createDiv({ cls: "bianlitie-shell" });
    const header = shell.createEl("header", { cls: "bianlitie-header" });
    const brand = header.createDiv({ cls: "bianlitie-brand" });
    const brandIcon = brand.createSpan({ cls: "bianlitie-brand__icon" });
    (0, import_obsidian7.setIcon)(brandIcon, "sticky-note");
    brand.createEl("h1", { text: "\u4FBF\u5229\u8D34" });
    header.createEl("p", { text: "\u8BB0\u4E0B\u6B64\u523B\uFF0C\u968F\u65F6\u627E\u56DE\u3002" });
    const composer = shell.createEl("section", { cls: "bianlitie-card bianlitie-composer" });
    const categoryLabel = composer.createEl("div", { text: "\u9009\u62E9\u5206\u7C7B", cls: "bianlitie-field-label bianlitie-field-label--first" });
    categoryLabel.createSpan({ text: "\uFF08\u5FC5\u9009\uFF09", cls: "bianlitie-required" });
    const categoryGroup = composer.createDiv({ cls: "bianlitie-segments", attr: { role: "group", "aria-label": "\u9009\u62E9\u4E00\u7EA7\u5206\u7C7B" } });
    const categoryButtons = /* @__PURE__ */ new Map();
    for (const category of CATEGORIES) {
      const button = categoryGroup.createEl("button", { text: category, attr: { type: "button", "aria-pressed": "false" } });
      categoryButtons.set(category, button);
      button.addEventListener("click", () => {
        this.selectedCategory = category;
        for (const [value, item] of categoryButtons) {
          const active = value === category;
          item.toggleClass("is-active", active);
          item.setAttribute("aria-pressed", String(active));
        }
      });
    }
    composer.createEl("h2", { text: "\u4ECA\u5929\u60F3\u8BB0\u70B9\u4EC0\u4E48\uFF1F", cls: "bianlitie-composer__prompt" });
    const textarea = composer.createEl("textarea", {
      cls: "bianlitie-note-input",
      attr: { rows: "4", placeholder: "\u4ECE\u8FD9\u91CC\u5F00\u59CB\u8BB0\u5F55\u2026", "aria-label": "\u4FBF\u5229\u8D34\u5185\u5BB9" }
    });
    this.composerDraft = { manualTags: [], pendingImages: [], saving: false };
    const composerExtras = composer.createDiv({ cls: "bianlitie-composer-extras" });
    const composerTags = composerExtras.createDiv();
    const composerActions = composerExtras.createDiv({ cls: "bianlitie-input-actions" });
    const composerTagAction = composerActions.createDiv({ cls: "bianlitie-input-action" });
    const composerImageAction = composerActions.createDiv({ cls: "bianlitie-input-action" });
    const composerImages = composerExtras.createDiv();
    this.renderComposerExtras(composerTags, composerImages, composerTagAction, composerImageAction);
    const saveButton = composer.createEl("button", {
      text: "\u5B58\u8FDB\u4FBF\u5229\u8D34",
      cls: "bianlitie-primary-button bianlitie-save-button",
      attr: { type: "button" }
    });
    const searchSection = shell.createEl("section", { cls: "bianlitie-search-section" });
    searchSection.createEl("h2", { text: "\u7FFB\u770B\u4FBF\u5229\u8D34" });
    const searchWrap = searchSection.createDiv({ cls: "bianlitie-search-wrap" });
    const searchIcon = searchWrap.createSpan({ cls: "bianlitie-search-icon" });
    (0, import_obsidian7.setIcon)(searchIcon, "search");
    const searchInput = searchWrap.createEl("input", {
      type: "search",
      attr: { placeholder: "\u641C\u7D22\u6B63\u6587\u3001\u6807\u9898\u3001\u6807\u7B7E\u6216\u5173\u952E\u8BCD", "aria-label": "\u641C\u7D22\u4FBF\u5229\u8D34" }
    });
    const filters = searchSection.createDiv({ cls: "bianlitie-filter-row", attr: { role: "group", "aria-label": "\u7B5B\u9009\u4FBF\u5229\u8D34\u5206\u7C7B" } });
    const filterButtons = /* @__PURE__ */ new Map();
    for (const filter of ["\u5168\u90E8", ...CATEGORIES]) {
      const button = filters.createEl("button", { text: filter, attr: { type: "button", "aria-pressed": String(filter === "\u5168\u90E8") } });
      if (filter === "\u5168\u90E8") button.addClass("is-active");
      filterButtons.set(filter, button);
      button.addEventListener("click", () => {
        this.searchCategory = filter;
        for (const [value, item] of filterButtons) {
          const active = value === filter;
          item.toggleClass("is-active", active);
          item.setAttribute("aria-pressed", String(active));
        }
        void this.runSearch(searchInput.value, resultStatus, resultList);
      });
    }
    const resultStatus = searchSection.createDiv({ cls: "bianlitie-result-status" });
    const resultList = searchSection.createDiv({ cls: "bianlitie-results" });
    this.searchUi = { input: searchInput, status: resultStatus, list: resultList, scrollContainer: container };
    const askButton = shell.createEl("button", {
      cls: "bianlitie-ask-button",
      attr: { type: "button", "aria-label": "\u95EE\u4FBF\u5229\u8D34" }
    });
    const askIcon = askButton.createSpan();
    (0, import_obsidian7.setIcon)(askIcon, "message-circle-question");
    askButton.createSpan({ text: "\u95EE\u4FBF\u5229\u8D34", cls: "bianlitie-ask-button__label bianlitie-ask-button__label--full" });
    askButton.createSpan({ text: "\u95EE", cls: "bianlitie-ask-button__label bianlitie-ask-button__label--compact" });
    saveButton.addEventListener("click", () => {
      void this.saveNote(
        textarea,
        saveButton,
        categoryButtons,
        searchInput,
        resultStatus,
        resultList,
        composerTags,
        composerImages,
        composerTagAction,
        composerImageAction
      );
    });
    textarea.addEventListener("input", () => this.resizeNoteInput(textarea));
    textarea.addEventListener("focus", () => this.handleEditorFocus(textarea));
    this.registerDomEvent(window, "resize", () => this.resizeNoteInput(textarea));
    searchInput.addEventListener("input", () => {
      if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => void this.runSearch(searchInput.value, resultStatus, resultList), 180);
    });
    askButton.addEventListener("click", () => new AskStickyNotesModal(this.app, this.storage, this.deepseek).open());
    this.registerVaultRefreshEvents(searchInput, resultStatus, resultList, container);
    this.registerViewportHandling(container);
    void this.runSearch("", resultStatus, resultList);
    window.setTimeout(() => {
      this.resizeNoteInput(textarea, true);
      textarea.focus();
    }, 0);
  }
  renderComposerExtras(tagHost, imageHost, tagActionHost, imageActionHost) {
    this.renderManualTagEditor(
      tagHost,
      tagActionHost,
      () => this.composerDraft?.manualTags ?? [],
      (tags) => {
        if (this.composerDraft) this.composerDraft.manualTags = tags;
      },
      () => this.composerDraft?.saving ?? true
    );
    this.renderImageEditor(
      imageHost,
      imageActionHost,
      () => [],
      () => void 0,
      () => this.composerDraft?.pendingImages ?? [],
      (images) => {
        if (this.composerDraft) this.composerDraft.pendingImages = images;
      },
      () => this.composerDraft?.saving ?? true
    );
  }
  registerVaultRefreshEvents(searchInput, status, list, scrollContainer) {
    const scheduleForPaths = (...paths) => {
      if (paths.some((path) => this.isManagedNotePath(path) || this.storage.isManagedAttachmentPath(path))) {
        this.scheduleVaultRefresh(searchInput, status, list, scrollContainer);
      }
    };
    this.registerEvent(this.app.vault.on("modify", (file) => scheduleForPaths(file.path)));
    this.registerEvent(this.app.vault.on("create", (file) => scheduleForPaths(file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (this.draft?.path === file.path) {
        this.revokePendingImages(this.draft.pendingImages);
        this.draft = null;
      }
      scheduleForPaths(file.path);
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (this.draft?.path === oldPath) {
        if (this.isManagedNotePath(file.path)) this.draft.path = file.path;
        else {
          this.revokePendingImages(this.draft.pendingImages);
          this.draft = null;
        }
      }
      scheduleForPaths(file.path, oldPath);
    }));
  }
  isManagedNotePath(path) {
    if (!path.toLocaleLowerCase().endsWith(".md")) return false;
    return CATEGORIES.some((category) => path.startsWith(`${ROOT_FOLDER}/${category}/`));
  }
  scheduleVaultRefresh(searchInput, status, list, scrollContainer) {
    if (this.vaultRefreshTimer !== null) window.clearTimeout(this.vaultRefreshTimer);
    this.vaultRefreshTimer = window.setTimeout(() => {
      this.vaultRefreshTimer = null;
      const scrollTop = scrollContainer.scrollTop;
      void this.runSearch(searchInput.value, status, list, false).then(() => {
        window.requestAnimationFrame(() => {
          if (scrollContainer.isConnected) scrollContainer.scrollTop = scrollTop;
        });
      });
    }, 250);
  }
  resizeNoteInput(textarea, allowShrink = false) {
    const styles = window.getComputedStyle(textarea);
    const minHeight = Number.parseFloat(styles.minHeight) || 132;
    const maxHeight = Number.parseFloat(styles.maxHeight) || 232;
    const borderHeight = (Number.parseFloat(styles.borderTopWidth) || 0) + (Number.parseFloat(styles.borderBottomWidth) || 0);
    const currentHeight = textarea.getBoundingClientRect().height || minHeight;
    if (allowShrink) textarea.style.height = "auto";
    const contentHeight = textarea.scrollHeight + borderHeight;
    const stableHeight = allowShrink ? contentHeight : Math.max(contentHeight, currentHeight);
    textarea.style.height = `${Math.min(Math.max(stableHeight, minHeight), maxHeight)}px`;
    textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }
  registerViewportHandling(container) {
    this.viewportCleanup?.();
    const visualViewport = window.visualViewport;
    const update = () => {
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const measuredInset = visualViewport ? Math.max(0, window.innerHeight - viewportHeight) : 0;
      const keyboardHeight = measuredInset >= 72 ? measuredInset : 0;
      const wasKeyboardOpen = this.keyboardOpen;
      const isKeyboardOpen = keyboardHeight > 0;
      this.keyboardOpen = isKeyboardOpen;
      container.style.setProperty("--bianlitie-keyboard-height", `${Math.round(keyboardHeight)}px`);
      container.style.setProperty("--bianlitie-visual-viewport-height", `${Math.round(viewportHeight)}px`);
      container.toggleClass("is-keyboard-open", isKeyboardOpen);
      if (wasKeyboardOpen && !isKeyboardOpen) this.scheduleKeyboardRecovery();
      else if (isKeyboardOpen) {
        if (this.keyboardRecoveryFrame !== null) window.cancelAnimationFrame(this.keyboardRecoveryFrame);
        this.keyboardRecoveryFrame = null;
        this.scheduleFocusedInputVisibility();
      }
    };
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    this.viewportCleanup = () => {
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      container.style.removeProperty("--bianlitie-keyboard-height");
      container.style.removeProperty("--bianlitie-visual-viewport-height");
      container.removeClass("is-keyboard-open");
      this.keyboardOpen = false;
    };
    update();
  }
  scheduleFocusedInputVisibility() {
    if (!window.matchMedia("(max-width: 600px)").matches) return;
    if (this.viewportFrame !== null) window.cancelAnimationFrame(this.viewportFrame);
    this.viewportFrame = window.requestAnimationFrame(() => {
      this.viewportFrame = null;
      this.keepFocusedInputVisible();
    });
  }
  handleEditorFocus(textarea) {
    this.activeEditor = textarea;
    this.scheduleFocusedInputVisibility();
  }
  scheduleKeyboardRecovery() {
    if (!window.matchMedia("(max-width: 600px)").matches) return;
    if (this.keyboardRecoveryFrame !== null) window.cancelAnimationFrame(this.keyboardRecoveryFrame);
    this.keyboardRecoveryFrame = window.requestAnimationFrame(() => {
      this.keyboardRecoveryFrame = null;
      this.recoverActiveEditorPosition();
    });
  }
  recoverActiveEditorPosition() {
    const editor = this.activeEditor;
    if (this.keyboardOpen || !editor?.isConnected) return;
    if (!editor.matches(".bianlitie-note-input, .bianlitie-draft-input")) return;
    this.positionEditorNearViewportTop(editor, false);
  }
  positionEditorNearViewportTop(editor, force) {
    const ui = this.searchUi;
    if (!ui || !editor.isConnected) return;
    const visualViewport = window.visualViewport;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (visualViewport?.height ?? window.innerHeight);
    const containerBounds = ui.scrollContainer.getBoundingClientRect();
    const desiredTop = Math.max(viewportTop, containerBounds.top) + 20;
    const visibleBottom = Math.min(viewportBottom, containerBounds.bottom) - 20;
    const editorBounds = editor.getBoundingClientRect();
    if (!force && editorBounds.top >= desiredTop && editorBounds.bottom <= visibleBottom) return;
    const delta = editorBounds.top - desiredTop;
    if (Math.abs(delta) < 2) return;
    ui.scrollContainer.scrollTop = Math.max(0, ui.scrollContainer.scrollTop + delta);
  }
  keepFocusedInputVisible() {
    const ui = this.searchUi;
    const active = document.activeElement;
    if (!ui || !(active instanceof HTMLTextAreaElement) || !active.isConnected) return;
    if (!active.matches(".bianlitie-note-input, .bianlitie-draft-input")) return;
    const visualViewport = window.visualViewport;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (visualViewport?.height ?? window.innerHeight);
    const containerBounds = ui.scrollContainer.getBoundingClientRect();
    const margin = 16;
    const bounds = active.getBoundingClientRect();
    const visibleTop = Math.max(viewportTop, containerBounds.top) + margin;
    const visibleBottom = Math.min(viewportBottom, containerBounds.bottom) - margin;
    if (bounds.bottom > visibleBottom) {
      ui.scrollContainer.scrollTop += bounds.bottom - visibleBottom;
    } else if (bounds.top < visibleTop) {
      ui.scrollContainer.scrollTop -= visibleTop - bounds.top;
    }
  }
  async saveNote(textarea, button, categoryButtons, searchInput, resultStatus, resultList, tagHost, imageHost, tagActionHost, imageActionHost) {
    const originalContent = textarea.value;
    const composerDraft = this.composerDraft;
    if (!composerDraft || composerDraft.saving) return;
    if (!originalContent.trim()) {
      new import_obsidian7.Notice("\u8BF7\u5148\u5199\u4E0B\u8981\u8BB0\u5F55\u7684\u5185\u5BB9\u3002");
      textarea.focus();
      return;
    }
    if (!this.selectedCategory) {
      new import_obsidian7.Notice("\u4FDD\u5B58\u524D\u8BF7\u9009\u62E9\u5DE5\u4F5C\u3001\u751F\u6D3B\u6216\u526F\u4E1A\u3002");
      return;
    }
    const category = this.selectedCategory;
    const manualTags = [...composerDraft.manualTags];
    const pendingImages = [...composerDraft.pendingImages];
    composerDraft.saving = true;
    button.disabled = true;
    button.setText("\u6B63\u5728\u4FDD\u5B58\u2026");
    this.renderComposerExtras(tagHost, imageHost, tagActionHost, imageActionHost);
    try {
      const file = await this.storage.createNote(category, originalContent, manualTags);
      if (pendingImages.length > 0) {
        let imagePaths = [];
        try {
          const uploads = await this.toImageUploads(pendingImages);
          imagePaths = await this.storage.saveImages(uploads);
          const snapshot = await this.storage.readNoteSnapshot(file);
          await this.storage.updateNote(file, snapshot.raw, snapshot.note.body, manualTags, imagePaths, null);
        } catch (error) {
          if (imagePaths.length > 0) await this.storage.discardCreatedImages(imagePaths);
          console.warn("\u4FBF\u5229\u8D34\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u56FE\u7247\u4FDD\u5B58\u5931\u8D25\u3002", error);
          new import_obsidian7.Notice("\u4FBF\u5229\u8D34\u6B63\u6587\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u56FE\u7247\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u7F16\u8F91\u6DFB\u52A0\u3002");
        }
      }
      this.rememberManualTags(manualTags);
      this.revokePendingImages(composerDraft.pendingImages);
      this.composerDraft = { manualTags: [], pendingImages: [], saving: false };
      this.renderComposerExtras(tagHost, imageHost, tagActionHost, imageActionHost);
      textarea.value = "";
      this.resizeNoteInput(textarea);
      this.selectedCategory = null;
      for (const item of categoryButtons.values()) {
        item.removeClass("is-active");
        item.setAttribute("aria-pressed", "false");
      }
      new import_obsidian7.Notice(`\u5DF2\u5B58\u8FDB\u300C${category}\u300D\u4FBF\u5229\u8D34\u3002`);
      await this.runSearch(searchInput.value, resultStatus, resultList);
      if (this.deepseek.isConfigured()) void this.enrichNote(file, originalContent, category);
    } catch (error) {
      composerDraft.saving = false;
      const message = error instanceof Error ? error.message : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002";
      new import_obsidian7.Notice(message);
      this.renderComposerExtras(tagHost, imageHost, tagActionHost, imageActionHost);
    } finally {
      button.disabled = false;
      button.setText("\u5B58\u8FDB\u4FBF\u5229\u8D34");
    }
  }
  async enrichNote(file, originalContent, category) {
    try {
      const metadata = await this.deepseek.generateMetadata(originalContent, category);
      await this.storage.updateGeneratedMetadata(file, metadata);
      new import_obsidian7.Notice("\u4FBF\u5229\u8D34\u5DF2\u8865\u5145\u6807\u7B7E\u4E0E\u68C0\u7D22\u5173\u952E\u8BCD\u3002");
    } catch (error) {
      console.warn("\u4FBF\u5229\u8D34\u5DF2\u4FDD\u5B58\uFF0C\u4F46 DeepSeek \u5143\u6570\u636E\u751F\u6210\u5931\u8D25\u3002", error);
      new import_obsidian7.Notice("\u4FBF\u5229\u8D34\u5DF2\u4FDD\u5B58\uFF1BAI \u6807\u7B7E\u751F\u6210\u5931\u8D25\uFF0C\u4E0D\u5F71\u54CD\u539F\u6587\u3002");
    }
  }
  async runSearch(query, status, list, showLoading = true) {
    const sequence = ++this.searchSequence;
    if (showLoading) status.setText("\u6B63\u5728\u672C\u5730\u67E5\u627E\u2026");
    try {
      const records = await this.storage.search(query, this.searchCategory, 50);
      if (sequence !== this.searchSequence) return;
      status.setText(query.trim() ? `\u627E\u5230 ${records.length} \u6761\u7ED3\u679C` : `\u6700\u8FD1 ${records.length} \u6761\u4FBF\u5229\u8D34`);
      this.renderResults(list, records);
    } catch (error) {
      if (sequence !== this.searchSequence) return;
      status.setText(error instanceof Error ? error.message : "\u641C\u7D22\u5931\u8D25\u3002");
      list.empty();
    }
  }
  renderResults(container, records) {
    container.empty();
    if (records.length === 0) {
      const empty = container.createDiv({ cls: "bianlitie-empty" });
      const icon = empty.createSpan();
      (0, import_obsidian7.setIcon)(icon, "inbox");
      empty.createEl("p", { text: "\u8FD8\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u4FBF\u5229\u8D34\u3002" });
      return;
    }
    for (const record of records) {
      const isEditing = this.draft?.path === record.file.path;
      const openLabel = `\u6253\u5F00\uFF1A${record.title}`;
      const card = container.createDiv({
        cls: "bianlitie-result-card",
        attr: { role: "button", tabindex: "0", "aria-label": openLabel, title: openLabel }
      });
      const top = card.createDiv({ cls: "bianlitie-result-card__top" });
      top.createSpan({ text: record.category, cls: "bianlitie-category-chip" });
      top.createSpan({ text: record.modified || "\u672A\u8BB0\u5F55\u65F6\u95F4", cls: "bianlitie-created" });
      card.createEl("p", { text: record.snippet || "\u6682\u65E0\u5185\u5BB9", cls: "bianlitie-body-preview" });
      this.renderVisibleManualTags(card, record.manualTags);
      this.renderCardImages(card, record.images);
      const actions = card.createDiv({ cls: "bianlitie-result-actions" });
      const editButton = actions.createEl("button", {
        text: "\u7F16\u8F91",
        cls: "bianlitie-result-action bianlitie-result-action--edit",
        attr: { type: "button", "aria-label": `\u7F16\u8F91\uFF1A${record.title}` }
      });
      const deleteButton = actions.createEl("button", {
        text: "\u5220\u9664",
        cls: "bianlitie-result-action bianlitie-result-action--delete",
        attr: { type: "button", "aria-label": `\u5220\u9664\uFF1A${record.title}` }
      });
      editButton.disabled = isEditing;
      editButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.beginEdit(record);
      });
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        this.requestDelete(record);
      });
      if (isEditing && this.draft) this.renderDraftEditor(card, this.draft);
      card.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(record.file));
      card.addEventListener("keydown", (event) => {
        if (event.target !== card || event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        void this.app.workspace.getLeaf(false).openFile(record.file);
      });
    }
  }
  renderVisibleManualTags(card, tags) {
    if (tags.length === 0) return;
    const row = card.createDiv({ cls: "bianlitie-card-tags", attr: { "aria-label": "\u624B\u52A8\u6807\u7B7E" } });
    for (const tag of tags) row.createSpan({ text: `#${tag}`, cls: "bianlitie-card-tag" });
  }
  renderCardImages(card, imagePaths) {
    const available = imagePaths.map((path) => ({ path, source: this.storage.getImageResourcePath(path) })).filter((item) => item.source !== null).slice(0, 3);
    if (available.length === 0) return;
    const gallery = card.createDiv({ cls: `bianlitie-card-images bianlitie-card-images--${available.length}` });
    gallery.addEventListener("click", (event) => event.stopPropagation());
    for (const item of available) {
      const button = gallery.createEl("button", { cls: "bianlitie-thumbnail", attr: { type: "button", "aria-label": "\u67E5\u770B\u4FBF\u5229\u8D34\u56FE\u7247" } });
      button.createEl("img", { attr: { src: item.source, alt: item.path, loading: "lazy" } });
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        new BianlitieImageModal(this.app, item.source, item.path.split("/").pop() ?? "\u4FBF\u5229\u8D34\u56FE\u7247").open();
      });
    }
  }
  renderDraftEditor(card, draft) {
    const editor = card.createDiv({ cls: "bianlitie-draft-editor" });
    editor.addEventListener("click", (event) => event.stopPropagation());
    editor.addEventListener("keydown", (event) => event.stopPropagation());
    const textarea = editor.createEl("textarea", {
      cls: "bianlitie-draft-input",
      attr: { rows: "6", "aria-label": "\u7F16\u8F91\u4FBF\u5229\u8D34\u6B63\u6587" }
    });
    textarea.value = draft.body;
    textarea.disabled = draft.saving;
    textarea.addEventListener("focus", () => this.handleEditorFocus(textarea));
    textarea.addEventListener("input", () => {
      if (this.draft?.path === draft.path && !this.draft.saving) this.draft.body = textarea.value;
    });
    const extras = editor.createDiv({ cls: "bianlitie-draft-extras" });
    const tagHost = extras.createDiv();
    const actions = extras.createDiv({ cls: "bianlitie-input-actions" });
    const tagAction = actions.createDiv({ cls: "bianlitie-input-action" });
    const imageAction = actions.createDiv({ cls: "bianlitie-input-action" });
    const imageHost = extras.createDiv();
    this.renderManualTagEditor(
      tagHost,
      tagAction,
      () => this.draft?.path === draft.path ? this.draft.manualTags : [],
      (tags) => {
        if (this.draft?.path === draft.path) this.draft.manualTags = tags;
      },
      () => this.draft?.path !== draft.path || this.draft.saving
    );
    this.renderImageEditor(
      imageHost,
      imageAction,
      () => this.draft?.path === draft.path ? this.draft.images : [],
      (images) => {
        if (this.draft?.path === draft.path) this.draft.images = images;
      },
      () => this.draft?.path === draft.path ? this.draft.pendingImages : [],
      (images) => {
        if (this.draft?.path === draft.path) this.draft.pendingImages = images;
      },
      () => this.draft?.path !== draft.path || this.draft.saving
    );
    const controls = editor.createDiv({ cls: "bianlitie-draft-actions" });
    const cancelButton = controls.createEl("button", { text: "\u53D6\u6D88", cls: "bianlitie-draft-cancel", attr: { type: "button" } });
    const saveButton = controls.createEl("button", {
      text: draft.saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58",
      cls: "bianlitie-draft-save",
      attr: { type: "button" }
    });
    cancelButton.disabled = draft.saving;
    saveButton.disabled = draft.saving;
    cancelButton.addEventListener("click", () => this.cancelDraft(draft.path));
    saveButton.addEventListener("click", () => void this.saveDraft(draft.path));
  }
  renderManualTagEditor(holder, actionHost, getTags, setTags, isDisabled) {
    let expanded = false;
    const render = () => {
      holder.empty();
      actionHost.empty();
      holder.addClass("bianlitie-tag-editor");
      holder.toggleClass("is-disabled", isDisabled());
      const row = holder.createDiv({ cls: "bianlitie-tag-row" });
      for (const tag of getTags()) {
        const chip = row.createSpan({ cls: "bianlitie-manual-tag" });
        chip.createSpan({ text: `#${tag}` });
        const remove = chip.createEl("button", { attr: { type: "button", "aria-label": `\u5220\u9664\u6807\u7B7E ${tag}` } });
        (0, import_obsidian7.setIcon)(remove, "x");
        remove.disabled = isDisabled();
        remove.addEventListener("click", () => {
          if (isDisabled()) return;
          setTags(getTags().filter((item) => item !== tag));
          render();
        });
      }
      const addButton = actionHost.createEl("button", {
        text: "# \u6DFB\u52A0\u6807\u7B7E",
        cls: "bianlitie-add-tag",
        attr: { type: "button", "aria-expanded": String(expanded) }
      });
      addButton.disabled = isDisabled();
      addButton.addEventListener("click", () => {
        if (isDisabled()) return;
        expanded = !expanded;
        render();
        if (expanded) window.setTimeout(() => holder.querySelector(".bianlitie-tag-input")?.focus(), 0);
      });
      if (!expanded) return;
      const panel = holder.createDiv({ cls: "bianlitie-tag-panel" });
      const inputRow = panel.createDiv({ cls: "bianlitie-tag-input-row" });
      const input = inputRow.createEl("input", {
        type: "text",
        cls: "bianlitie-tag-input",
        attr: { placeholder: "\u8F93\u5165\u6807\u7B7E\u540D\u79F0", "aria-label": "\u65B0\u624B\u52A8\u6807\u7B7E" }
      });
      const confirm = inputRow.createEl("button", { text: "\u6DFB\u52A0", attr: { type: "button" } });
      const addValue = () => {
        const tag = normalizeManualTag(input.value);
        if (!tag) return;
        const tags = normalizeManualTags([...getTags(), tag]);
        if (tags.length === getTags().length) {
          input.value = "";
          return;
        }
        setTags(tags);
        input.value = "";
        render();
      };
      confirm.addEventListener("click", addValue);
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        addValue();
      });
      const history = normalizeManualTags(this.getManualTagHistory(), 50).filter((tag) => !getTags().includes(tag));
      if (history.length > 0) {
        panel.createDiv({ text: "\u5386\u53F2\u6807\u7B7E", cls: "bianlitie-tag-history-label" });
        const historyRow = panel.createDiv({ cls: "bianlitie-tag-history" });
        for (const tag of history) {
          const button = historyRow.createEl("button", { text: `#${tag}`, attr: { type: "button" } });
          button.addEventListener("click", () => {
            setTags(normalizeManualTags([...getTags(), tag]));
            render();
          });
        }
      }
    };
    render();
  }
  renderImageEditor(holder, actionHost, getExisting, setExisting, getPending, setPending, isDisabled) {
    const render = () => {
      holder.empty();
      actionHost.empty();
      holder.addClass("bianlitie-image-editor");
      const existing = getExisting();
      const pending = getPending();
      const gallery = holder.createDiv({ cls: "bianlitie-edit-images" });
      for (const path of existing) {
        const source = this.storage.getImageResourcePath(path);
        this.renderEditableImage(gallery, source, path.split("/").pop() ?? "\u4FBF\u5229\u8D34\u56FE\u7247", () => {
          if (isDisabled()) return;
          setExisting(getExisting().filter((item) => item !== path));
          render();
        });
      }
      for (const image of pending) {
        this.renderEditableImage(gallery, image.previewUrl, image.file.name, () => {
          if (isDisabled()) return;
          URL.revokeObjectURL(image.previewUrl);
          setPending(getPending().filter((item) => item.id !== image.id));
          render();
        });
      }
      const input = actionHost.createEl("input", {
        type: "file",
        cls: "bianlitie-image-input",
        attr: { accept: "image/*", multiple: "", "aria-label": "\u9009\u62E9\u4FBF\u5229\u8D34\u56FE\u7247" }
      });
      const addButton = actionHost.createEl("button", {
        cls: "bianlitie-add-image",
        attr: { type: "button" }
      });
      const icon = addButton.createSpan();
      (0, import_obsidian7.setIcon)(icon, "image-plus");
      addButton.createSpan({ text: `\u6DFB\u52A0\u56FE\u7247 ${existing.length + pending.length}/${MAX_IMAGES_PER_NOTE}` });
      addButton.disabled = isDisabled() || existing.length + pending.length >= MAX_IMAGES_PER_NOTE;
      addButton.addEventListener("click", () => {
        if (!addButton.disabled) input.click();
      });
      input.addEventListener("change", () => {
        if (isDisabled()) return;
        const available = MAX_IMAGES_PER_NOTE - getExisting().length - getPending().length;
        const selected = Array.from(input.files ?? []).filter((file) => this.isImageFile(file));
        if (selected.length > available) new import_obsidian7.Notice(`\u6BCF\u6761\u4FBF\u5229\u8D34\u6700\u591A\u6DFB\u52A0 ${MAX_IMAGES_PER_NOTE} \u5F20\u56FE\u7247\u3002`);
        const next = selected.slice(0, Math.max(0, available)).map((file) => ({
          id: `${Date.now()}-${this.pendingImageSequence += 1}`,
          file,
          previewUrl: URL.createObjectURL(file)
        }));
        setPending([...getPending(), ...next]);
        input.value = "";
        render();
      });
    };
    render();
  }
  renderEditableImage(gallery, source, label, onRemove) {
    const item = gallery.createDiv({ cls: "bianlitie-edit-image" });
    const preview = item.createEl("button", { cls: "bianlitie-edit-image__preview", attr: { type: "button", "aria-label": `\u67E5\u770B ${label}` } });
    if (source) {
      preview.createEl("img", { attr: { src: source, alt: label } });
      preview.addEventListener("click", () => new BianlitieImageModal(this.app, source, label).open());
    } else {
      preview.createSpan({ text: "\u56FE\u7247\u5DF2\u79FB\u52A8", cls: "bianlitie-image-missing" });
      preview.disabled = true;
    }
    const remove = item.createEl("button", { cls: "bianlitie-edit-image__remove", attr: { type: "button", "aria-label": `\u79FB\u9664 ${label}` } });
    (0, import_obsidian7.setIcon)(remove, "x");
    remove.addEventListener("click", onRemove);
  }
  async beginEdit(record) {
    if (this.draft?.path === record.file.path) {
      this.focusDraftEditor();
      return;
    }
    if (this.draft && this.isDraftDirty(this.draft)) {
      new import_obsidian7.Notice("\u8BF7\u5148\u4FDD\u5B58\u6216\u53D6\u6D88\u5F53\u524D\u8349\u7A3F\uFF0C\u518D\u7F16\u8F91\u53E6\u4E00\u6761\u4FBF\u5229\u8D34\u3002");
      return;
    }
    if (this.draft) this.revokePendingImages(this.draft.pendingImages);
    const current = this.app.vault.getAbstractFileByPath(record.file.path);
    if (!(current instanceof import_obsidian7.TFile) || !this.storage.isManagedFile(current)) {
      new import_obsidian7.Notice("\u8FD9\u6761\u4FBF\u5229\u8D34\u5DF2\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u79FB\u52A8\u3002");
      return;
    }
    try {
      const snapshot = await this.storage.readNoteSnapshot(current);
      this.draft = {
        path: current.path,
        body: snapshot.note.body,
        baseBody: snapshot.note.body,
        manualTags: [...snapshot.note.manualTags],
        baseManualTags: [...snapshot.note.manualTags],
        images: [...snapshot.note.images],
        baseImages: [...snapshot.note.images],
        pendingImages: [],
        baseRaw: snapshot.raw,
        baseMtime: snapshot.mtime,
        saving: false
      };
      await this.refreshResults(false);
      this.focusDraftEditor();
    } catch (error) {
      new import_obsidian7.Notice(error instanceof Error ? error.message : "\u65E0\u6CD5\u8BFB\u53D6\u4FBF\u5229\u8D34\u6B63\u6587\u3002");
    }
  }
  cancelDraft(path) {
    if (this.draft?.path !== path || this.draft.saving) return;
    this.revokePendingImages(this.draft.pendingImages);
    this.draft = null;
    void this.refreshResults(false);
  }
  async saveDraft(path) {
    const draft = this.draft;
    if (!draft || draft.path !== path || draft.saving) return;
    const current = this.app.vault.getAbstractFileByPath(path);
    if (!(current instanceof import_obsidian7.TFile) || !this.storage.isManagedFile(current)) {
      this.showConflict(path);
      return;
    }
    let createdImagePaths = [];
    let noteUpdated = false;
    try {
      const snapshot = await this.storage.readNoteSnapshot(current);
      if (snapshot.raw !== draft.baseRaw || snapshot.mtime !== draft.baseMtime) {
        this.showConflict(path);
        return;
      }
      const bodyChanged = draft.body !== snapshot.note.body;
      const tagsChanged = !this.sameStringArray(draft.manualTags, snapshot.note.manualTags);
      const imagesChanged = !this.sameStringArray(draft.images, snapshot.note.images) || draft.pendingImages.length > 0;
      if (!bodyChanged && !tagsChanged && !imagesChanged) {
        this.revokePendingImages(draft.pendingImages);
        this.draft = null;
        await this.refreshResults(false);
        return;
      }
      draft.saving = true;
      await this.refreshResults(false);
      if (draft.pendingImages.length > 0) {
        createdImagePaths = await this.storage.saveImages(await this.toImageUploads(draft.pendingImages));
      }
      const finalImages = [...draft.images, ...createdImagePaths].slice(0, MAX_IMAGES_PER_NOTE);
      await this.storage.updateNote(
        current,
        snapshot.raw,
        draft.body,
        draft.manualTags,
        finalImages,
        bodyChanged ? /* @__PURE__ */ new Date() : null
      );
      noteUpdated = true;
      this.rememberManualTags(draft.manualTags);
      if (bodyChanged && this.deepseek.isConfigured() && draft.body.trim()) {
        try {
          const metadata = await this.deepseek.generateMetadata(draft.body, snapshot.note.category);
          const latestFile = this.app.vault.getAbstractFileByPath(path);
          if (!(latestFile instanceof import_obsidian7.TFile) || !this.storage.isManagedFile(latestFile)) {
            throw new Error("\u4FBF\u5229\u8D34\u5728\u751F\u6210\u6807\u7B7E\u671F\u95F4\u5DF2\u88AB\u79FB\u52A8\u6216\u5220\u9664\u3002");
          }
          const latest = await this.storage.readNote(latestFile);
          if (latest.body !== draft.body) throw new Error("\u6B63\u6587\u5728\u751F\u6210\u6807\u7B7E\u671F\u95F4\u53D1\u751F\u4E86\u53D8\u5316\u3002");
          await this.storage.updateGeneratedMetadata(latestFile, metadata);
        } catch (error) {
          console.warn("\u4FBF\u5229\u8D34\u5DF2\u4FDD\u5B58\uFF0C\u4F46 DeepSeek \u5143\u6570\u636E\u751F\u6210\u5931\u8D25\u3002", error);
          new import_obsidian7.Notice("\u4FBF\u5229\u8D34\u5DF2\u4FDD\u5B58\uFF1BAI \u6807\u7B7E\u751F\u6210\u5931\u8D25\uFF0C\u4E0D\u5F71\u54CD\u539F\u6587\u3002");
        }
      }
      this.revokePendingImages(draft.pendingImages);
      this.draft = null;
      new import_obsidian7.Notice("\u4FBF\u5229\u8D34\u5DF2\u4FDD\u5B58\u3002");
      await this.refreshResults(false);
    } catch (error) {
      if (!noteUpdated && createdImagePaths.length > 0) await this.storage.discardCreatedImages(createdImagePaths);
      if (this.draft?.path === path) this.draft.saving = false;
      if (error instanceof NoteConflictError) this.showConflict(path);
      else {
        new import_obsidian7.Notice(error instanceof Error ? error.message : "\u4FBF\u5229\u8D34\u4FDD\u5B58\u5931\u8D25\u3002");
        await this.refreshResults(false);
      }
    }
  }
  showConflict(path) {
    new BianlitieActionModal(this.app, {
      title: "\u4FBF\u5229\u8D34\u5DF2\u53D1\u751F\u53D8\u5316",
      message: "\u8FD9\u6761\u4FBF\u5229\u8D34\u5728\u7F16\u8F91\u671F\u95F4\u5DF2\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u8F7D\u5165\u540E\u518D\u7F16\u8F91\u3002",
      confirmLabel: "\u91CD\u65B0\u8F7D\u5165",
      onConfirm: async () => this.reloadDraft(path)
    }).open();
  }
  async reloadDraft(path) {
    const current = this.app.vault.getAbstractFileByPath(path);
    if (!(current instanceof import_obsidian7.TFile) || !this.storage.isManagedFile(current)) {
      if (this.draft) this.revokePendingImages(this.draft.pendingImages);
      this.draft = null;
      new import_obsidian7.Notice("\u8FD9\u6761\u4FBF\u5229\u8D34\u5DF2\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u79FB\u52A8\u3002");
      await this.refreshResults(false);
      return;
    }
    try {
      const snapshot = await this.storage.readNoteSnapshot(current);
      if (this.draft) this.revokePendingImages(this.draft.pendingImages);
      this.draft = {
        path: current.path,
        body: snapshot.note.body,
        baseBody: snapshot.note.body,
        manualTags: [...snapshot.note.manualTags],
        baseManualTags: [...snapshot.note.manualTags],
        images: [...snapshot.note.images],
        baseImages: [...snapshot.note.images],
        pendingImages: [],
        baseRaw: snapshot.raw,
        baseMtime: snapshot.mtime,
        saving: false
      };
      await this.refreshResults(false);
      this.focusDraftEditor();
    } catch (error) {
      new import_obsidian7.Notice(error instanceof Error ? error.message : "\u91CD\u65B0\u8F7D\u5165\u4FBF\u5229\u8D34\u5931\u8D25\u3002");
    }
  }
  requestDelete(record) {
    new BianlitieActionModal(this.app, {
      title: "\u5220\u9664\u4FBF\u5229\u8D34",
      message: "\u786E\u5B9A\u5220\u9664\u8FD9\u6761\u4FBF\u5229\u8D34\u5417\uFF1F\u5BF9\u5E94 Markdown \u6587\u4EF6\u5C06\u79FB\u5165\u56DE\u6536\u7AD9\uFF1B\u9644\u4EF6\u4F1A\u4FDD\u7559\u4EE5\u907F\u514D\u8BEF\u5220\u3002",
      confirmLabel: "\u5220\u9664",
      danger: true,
      onConfirm: async () => this.deleteNote(record.file.path)
    }).open();
  }
  async deleteNote(path) {
    const current = this.app.vault.getAbstractFileByPath(path);
    if (!(current instanceof import_obsidian7.TFile) || !this.storage.isManagedFile(current)) {
      new import_obsidian7.Notice("\u8FD9\u6761\u4FBF\u5229\u8D34\u5DF2\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u79FB\u52A8\u3002");
      await this.refreshResults(false);
      return;
    }
    try {
      await this.storage.trashNote(current);
      if (this.draft?.path === path) {
        this.revokePendingImages(this.draft.pendingImages);
        this.draft = null;
      }
      new import_obsidian7.Notice("\u4FBF\u5229\u8D34\u5DF2\u79FB\u5165\u56DE\u6536\u7AD9\uFF1B\u9644\u4EF6\u5DF2\u4FDD\u7559\u3002");
      await this.refreshResults(false);
    } catch (error) {
      new import_obsidian7.Notice(error instanceof Error ? error.message : "\u5220\u9664\u4FBF\u5229\u8D34\u5931\u8D25\u3002");
    }
  }
  isDraftDirty(draft) {
    return draft.body !== draft.baseBody || !this.sameStringArray(draft.manualTags, draft.baseManualTags) || !this.sameStringArray(draft.images, draft.baseImages) || draft.pendingImages.length > 0;
  }
  sameStringArray(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  async toImageUploads(images) {
    return Promise.all(images.map(async (image) => ({
      name: image.file.name,
      mimeType: image.file.type,
      data: await image.file.arrayBuffer()
    })));
  }
  isImageFile(file) {
    if (file.type.startsWith("image/")) return true;
    return /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/iu.test(file.name);
  }
  revokePendingImages(images) {
    for (const image of images) URL.revokeObjectURL(image.previewUrl);
  }
  async refreshResults(showLoading) {
    const ui = this.searchUi;
    if (!ui) return;
    const scrollTop = ui.scrollContainer.scrollTop;
    await this.runSearch(ui.input.value, ui.status, ui.list, showLoading);
    window.requestAnimationFrame(() => {
      if (ui.scrollContainer.isConnected) ui.scrollContainer.scrollTop = scrollTop;
    });
  }
  focusDraftEditor() {
    window.requestAnimationFrame(() => {
      const textarea = this.searchUi?.list.querySelector(".bianlitie-draft-input");
      if (!textarea) return;
      this.activeEditor = textarea;
      if (window.matchMedia("(max-width: 600px)").matches) this.positionEditorNearViewportTop(textarea, true);
      textarea.focus({ preventScroll: true });
    });
  }
  async onClose() {
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    if (this.vaultRefreshTimer !== null) window.clearTimeout(this.vaultRefreshTimer);
    if (this.viewportFrame !== null) window.cancelAnimationFrame(this.viewportFrame);
    if (this.keyboardRecoveryFrame !== null) window.cancelAnimationFrame(this.keyboardRecoveryFrame);
    this.viewportFrame = null;
    this.keyboardRecoveryFrame = null;
    this.viewportCleanup?.();
    this.viewportCleanup = null;
    if (this.composerDraft) this.revokePendingImages(this.composerDraft.pendingImages);
    if (this.draft) this.revokePendingImages(this.draft.pendingImages);
    this.composerDraft = null;
    this.draft = null;
    this.searchUi = null;
    this.activeEditor = null;
    this.keyboardOpen = false;
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
  deepseekApiKey: "",
  deepseekModel: DEFAULT_MODEL,
  manualTagHistory: []
};
var BianlitiePlugin = class extends import_obsidian8.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
  }
  async onload() {
    await this.loadSettings();
    this.storage = new StickyNoteStorage(this.app);
    this.deepseek = new DeepSeekClient(() => this.settings);
    this.registerView(
      VIEW_TYPE_BIANLITIE,
      (leaf) => new BianlitieView(
        leaf,
        this.storage,
        this.deepseek,
        () => this.settings.manualTagHistory,
        (tags) => this.rememberManualTags(tags)
      )
    );
    this.addRibbonIcon("sticky-note", "\u6253\u5F00\u4FBF\u5229\u8D34", () => {
      void this.activateView();
    });
    this.addCommand({
      id: "open-bianlitie",
      name: "\u6253\u5F00\u4FBF\u5229\u8D34",
      callback: () => {
        void this.activateView();
      }
    });
    this.addCommand({
      id: "regenerate-current-note-metadata",
      name: "\u91CD\u65B0\u751F\u6210\u5F53\u524D\u4FBF\u5229\u8D34\u6807\u7B7E",
      callback: () => {
        void this.regenerateCurrentNoteMetadata();
      }
    });
    this.addSettingTab(new BianlitieSettingTab(this.app, this));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (!(file instanceof import_obsidian8.TFile) || !this.storage.isManagedAttachmentPath(oldPath) && !this.storage.isImagePath(oldPath)) return;
      void this.storage.updateImagePath(oldPath, file.path).catch((error) => {
        console.warn("\u4FBF\u5229\u8D34\u9644\u4EF6\u8DEF\u5F84\u66F4\u65B0\u5931\u8D25\u3002", error);
      });
    }));
    try {
      await this.storage.ensureFolders();
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u65E0\u6CD5\u521B\u5EFA\u4FBF\u5229\u8D34\u5206\u7C7B\u6587\u4EF6\u5939\u3002";
      new import_obsidian8.Notice(`\u4FBF\u5229\u8D34\uFF1A${message}`);
    }
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_BIANLITIE);
  }
  async regenerateCurrentNoteMetadata() {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof import_obsidian8.TFile) || !this.storage.isManagedFile(file)) {
      new import_obsidian8.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u6761\u4FBF\u5229\u8D34 Markdown \u6587\u4EF6\u3002");
      return;
    }
    try {
      const note = await this.storage.readNote(file);
      if (!note.body.trim()) {
        new import_obsidian8.Notice("\u4FBF\u5229\u8D34\u6B63\u6587\u4E3A\u7A7A\uFF0C\u65E0\u6CD5\u751F\u6210\u6807\u7B7E\u3002");
        return;
      }
      if (!this.deepseek.isConfigured()) {
        new import_obsidian8.Notice("\u8BF7\u5148\u5728\u4FBF\u5229\u8D34\u8BBE\u7F6E\u4E2D\u586B\u5199 DeepSeek API Key \u548C\u6A21\u578B\u540D\u79F0\u3002");
        return;
      }
      const metadata = await this.deepseek.generateMetadata(note.body, note.category);
      const current = this.app.vault.getAbstractFileByPath(file.path);
      if (!(current instanceof import_obsidian8.TFile) || !this.storage.isManagedFile(current)) return;
      const latest = await this.storage.readNote(current);
      if (latest.body !== note.body) {
        new import_obsidian8.Notice("\u6B63\u6587\u5728\u751F\u6210\u6807\u7B7E\u671F\u95F4\u53D1\u751F\u4E86\u53D8\u5316\uFF0C\u8BF7\u91CD\u8BD5\u3002");
        return;
      }
      await this.storage.updateGeneratedMetadata(current, metadata);
      new import_obsidian8.Notice("\u4FBF\u5229\u8D34\u6807\u7B7E\u5DF2\u91CD\u65B0\u751F\u6210");
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u6807\u7B7E\u751F\u6210\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002";
      new import_obsidian8.Notice(message);
    }
  }
  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_BIANLITIE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_BIANLITIE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
  async loadSettings() {
    const saved = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...saved ?? {} };
    this.settings.manualTagHistory = normalizeManualTags(this.settings.manualTagHistory, 50);
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  rememberManualTags(tags) {
    const next = normalizeManualTags([...this.settings.manualTagHistory, ...tags], 50);
    if (next.length === this.settings.manualTagHistory.length && next.every((tag, index) => tag === this.settings.manualTagHistory[index])) return;
    this.settings.manualTagHistory = next;
    void this.saveSettings().catch((error) => console.warn("\u4FBF\u5229\u8D34\u5386\u53F2\u6807\u7B7E\u4FDD\u5B58\u5931\u8D25\u3002", error));
  }
};
