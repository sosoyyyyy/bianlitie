import { ItemView, Notice, setIcon, TFile, WorkspaceLeaf } from "obsidian";
import { BianlitieActionModal } from "./action-modal";
import { AskStickyNotesModal } from "./ask-modal";
import { CATEGORIES, ROOT_FOLDER, VIEW_TYPE_BIANLITIE, type Category, type CategoryFilter } from "./constants";
import { DeepSeekClient } from "./deepseek";
import { NoteConflictError, StickyNoteStorage } from "./storage";
import type { StickyNoteRecord } from "./types";

interface DraftState {
  path: string;
  body: string;
  baseBody: string;
  baseRaw: string;
  baseMtime: number;
  saving: boolean;
}

interface SearchUi {
  input: HTMLInputElement;
  status: HTMLElement;
  list: HTMLElement;
  scrollContainer: HTMLElement;
}

export class BianlitieView extends ItemView {
  private selectedCategory: Category | null = null;
  private searchCategory: CategoryFilter = "全部";
  private searchTimer: number | null = null;
  private vaultRefreshTimer: number | null = null;
  private searchSequence = 0;
  private draft: DraftState | null = null;
  private searchUi: SearchUi | null = null;

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
    const textarea = composer.createEl("textarea", {
      cls: "bianlitie-note-input",
      attr: {
        rows: "4",
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
    this.searchUi = { input: searchInput, status: resultStatus, list: resultList, scrollContainer: container };

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
    this.registerVaultRefreshEvents(searchInput, resultStatus, resultList, container);

    void this.runSearch("", resultStatus, resultList);
    window.setTimeout(() => {
      this.resizeNoteInput(textarea);
      textarea.focus();
    }, 0);
  }

  private registerVaultRefreshEvents(
    searchInput: HTMLInputElement,
    status: HTMLElement,
    list: HTMLElement,
    scrollContainer: HTMLElement
  ): void {
    const scheduleForPaths = (...paths: string[]): void => {
      if (paths.some((path) => this.isManagedNotePath(path))) {
        this.scheduleVaultRefresh(searchInput, status, list, scrollContainer);
      }
    };

    this.registerEvent(this.app.vault.on("modify", (file) => scheduleForPaths(file.path)));
    this.registerEvent(this.app.vault.on("create", (file) => scheduleForPaths(file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (this.draft?.path === file.path) this.draft = null;
      scheduleForPaths(file.path);
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (this.draft?.path === oldPath) {
        if (this.isManagedNotePath(file.path)) {
          this.draft.path = file.path;
        } else {
          this.draft = null;
        }
      }
      scheduleForPaths(file.path, oldPath);
    }));
  }

  private isManagedNotePath(path: string): boolean {
    if (!path.toLocaleLowerCase().endsWith(".md")) return false;
    return CATEGORIES.some((category) => path.startsWith(`${ROOT_FOLDER}/${category}/`));
  }

  private scheduleVaultRefresh(
    searchInput: HTMLInputElement,
    status: HTMLElement,
    list: HTMLElement,
    scrollContainer: HTMLElement
  ): void {
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

  private resizeNoteInput(textarea: HTMLTextAreaElement): void {
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
      this.resizeNoteInput(textarea);
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

  private async runSearch(query: string, status: HTMLElement, list: HTMLElement, showLoading = true): Promise<void> {
    const sequence = ++this.searchSequence;
    if (showLoading) status.setText("正在本地查找…");
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
      const isEditing = this.draft?.path === record.file.path;
      const openLabel = `打开：${record.title}`;
      const card = container.createDiv({
        cls: "bianlitie-result-card",
        attr: { role: "button", tabindex: "0", "aria-label": openLabel, title: openLabel }
      });
      const top = card.createDiv({ cls: "bianlitie-result-card__top" });
      top.createSpan({ text: record.category, cls: "bianlitie-category-chip" });
      top.createSpan({ text: record.modified || "未记录时间", cls: "bianlitie-created" });
      card.createEl("p", { text: record.snippet || "暂无内容", cls: "bianlitie-body-preview" });

      const actions = card.createDiv({ cls: "bianlitie-result-actions" });
      const editButton = actions.createEl("button", {
        text: "编辑",
        cls: "bianlitie-result-action bianlitie-result-action--edit",
        attr: { type: "button", "aria-label": `编辑：${record.title}` }
      });
      const deleteButton = actions.createEl("button", {
        text: "删除",
        cls: "bianlitie-result-action bianlitie-result-action--delete",
        attr: { type: "button", "aria-label": `删除：${record.title}` }
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

      card.addEventListener("click", () => {
        void this.app.workspace.getLeaf(false).openFile(record.file);
      });
      card.addEventListener("keydown", (event) => {
        if (event.target !== card || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        void this.app.workspace.getLeaf(false).openFile(record.file);
      });
    }
  }

  private renderDraftEditor(card: HTMLElement, draft: DraftState): void {
    const editor = card.createDiv({ cls: "bianlitie-draft-editor" });
    editor.addEventListener("click", (event) => event.stopPropagation());
    editor.addEventListener("keydown", (event) => event.stopPropagation());
    const textarea = editor.createEl("textarea", {
      cls: "bianlitie-draft-input",
      attr: { rows: "6", "aria-label": "编辑便利贴正文" }
    });
    textarea.value = draft.body;
    textarea.disabled = draft.saving;
    textarea.addEventListener("input", () => {
      if (this.draft?.path === draft.path && !this.draft.saving) this.draft.body = textarea.value;
    });

    const controls = editor.createDiv({ cls: "bianlitie-draft-actions" });
    const cancelButton = controls.createEl("button", {
      text: "取消",
      cls: "bianlitie-draft-cancel",
      attr: { type: "button" }
    });
    const saveButton = controls.createEl("button", {
      text: draft.saving ? "保存中…" : "保存",
      cls: "bianlitie-draft-save",
      attr: { type: "button" }
    });
    cancelButton.disabled = draft.saving;
    saveButton.disabled = draft.saving;
    cancelButton.addEventListener("click", () => this.cancelDraft(draft.path));
    saveButton.addEventListener("click", () => {
      void this.saveDraft(draft.path);
    });
  }

  private async beginEdit(record: StickyNoteRecord): Promise<void> {
    if (this.draft?.path === record.file.path) {
      this.focusDraftEditor();
      return;
    }
    if (this.draft && this.draft.body !== this.draft.baseBody) {
      new Notice("请先保存或取消当前草稿，再编辑另一条便利贴。");
      return;
    }

    const current = this.app.vault.getAbstractFileByPath(record.file.path);
    if (!(current instanceof TFile) || !this.storage.isManagedFile(current)) {
      new Notice("这条便利贴已不存在或已被移动。");
      return;
    }
    try {
      const snapshot = await this.storage.readNoteSnapshot(current);
      this.draft = {
        path: current.path,
        body: snapshot.note.body,
        baseBody: snapshot.note.body,
        baseRaw: snapshot.raw,
        baseMtime: snapshot.mtime,
        saving: false
      };
      await this.refreshResults(false);
      this.focusDraftEditor();
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法读取便利贴正文。";
      new Notice(message);
    }
  }

  private cancelDraft(path: string): void {
    if (this.draft?.path !== path || this.draft.saving) return;
    this.draft = null;
    void this.refreshResults(false);
  }

  private async saveDraft(path: string): Promise<void> {
    const draft = this.draft;
    if (!draft || draft.path !== path || draft.saving) return;
    const current = this.app.vault.getAbstractFileByPath(path);
    if (!(current instanceof TFile) || !this.storage.isManagedFile(current)) {
      this.showConflict(path);
      return;
    }

    try {
      const snapshot = await this.storage.readNoteSnapshot(current);
      if (snapshot.raw !== draft.baseRaw || snapshot.mtime !== draft.baseMtime) {
        this.showConflict(path);
        return;
      }
      if (draft.body === snapshot.note.body) {
        this.draft = null;
        await this.refreshResults(false);
        return;
      }

      draft.saving = true;
      await this.refreshResults(false);
      await this.storage.updateNoteBody(current, snapshot.raw, draft.body, new Date());

      if (this.deepseek.isConfigured() && draft.body.trim()) {
        try {
          const metadata = await this.deepseek.generateMetadata(draft.body, snapshot.note.category);
          const latestFile = this.app.vault.getAbstractFileByPath(path);
          if (!(latestFile instanceof TFile) || !this.storage.isManagedFile(latestFile)) {
            throw new Error("便利贴在生成标签期间已被移动或删除。");
          }
          const latest = await this.storage.readNote(latestFile);
          if (latest.body !== draft.body) {
            throw new Error("正文在生成标签期间发生了变化。");
          }
          await this.storage.updateGeneratedMetadata(latestFile, metadata);
        } catch (error) {
          console.warn("便利贴已保存，但 DeepSeek 元数据生成失败。", error);
          new Notice("便利贴已保存；AI 标签生成失败，不影响原文。");
        }
      }

      this.draft = null;
      new Notice("便利贴已保存。");
      await this.refreshResults(false);
    } catch (error) {
      if (this.draft?.path === path) this.draft.saving = false;
      if (error instanceof NoteConflictError) {
        this.showConflict(path);
      } else {
        const message = error instanceof Error ? error.message : "便利贴保存失败。";
        new Notice(message);
        await this.refreshResults(false);
      }
    }
  }

  private showConflict(path: string): void {
    new BianlitieActionModal(this.app, {
      title: "便利贴已发生变化",
      message: "这条便利贴在编辑期间已发生变化，请重新载入后再编辑。",
      confirmLabel: "重新载入",
      onConfirm: async () => {
        await this.reloadDraft(path);
      }
    }).open();
  }

  private async reloadDraft(path: string): Promise<void> {
    const current = this.app.vault.getAbstractFileByPath(path);
    if (!(current instanceof TFile) || !this.storage.isManagedFile(current)) {
      this.draft = null;
      new Notice("这条便利贴已不存在或已被移动。");
      await this.refreshResults(false);
      return;
    }
    try {
      const snapshot = await this.storage.readNoteSnapshot(current);
      this.draft = {
        path: current.path,
        body: snapshot.note.body,
        baseBody: snapshot.note.body,
        baseRaw: snapshot.raw,
        baseMtime: snapshot.mtime,
        saving: false
      };
      await this.refreshResults(false);
      this.focusDraftEditor();
    } catch (error) {
      const message = error instanceof Error ? error.message : "重新载入便利贴失败。";
      new Notice(message);
    }
  }

  private requestDelete(record: StickyNoteRecord): void {
    new BianlitieActionModal(this.app, {
      title: "删除便利贴",
      message: "确定删除这条便利贴吗？删除后将移除对应 Markdown 文件。",
      confirmLabel: "删除",
      danger: true,
      onConfirm: async () => {
        await this.deleteNote(record.file.path);
      }
    }).open();
  }

  private async deleteNote(path: string): Promise<void> {
    const current = this.app.vault.getAbstractFileByPath(path);
    if (!(current instanceof TFile) || !this.storage.isManagedFile(current)) {
      new Notice("这条便利贴已不存在或已被移动。");
      await this.refreshResults(false);
      return;
    }
    try {
      await this.storage.trashNote(current);
      if (this.draft?.path === path) this.draft = null;
      new Notice("便利贴已移入回收站。");
      await this.refreshResults(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除便利贴失败。";
      new Notice(message);
    }
  }

  private async refreshResults(showLoading: boolean): Promise<void> {
    const ui = this.searchUi;
    if (!ui) return;
    const scrollTop = ui.scrollContainer.scrollTop;
    await this.runSearch(ui.input.value, ui.status, ui.list, showLoading);
    window.requestAnimationFrame(() => {
      if (ui.scrollContainer.isConnected) ui.scrollContainer.scrollTop = scrollTop;
    });
  }

  private focusDraftEditor(): void {
    window.requestAnimationFrame(() => {
      this.searchUi?.list.querySelector<HTMLTextAreaElement>(".bianlitie-draft-input")?.focus();
    });
  }

  async onClose(): Promise<void> {
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    if (this.vaultRefreshTimer !== null) window.clearTimeout(this.vaultRefreshTimer);
    this.draft = null;
    this.searchUi = null;
  }
}
