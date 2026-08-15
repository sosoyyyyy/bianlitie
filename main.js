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
var import_obsidian6 = require("obsidian");

// src/constants.ts
var VIEW_TYPE_BIANLITIE = "bianlitie-view";
var ROOT_FOLDER = "\u4FBF\u5229\u8D34";
var CATEGORIES = ["\u5DE5\u4F5C", "\u751F\u6D3B", "\u526F\u4E1A"];
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
function formatFileTimestamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;
}
function titleFromContent(content) {
  const firstMeaningfulLine = content.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.length > 0);
  return (firstMeaningfulLine ?? "\u65B0\u4FBF\u5229\u8D34").slice(0, 24);
}
function sanitizeFilePart(value) {
  const sanitized = value.replace(/[\\/:*?"<>|#^\[\]]/gu, " ").replace(/\s+/gu, " ").trim().replace(/[. ]+$/gu, "");
  return sanitized || "\u65B0\u4FBF\u5229\u8D34";
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
  async createNote(category, originalContent) {
    await this.ensureFolders();
    const now = /* @__PURE__ */ new Date();
    const folder = (0, import_obsidian3.normalizePath)(`${ROOT_FOLDER}/${category}`);
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
  async search(query, category = "\u5168\u90E8", limit = 50) {
    const terms = extractSearchTerms(query);
    const records = [];
    const files = this.app.vault.getMarkdownFiles().filter((file) => this.isManagedFile(file));
    for (const file of files) {
      const raw = await this.app.vault.cachedRead(file);
      const parsed = this.parseNote(raw, file);
      if (category !== "\u5168\u90E8" && parsed.category !== category) continue;
      const record = this.toRecord(file, parsed, query, terms);
      if (terms.length === 0 || record.score > 0) records.push(record);
    }
    return records.sort((left, right) => right.score - left.score || right.file.stat.ctime - left.file.stat.ctime).slice(0, limit);
  }
  async findRelevant(question, limit = 6) {
    return this.search(question, "\u5168\u90E8", limit);
  }
  isManagedFile(file) {
    return file.extension.toLocaleLowerCase() === "md" && file.path.startsWith(`${ROOT_FOLDER}/`);
  }
  toRecord(file, parsed, query, terms) {
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
  parseNote(raw, file) {
    const cache = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const folderCategory = CATEGORIES.find((category2) => file.path.startsWith(`${ROOT_FOLDER}/${category2}/`));
    const cachedCategory = cache?.category;
    const category = CATEGORIES.find((item) => item === cachedCategory) ?? folderCategory ?? "\u5DE5\u4F5C";
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
  readScalar(raw, field) {
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
    const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, "mu"));
    return match?.[1]?.trim().replace(/^['"]|['"]$/gu, "") ?? "";
  }
  readList(raw, field) {
    const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
    const inlineMatch = frontmatter.match(new RegExp(`^${field}:\\s*\\[([^\\]]*)\\]`, "mu"));
    if (inlineMatch) {
      return (inlineMatch[1] ?? "").split(",").map((item) => item.trim().replace(/^['"]|['"]$/gu, "")).filter(Boolean);
    }
    const blockMatch = frontmatter.match(new RegExp(`^${field}:\\s*\\r?\\n((?:\\s+-\\s+.*(?:\\r?\\n|$))*)`, "mu"));
    if (!blockMatch) return [];
    return (blockMatch[1] ?? "").split(/\r?\n/u).map((line) => line.replace(/^\s+-\s+/u, "").trim().replace(/^['"]|['"]$/gu, "")).filter(Boolean);
  }
};

// src/view.ts
var import_obsidian5 = require("obsidian");

// src/ask-modal.ts
var import_obsidian4 = require("obsidian");
var AskStickyNotesModal = class extends import_obsidian4.Modal {
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
    (0, import_obsidian4.setIcon)(icon, "message-circle-question");
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
      new import_obsidian4.Notice("\u8BF7\u5148\u8F93\u5165\u95EE\u9898\u3002");
      input.focus();
      return;
    }
    if (!this.deepseek.isConfigured()) {
      new import_obsidian4.Notice("\u8BF7\u5148\u5728\u201C\u8BBE\u7F6E \u2192 \u4FBF\u5229\u8D34\u201D\u4E2D\u586B\u5199 DeepSeek API Key \u548C\u6A21\u578B\u540D\u79F0\u3002");
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

// src/view.ts
var BianlitieView = class extends import_obsidian5.ItemView {
  constructor(leaf, storage, deepseek) {
    super(leaf);
    this.storage = storage;
    this.deepseek = deepseek;
    this.selectedCategory = null;
    this.searchCategory = "\u5168\u90E8";
    this.searchTimer = null;
    this.searchSequence = 0;
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
    (0, import_obsidian5.setIcon)(brandIcon, "sticky-note");
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
      attr: {
        rows: "4",
        placeholder: "\u4ECE\u8FD9\u91CC\u5F00\u59CB\u8BB0\u5F55\u2026",
        "aria-label": "\u4FBF\u5229\u8D34\u5185\u5BB9"
      }
    });
    const saveButton = composer.createEl("button", {
      text: "\u5B58\u8FDB\u4FBF\u5229\u8D34",
      cls: "bianlitie-primary-button bianlitie-save-button",
      attr: { type: "button" }
    });
    const searchSection = shell.createEl("section", { cls: "bianlitie-search-section" });
    searchSection.createEl("h2", { text: "\u7FFB\u770B\u4FBF\u5229\u8D34" });
    const searchWrap = searchSection.createDiv({ cls: "bianlitie-search-wrap" });
    const searchIcon = searchWrap.createSpan({ cls: "bianlitie-search-icon" });
    (0, import_obsidian5.setIcon)(searchIcon, "search");
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
    const askButton = shell.createEl("button", {
      cls: "bianlitie-ask-button",
      attr: { type: "button", "aria-label": "\u95EE\u4FBF\u5229\u8D34" }
    });
    const askIcon = askButton.createSpan();
    (0, import_obsidian5.setIcon)(askIcon, "message-circle-question");
    askButton.createSpan({ text: "\u95EE\u4FBF\u5229\u8D34" });
    saveButton.addEventListener("click", () => {
      void this.saveNote(textarea, saveButton, categoryButtons, searchInput, resultStatus, resultList);
    });
    textarea.addEventListener("input", () => this.resizeNoteInput(textarea));
    this.registerDomEvent(window, "resize", () => this.resizeNoteInput(textarea));
    searchInput.addEventListener("input", () => {
      if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => {
        void this.runSearch(searchInput.value, resultStatus, resultList);
      }, 180);
    });
    askButton.addEventListener("click", () => {
      new AskStickyNotesModal(this.app, this.storage, this.deepseek).open();
    });
    void this.runSearch("", resultStatus, resultList);
    window.setTimeout(() => {
      this.resizeNoteInput(textarea);
      textarea.focus();
    }, 0);
  }
  resizeNoteInput(textarea) {
    const styles = window.getComputedStyle(textarea);
    const minHeight = Number.parseFloat(styles.minHeight) || 132;
    const maxHeight = Number.parseFloat(styles.maxHeight) || 232;
    const borderHeight = (Number.parseFloat(styles.borderTopWidth) || 0) + (Number.parseFloat(styles.borderBottomWidth) || 0);
    textarea.style.height = "auto";
    const contentHeight = textarea.scrollHeight + borderHeight;
    const nextHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }
  async saveNote(textarea, button, categoryButtons, searchInput, resultStatus, resultList) {
    const originalContent = textarea.value;
    if (!originalContent.trim()) {
      new import_obsidian5.Notice("\u8BF7\u5148\u5199\u4E0B\u8981\u8BB0\u5F55\u7684\u5185\u5BB9\u3002");
      textarea.focus();
      return;
    }
    if (!this.selectedCategory) {
      new import_obsidian5.Notice("\u4FDD\u5B58\u524D\u8BF7\u9009\u62E9\u5DE5\u4F5C\u3001\u751F\u6D3B\u6216\u526F\u4E1A\u3002");
      return;
    }
    const category = this.selectedCategory;
    button.disabled = true;
    button.setText("\u6B63\u5728\u4FDD\u5B58\u2026");
    try {
      const file = await this.storage.createNote(category, originalContent);
      textarea.value = "";
      this.resizeNoteInput(textarea);
      this.selectedCategory = null;
      for (const item of categoryButtons.values()) {
        item.removeClass("is-active");
        item.setAttribute("aria-pressed", "false");
      }
      new import_obsidian5.Notice(`\u5DF2\u5B58\u8FDB\u300C${category}\u300D\u4FBF\u5229\u8D34\u3002`);
      await this.runSearch(searchInput.value, resultStatus, resultList);
      if (this.deepseek.isConfigured()) void this.enrichNote(file, originalContent, category);
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002";
      new import_obsidian5.Notice(message);
    } finally {
      button.disabled = false;
      button.setText("\u5B58\u8FDB\u4FBF\u5229\u8D34");
    }
  }
  async enrichNote(file, originalContent, category) {
    try {
      const metadata = await this.deepseek.generateMetadata(originalContent, category);
      await this.storage.updateGeneratedMetadata(file, metadata);
      new import_obsidian5.Notice("\u4FBF\u5229\u8D34\u5DF2\u8865\u5145\u6807\u7B7E\u4E0E\u68C0\u7D22\u5173\u952E\u8BCD\u3002");
    } catch (error) {
      console.warn("\u4FBF\u5229\u8D34\u5DF2\u4FDD\u5B58\uFF0C\u4F46 DeepSeek \u5143\u6570\u636E\u751F\u6210\u5931\u8D25\u3002", error);
      new import_obsidian5.Notice("\u4FBF\u5229\u8D34\u5DF2\u4FDD\u5B58\uFF1BAI \u6807\u7B7E\u751F\u6210\u5931\u8D25\uFF0C\u4E0D\u5F71\u54CD\u539F\u6587\u3002");
    }
  }
  async runSearch(query, status, list) {
    const sequence = ++this.searchSequence;
    status.setText("\u6B63\u5728\u672C\u5730\u67E5\u627E\u2026");
    try {
      const records = await this.storage.search(query, this.searchCategory, 50);
      if (sequence !== this.searchSequence) return;
      status.setText(query.trim() ? `\u627E\u5230 ${records.length} \u6761\u7ED3\u679C` : `\u6700\u8FD1 ${records.length} \u6761\u4FBF\u5229\u8D34`);
      this.renderResults(list, records);
    } catch (error) {
      if (sequence !== this.searchSequence) return;
      const message = error instanceof Error ? error.message : "\u641C\u7D22\u5931\u8D25\u3002";
      status.setText(message);
      list.empty();
    }
  }
  renderResults(container, records) {
    container.empty();
    if (records.length === 0) {
      const empty = container.createDiv({ cls: "bianlitie-empty" });
      const icon = empty.createSpan();
      (0, import_obsidian5.setIcon)(icon, "inbox");
      empty.createEl("p", { text: "\u8FD8\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u4FBF\u5229\u8D34\u3002" });
      return;
    }
    for (const record of records) {
      const card = container.createEl("button", {
        cls: "bianlitie-result-card",
        attr: { type: "button", "aria-label": `\u6253\u5F00 ${record.title}` }
      });
      const top = card.createDiv({ cls: "bianlitie-result-card__top" });
      top.createSpan({ text: record.category, cls: "bianlitie-category-chip" });
      top.createSpan({ text: record.created || "\u672A\u8BB0\u5F55\u65F6\u95F4", cls: "bianlitie-created" });
      card.createEl("p", { text: record.snippet || "\u6682\u65E0\u5185\u5BB9", cls: "bianlitie-body-preview" });
      card.addEventListener("click", () => {
        void this.app.workspace.getLeaf(false).openFile(record.file);
      });
    }
  }
  async onClose() {
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
  deepseekApiKey: "",
  deepseekModel: DEFAULT_MODEL
};
var BianlitiePlugin = class extends import_obsidian6.Plugin {
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
      (leaf) => new BianlitieView(leaf, this.storage, this.deepseek)
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
    this.addSettingTab(new BianlitieSettingTab(this.app, this));
    try {
      await this.storage.ensureFolders();
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u65E0\u6CD5\u521B\u5EFA\u4FBF\u5229\u8D34\u5206\u7C7B\u6587\u4EF6\u5939\u3002";
      new import_obsidian6.Notice(`\u4FBF\u5229\u8D34\uFF1A${message}`);
    }
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_BIANLITIE);
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
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
