import { ItemView, Notice, setIcon, WorkspaceLeaf, type TFile } from "obsidian";
import { AskStickyNotesModal } from "./ask-modal";
import { CATEGORIES, VIEW_TYPE_BIANLITIE, type Category, type CategoryFilter } from "./constants";
import { DeepSeekClient } from "./deepseek";
import { StickyNoteStorage } from "./storage";
import type { StickyNoteRecord } from "./types";

export class BianlitieView extends ItemView {
  private selectedCategory: Category | null = null;
  private searchCategory: CategoryFilter = "全部";
  private searchTimer: number | null = null;
  private searchSequence = 0;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly storage: StickyNoteStorage,
    private readonly deepseek: DeepSeekClient
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_BIANLITIE;
  }

  getDisplayText(): string {
    return "便利贴";
  }

  getIcon(): string {
    return "sticky-note";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("bianlitie-view");
    const shell = container.createDiv({ cls: "bianlitie-shell" });

    const header = shell.createEl("header", { cls: "bianlitie-header" });
    const brand = header.createDiv({ cls: "bianlitie-brand" });
    const brandIcon = brand.createSpan({ cls: "bianlitie-brand__icon" });
    setIcon(brandIcon, "sticky-note");
    brand.createEl("h1", { text: "便利贴" });
    header.createEl("p", { text: "记下此刻，随时找回。" });

    const composer = shell.createEl("section", { cls: "bianlitie-card bianlitie-composer" });
    const categoryLabel = composer.createEl("div", { text: "选择分类", cls: "bianlitie-field-label bianlitie-field-label--first" });
    categoryLabel.createSpan({ text: "（必选）", cls: "bianlitie-required" });
    const categoryGroup = composer.createDiv({ cls: "bianlitie-segments", attr: { role: "group", "aria-label": "选择一级分类" } });
    const categoryButtons = new Map<Category, HTMLButtonElement>();
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

    composer.createEl("h2", { text: "今天想记点什么？", cls: "bianlitie-composer__prompt" });
    composer.createEl("p", { text: "原文会完整保存为独立 Markdown 文件。", cls: "bianlitie-helper" });
    const textarea = composer.createEl("textarea", {
      cls: "bianlitie-note-input",
      attr: {
        rows: "8",
        placeholder: "从这里开始记录…",
        "aria-label": "便利贴内容"
      }
    });

    const saveButton = composer.createEl("button", {
      text: "存进便利贴",
      cls: "bianlitie-primary-button bianlitie-save-button",
      attr: { type: "button" }
    });

    const searchSection = shell.createEl("section", { cls: "bianlitie-search-section" });
    searchSection.createEl("h2", { text: "翻看便利贴" });
    const searchWrap = searchSection.createDiv({ cls: "bianlitie-search-wrap" });
    const searchIcon = searchWrap.createSpan({ cls: "bianlitie-search-icon" });
    setIcon(searchIcon, "search");
    const searchInput = searchWrap.createEl("input", {
      type: "search",
      attr: { placeholder: "搜索正文、标题、标签或关键词", "aria-label": "搜索便利贴" }
    });
    const filters = searchSection.createDiv({ cls: "bianlitie-filter-row", attr: { role: "group", "aria-label": "筛选便利贴分类" } });
    const filterButtons = new Map<CategoryFilter, HTMLButtonElement>();
    for (const filter of ["全部", ...CATEGORIES] as CategoryFilter[]) {
      const button = filters.createEl("button", { text: filter, attr: { type: "button", "aria-pressed": String(filter === "全部") } });
      if (filter === "全部") button.addClass("is-active");
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
      attr: { type: "button", "aria-label": "问便利贴" }
    });
    const askIcon = askButton.createSpan();
    setIcon(askIcon, "message-circle-question");
    askButton.createSpan({ text: "问便利贴" });

    saveButton.addEventListener("click", () => {
      void this.saveNote(textarea, saveButton, categoryButtons, searchInput, resultStatus, resultList);
    });
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
    window.setTimeout(() => textarea.focus(), 0);
  }

  private async saveNote(
    textarea: HTMLTextAreaElement,
    button: HTMLButtonElement,
    categoryButtons: Map<Category, HTMLButtonElement>,
    searchInput: HTMLInputElement,
    resultStatus: HTMLElement,
    resultList: HTMLElement
  ): Promise<void> {
    const originalContent = textarea.value;
    if (!originalContent.trim()) {
      new Notice("请先写下要记录的内容。");
      textarea.focus();
      return;
    }
    if (!this.selectedCategory) {
      new Notice("保存前请选择工作、生活或副业。");
      return;
    }

    const category = this.selectedCategory;
    button.disabled = true;
    button.setText("正在保存…");
    try {
      const file = await this.storage.createNote(category, originalContent);
      textarea.value = "";
      this.selectedCategory = null;
      for (const item of categoryButtons.values()) {
        item.removeClass("is-active");
        item.setAttribute("aria-pressed", "false");
      }
      new Notice(`已存进「${category}」便利贴。`);
      await this.runSearch(searchInput.value, resultStatus, resultList);
      if (this.deepseek.isConfigured()) void this.enrichNote(file, originalContent, category);
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败，请稍后重试。";
      new Notice(message);
    } finally {
      button.disabled = false;
      button.setText("存进便利贴");
    }
  }

  private async enrichNote(file: TFile, originalContent: string, category: Category): Promise<void> {
    try {
      const metadata = await this.deepseek.generateMetadata(originalContent, category);
      await this.storage.updateGeneratedMetadata(file, metadata);
      new Notice("便利贴已补充标签与检索关键词。");
    } catch (error) {
      console.warn("便利贴已保存，但 DeepSeek 元数据生成失败。", error);
      new Notice("便利贴已保存；AI 标签生成失败，不影响原文。");
    }
  }

  private async runSearch(query: string, status: HTMLElement, list: HTMLElement): Promise<void> {
    const sequence = ++this.searchSequence;
    status.setText("正在本地查找…");
    try {
      const records = await this.storage.search(query, this.searchCategory, 50);
      if (sequence !== this.searchSequence) return;
      status.setText(query.trim() ? `找到 ${records.length} 条结果` : `最近 ${records.length} 条便利贴`);
      this.renderResults(list, records);
    } catch (error) {
      if (sequence !== this.searchSequence) return;
      const message = error instanceof Error ? error.message : "搜索失败。";
      status.setText(message);
      list.empty();
    }
  }

  private renderResults(container: HTMLElement, records: StickyNoteRecord[]): void {
    container.empty();
    if (records.length === 0) {
      const empty = container.createDiv({ cls: "bianlitie-empty" });
      const icon = empty.createSpan();
      setIcon(icon, "inbox");
      empty.createEl("p", { text: "还没有找到匹配的便利贴。" });
      return;
    }

    for (const record of records) {
      const card = container.createEl("button", {
        cls: "bianlitie-result-card",
        attr: { type: "button", "aria-label": `打开 ${record.title}` }
      });
      const top = card.createDiv({ cls: "bianlitie-result-card__top" });
      top.createSpan({ text: record.category, cls: "bianlitie-category-chip" });
      top.createSpan({ text: record.created || "未记录时间", cls: "bianlitie-created" });
      card.createEl("h3", { text: record.title });
      card.createEl("p", { text: record.snippet || "（正文为空）", cls: "bianlitie-snippet" });
      const labels = [...record.tags, ...record.keywords].slice(0, 5);
      if (labels.length > 0) {
        const labelRow = card.createDiv({ cls: "bianlitie-label-row" });
        labels.forEach((label) => labelRow.createSpan({ text: label }));
      }
      card.addEventListener("click", () => {
        void this.app.workspace.getLeaf(false).openFile(record.file);
      });
    }
  }

  async onClose(): Promise<void> {
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
  }
}
