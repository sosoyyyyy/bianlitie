import { ItemView, Notice, setIcon, TFile, WorkspaceLeaf } from "obsidian";
import { BianlitieActionModal } from "./action-modal";
import { AskStickyNotesModal } from "./ask-modal";
import {
  CATEGORIES,
  MAX_IMAGES_PER_NOTE,
  ROOT_FOLDER,
  VIEW_TYPE_BIANLITIE,
  type Category,
  type CategoryFilter
} from "./constants";
import { DeepSeekClient } from "./deepseek";
import { BianlitieImageModal } from "./image-modal";
import { NoteConflictError, StickyNoteStorage, type ImageUpload } from "./storage";
import type { StickyNoteRecord } from "./types";
import { normalizeManualTag, normalizeManualTags } from "./utils";

interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface ComposerDraft {
  manualTags: string[];
  pendingImages: PendingImage[];
  saving: boolean;
}

interface DraftState {
  path: string;
  body: string;
  baseBody: string;
  manualTags: string[];
  baseManualTags: string[];
  images: string[];
  baseImages: string[];
  pendingImages: PendingImage[];
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
  private pendingImageSequence = 0;
  private composerDraft: ComposerDraft | null = null;
  private draft: DraftState | null = null;
  private searchUi: SearchUi | null = null;
  private viewportCleanup: (() => void) | null = null;
  private viewportFrame: number | null = null;
  private keyboardRecoveryFrame: number | null = null;
  private keyboardStateFrame: number | null = null;
  private caretFrame: number | null = null;
  private keyboardOpen = false;
  private viewportBaselineHeight = 0;
  private viewportBaselineWidth = 0;
  private activeEditor: HTMLTextAreaElement | null = null;
  private textareaMirror: HTMLDivElement | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly storage: StickyNoteStorage,
    private readonly deepseek: DeepSeekClient,
    private readonly getManualTagHistory: () => string[],
    private readonly rememberManualTags: (tags: string[]) => void
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
      attr: { rows: "4", placeholder: "从这里开始记录…", "aria-label": "便利贴内容" }
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
    askButton.createSpan({ text: "问便利贴", cls: "bianlitie-ask-button__label bianlitie-ask-button__label--full" });
    askButton.createSpan({ text: "问", cls: "bianlitie-ask-button__label bianlitie-ask-button__label--compact" });

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
    textarea.addEventListener("click", () => this.scheduleCaretVisibility(textarea));
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

  private renderComposerExtras(
    tagHost: HTMLElement,
    imageHost: HTMLElement,
    tagActionHost: HTMLElement,
    imageActionHost: HTMLElement
  ): void {
    this.renderManualTagEditor(
      tagHost,
      tagActionHost,
      () => this.composerDraft?.manualTags ?? [],
      (tags) => { if (this.composerDraft) this.composerDraft.manualTags = tags; },
      () => this.composerDraft?.saving ?? true
    );
    this.renderImageEditor(
      imageHost,
      imageActionHost,
      () => [],
      () => undefined,
      () => this.composerDraft?.pendingImages ?? [],
      (images) => { if (this.composerDraft) this.composerDraft.pendingImages = images; },
      () => this.composerDraft?.saving ?? true
    );
  }

  private registerVaultRefreshEvents(
    searchInput: HTMLInputElement,
    status: HTMLElement,
    list: HTMLElement,
    scrollContainer: HTMLElement
  ): void {
    const scheduleForPaths = (...paths: string[]): void => {
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

  private resizeNoteInput(textarea: HTMLTextAreaElement, allowShrink = false): void {
    if (window.matchMedia("(max-width: 600px)").matches) {
      this.resizeMobileEditor(textarea);
      return;
    }

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

  private resizeMobileEditor(textarea: HTMLTextAreaElement): void {
    if (!window.matchMedia("(max-width: 600px)").matches || !textarea.isConnected) return;
    const styles = window.getComputedStyle(textarea);
    const minHeight = Number.parseFloat(styles.minHeight) || 116;
    const { contentHeight } = this.measureTextarea(textarea, null);
    const naturalHeight = Math.max(minHeight, Math.ceil(contentHeight));

    if (!this.keyboardOpen) {
      textarea.style.height = `${naturalHeight}px`;
      textarea.style.maxHeight = "none";
      textarea.style.overflowY = "hidden";
      textarea.removeClass("is-mobile-editor-constrained");
      textarea.scrollTop = 0;
      return;
    }

    const maxHeight = this.calculateMobileEditorMaxHeight(minHeight);
    const constrained = naturalHeight > maxHeight + 1;
    textarea.style.height = `${Math.min(naturalHeight, maxHeight)}px`;
    textarea.style.maxHeight = `${maxHeight}px`;
    textarea.style.overflowY = constrained ? "auto" : "hidden";
    textarea.toggleClass("is-mobile-editor-constrained", constrained);
    this.searchUi?.scrollContainer.style.setProperty("--bianlitie-mobile-editor-max-height", `${maxHeight}px`);
    if (!constrained) textarea.scrollTop = 0;
  }

  private calculateMobileEditorMaxHeight(minHeight: number): number {
    const ui = this.searchUi;
    const visualViewport = window.visualViewport;
    if (!ui) return minHeight;

    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (visualViewport?.height ?? window.innerHeight);
    const containerBounds = ui.scrollContainer.getBoundingClientRect();
    const visibleTop = Math.max(viewportTop, containerBounds.top);
    const visibleBottom = Math.min(viewportBottom, containerBounds.bottom);
    const visibleHeight = Math.max(minHeight, visibleBottom - visibleTop);
    const edgeLimitedHeight = visibleHeight - 56;
    const comfortableHeight = visibleHeight * 0.68;
    return Math.max(minHeight, Math.floor(Math.min(edgeLimitedHeight, comfortableHeight)));
  }

  private measureTextarea(
    textarea: HTMLTextAreaElement,
    caretIndex: number | null
  ): { contentHeight: number; caretTop: number | null; lineHeight: number } {
    const styles = window.getComputedStyle(textarea);
    const borderLeft = Number.parseFloat(styles.borderLeftWidth) || 0;
    const borderRight = Number.parseFloat(styles.borderRightWidth) || 0;
    const fontSize = Number.parseFloat(styles.fontSize) || 16;
    const parsedLineHeight = Number.parseFloat(styles.lineHeight);
    const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.2;
    const mirror = this.getTextareaMirror();
    mirror.replaceChildren();
    Object.assign(mirror.style, {
      position: "fixed",
      zIndex: "-1",
      top: "0",
      left: "-10000px",
      display: "block",
      visibility: "hidden",
      pointerEvents: "none",
      boxSizing: styles.boxSizing,
      width: `${textarea.clientWidth + borderLeft + borderRight}px`,
      height: "auto",
      minHeight: "0",
      maxHeight: "none",
      margin: "0",
      padding: styles.padding,
      borderWidth: styles.borderWidth,
      borderStyle: styles.borderStyle,
      borderColor: "transparent",
      fontFamily: styles.fontFamily,
      fontSize: styles.fontSize,
      fontStyle: styles.fontStyle,
      fontWeight: styles.fontWeight,
      fontVariant: styles.fontVariant,
      lineHeight: styles.lineHeight,
      letterSpacing: styles.letterSpacing,
      wordSpacing: styles.wordSpacing,
      textAlign: styles.textAlign,
      textIndent: styles.textIndent,
      textTransform: styles.textTransform,
      direction: styles.direction,
      whiteSpace: "pre-wrap",
      wordBreak: styles.wordBreak,
      overflow: "hidden"
    });
    mirror.style.setProperty("overflow-wrap", styles.overflowWrap || "break-word");
    mirror.style.setProperty("tab-size", styles.getPropertyValue("tab-size") || "8");

    let marker: HTMLSpanElement | null = null;
    if (caretIndex === null) {
      mirror.append(document.createTextNode(`${textarea.value}\u200b`));
    } else {
      const safeIndex = Math.max(0, Math.min(caretIndex, textarea.value.length));
      mirror.append(document.createTextNode(textarea.value.slice(0, safeIndex)));
      marker = document.createElement("span");
      marker.textContent = "\u200b";
      marker.style.display = "inline-block";
      marker.style.width = "0";
      mirror.append(marker);
      mirror.append(document.createTextNode(`${textarea.value.slice(safeIndex)}\u200b`));
    }

    const mirrorBounds = mirror.getBoundingClientRect();
    const markerBounds = marker?.getBoundingClientRect();
    return {
      contentHeight: mirrorBounds.height,
      caretTop: markerBounds ? markerBounds.top - mirrorBounds.top : null,
      lineHeight
    };
  }

  private getTextareaMirror(): HTMLDivElement {
    if (this.textareaMirror?.isConnected) return this.textareaMirror;
    const mirror = document.createElement("div");
    mirror.className = "bianlitie-textarea-mirror";
    mirror.setAttribute("aria-hidden", "true");
    document.body.append(mirror);
    this.textareaMirror = mirror;
    return mirror;
  }

  private registerViewportHandling(container: HTMLElement): void {
    this.viewportCleanup?.();
    const visualViewport = window.visualViewport;
    this.viewportBaselineHeight = visualViewport?.height ?? window.innerHeight;
    this.viewportBaselineWidth = visualViewport?.width ?? window.innerWidth;

    const evaluate = (confirmClose: boolean, adjustEditor: boolean): void => {
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const viewportWidth = visualViewport?.width ?? window.innerWidth;
      const viewportOffsetTop = Math.max(0, visualViewport?.offsetTop ?? 0);
      if (Math.abs(viewportWidth - this.viewportBaselineWidth) > 48) {
        this.viewportBaselineWidth = viewportWidth;
        this.viewportBaselineHeight = Math.max(viewportHeight, window.innerHeight);
      }

      const layoutHeight = Math.max(this.viewportBaselineHeight, window.innerHeight);
      const heightLoss = Math.max(0, this.viewportBaselineHeight - viewportHeight);
      const innerHeightLoss = Math.max(0, window.innerHeight - viewportHeight);
      const bottomOcclusion = Math.max(0, layoutHeight - viewportHeight - viewportOffsetTop);
      const measuredInset = Math.max(heightLoss, innerHeightLoss, bottomOcclusion);
      const wasKeyboardOpen = this.keyboardOpen;
      const isKeyboardOpen = measuredInset >= (wasKeyboardOpen ? 36 : 72);

      if (wasKeyboardOpen && !isKeyboardOpen && !confirmClose) {
        if (this.keyboardStateFrame === null) {
          this.keyboardStateFrame = window.requestAnimationFrame(() => {
            this.keyboardStateFrame = null;
            evaluate(true, adjustEditor);
          });
        }
        return;
      }
      if (isKeyboardOpen && this.keyboardStateFrame !== null) {
        window.cancelAnimationFrame(this.keyboardStateFrame);
        this.keyboardStateFrame = null;
      }

      this.keyboardOpen = isKeyboardOpen;
      if (!isKeyboardOpen && viewportHeight > this.viewportBaselineHeight) {
        this.viewportBaselineHeight = viewportHeight;
      }
      const keyboardHeight = isKeyboardOpen ? measuredInset : 0;
      container.style.setProperty("--bianlitie-keyboard-height", `${Math.round(keyboardHeight)}px`);
      container.style.setProperty("--bianlitie-visual-viewport-height", `${Math.round(viewportHeight)}px`);
      container.toggleClass("is-keyboard-open", isKeyboardOpen);
      const activeEditor = this.activeEditor;
      const keyboardStateChanged = wasKeyboardOpen !== isKeyboardOpen;
      if (activeEditor?.isConnected && (adjustEditor || keyboardStateChanged)) this.resizeMobileEditor(activeEditor);

      if (wasKeyboardOpen && !isKeyboardOpen) {
        container.style.removeProperty("--bianlitie-mobile-editor-max-height");
        this.scheduleKeyboardRecovery();
      } else if (isKeyboardOpen && (adjustEditor || keyboardStateChanged)) {
        if (this.keyboardRecoveryFrame !== null) window.cancelAnimationFrame(this.keyboardRecoveryFrame);
        this.keyboardRecoveryFrame = null;
        this.scheduleFocusedInputVisibility();
        if (activeEditor?.isConnected) this.scheduleCaretVisibility(activeEditor);
      }
    };
    const update = (): void => evaluate(false, true);
    const updateScroll = (): void => evaluate(false, false);

    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", updateScroll);
    window.addEventListener("resize", update);
    this.viewportCleanup = () => {
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", update);
      container.style.removeProperty("--bianlitie-keyboard-height");
      container.style.removeProperty("--bianlitie-visual-viewport-height");
      container.style.removeProperty("--bianlitie-mobile-editor-max-height");
      container.removeClass("is-keyboard-open");
      if (this.keyboardStateFrame !== null) window.cancelAnimationFrame(this.keyboardStateFrame);
      this.keyboardStateFrame = null;
      this.keyboardOpen = false;
    };
    update();
  }

  private scheduleFocusedInputVisibility(): void {
    if (!window.matchMedia("(max-width: 600px)").matches) return;
    if (this.viewportFrame !== null) window.cancelAnimationFrame(this.viewportFrame);
    this.viewportFrame = window.requestAnimationFrame(() => {
      this.viewportFrame = null;
      this.keepFocusedInputVisible();
    });
  }

  private handleEditorFocus(textarea: HTMLTextAreaElement): void {
    this.activeEditor = textarea;
    this.resizeMobileEditor(textarea);
    if (!this.keyboardOpen) return;
    this.scheduleFocusedInputVisibility();
    this.scheduleCaretVisibility(textarea);
  }

  private scheduleCaretVisibility(textarea: HTMLTextAreaElement): void {
    if (!this.keyboardOpen || !window.matchMedia("(max-width: 600px)").matches) return;
    if (this.caretFrame !== null) window.cancelAnimationFrame(this.caretFrame);
    this.caretFrame = window.requestAnimationFrame(() => {
      this.caretFrame = null;
      this.keepCaretVisible(textarea);
    });
  }

  private keepCaretVisible(textarea: HTMLTextAreaElement): void {
    if (!this.keyboardOpen || !textarea.isConnected || textarea !== this.activeEditor) return;
    if (!textarea.hasClass("is-mobile-editor-constrained")) return;

    const { contentHeight, caretTop, lineHeight } = this.measureTextarea(textarea, textarea.selectionStart);
    if (caretTop === null || contentHeight <= textarea.clientHeight + 1) return;
    const safeInset = Math.max(20, lineHeight * 1.5);
    const visibleTop = textarea.scrollTop + safeInset;
    const visibleBottom = textarea.scrollTop + textarea.clientHeight - safeInset;
    let nextScrollTop = textarea.scrollTop;
    if (caretTop < visibleTop) {
      nextScrollTop = caretTop - safeInset;
    } else if (caretTop + lineHeight > visibleBottom) {
      nextScrollTop = caretTop + lineHeight - textarea.clientHeight + safeInset;
    }

    const maxScrollTop = Math.max(0, contentHeight - textarea.clientHeight);
    nextScrollTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop));
    if (Math.abs(nextScrollTop - textarea.scrollTop) >= 2) textarea.scrollTop = nextScrollTop;
  }

  private scheduleKeyboardRecovery(): void {
    if (!window.matchMedia("(max-width: 600px)").matches) return;
    if (this.keyboardRecoveryFrame !== null) window.cancelAnimationFrame(this.keyboardRecoveryFrame);
    this.keyboardRecoveryFrame = window.requestAnimationFrame(() => {
      this.keyboardRecoveryFrame = null;
      this.recoverActiveEditorPosition();
    });
  }

  private recoverActiveEditorPosition(): void {
    const editor = this.activeEditor;
    if (this.keyboardOpen || !editor?.isConnected) return;
    if (!editor.matches(".bianlitie-note-input, .bianlitie-draft-input")) return;
    this.positionEditorNearViewportTop(editor, false);
  }

  private positionEditorNearViewportTop(editor: HTMLTextAreaElement, force: boolean): void {
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

  private keepFocusedInputVisible(): void {
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

  private async saveNote(
    textarea: HTMLTextAreaElement,
    button: HTMLButtonElement,
    categoryButtons: Map<Category, HTMLButtonElement>,
    searchInput: HTMLInputElement,
    resultStatus: HTMLElement,
    resultList: HTMLElement,
    tagHost: HTMLElement,
    imageHost: HTMLElement,
    tagActionHost: HTMLElement,
    imageActionHost: HTMLElement
  ): Promise<void> {
    const originalContent = textarea.value;
    const composerDraft = this.composerDraft;
    if (!composerDraft || composerDraft.saving) return;
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
    const manualTags = [...composerDraft.manualTags];
    const pendingImages = [...composerDraft.pendingImages];
    composerDraft.saving = true;
    button.disabled = true;
    button.setText("正在保存…");
    this.renderComposerExtras(tagHost, imageHost, tagActionHost, imageActionHost);
    try {
      const file = await this.storage.createNote(category, originalContent, manualTags);
      if (pendingImages.length > 0) {
        let imagePaths: string[] = [];
        try {
          const uploads = await this.toImageUploads(pendingImages);
          imagePaths = await this.storage.saveImages(uploads);
          const snapshot = await this.storage.readNoteSnapshot(file);
          await this.storage.updateNote(file, snapshot.raw, snapshot.note.body, manualTags, imagePaths, null);
        } catch (error) {
          if (imagePaths.length > 0) await this.storage.discardCreatedImages(imagePaths);
          console.warn("便利贴已保存，但图片保存失败。", error);
          new Notice("便利贴正文已保存，但图片保存失败，请重新编辑添加。");
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
      new Notice(`已存进「${category}」便利贴。`);
      await this.runSearch(searchInput.value, resultStatus, resultList);
      if (this.deepseek.isConfigured()) void this.enrichNote(file, originalContent, category);
    } catch (error) {
      composerDraft.saving = false;
      const message = error instanceof Error ? error.message : "保存失败，请稍后重试。";
      new Notice(message);
      this.renderComposerExtras(tagHost, imageHost, tagActionHost, imageActionHost);
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
      status.setText(error instanceof Error ? error.message : "搜索失败。");
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
      this.renderVisibleManualTags(card, record.manualTags);
      this.renderCardImages(card, record.images);

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
      card.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(record.file));
      card.addEventListener("keydown", (event) => {
        if (event.target !== card || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        void this.app.workspace.getLeaf(false).openFile(record.file);
      });
    }
  }

  private renderVisibleManualTags(card: HTMLElement, tags: string[]): void {
    if (tags.length === 0) return;
    const row = card.createDiv({ cls: "bianlitie-card-tags", attr: { "aria-label": "手动标签" } });
    for (const tag of tags) row.createSpan({ text: `#${tag}`, cls: "bianlitie-card-tag" });
  }

  private renderCardImages(card: HTMLElement, imagePaths: string[]): void {
    const available = imagePaths
      .map((path) => ({ path, source: this.storage.getImageResourcePath(path) }))
      .filter((item): item is { path: string; source: string } => item.source !== null)
      .slice(0, 3);
    if (available.length === 0) return;
    const gallery = card.createDiv({ cls: `bianlitie-card-images bianlitie-card-images--${available.length}` });
    gallery.addEventListener("click", (event) => event.stopPropagation());
    for (const item of available) {
      const button = gallery.createEl("button", { cls: "bianlitie-thumbnail", attr: { type: "button", "aria-label": "查看便利贴图片" } });
      button.createEl("img", { attr: { src: item.source, alt: item.path, loading: "lazy" } });
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        new BianlitieImageModal(this.app, item.source, item.path.split("/").pop() ?? "便利贴图片").open();
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
    textarea.addEventListener("focus", () => this.handleEditorFocus(textarea));
    textarea.addEventListener("click", () => this.scheduleCaretVisibility(textarea));
    textarea.addEventListener("input", () => {
      if (this.draft?.path === draft.path && !this.draft.saving) this.draft.body = textarea.value;
      this.resizeMobileEditor(textarea);
    });
    this.resizeMobileEditor(textarea);

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
      (tags) => { if (this.draft?.path === draft.path) this.draft.manualTags = tags; },
      () => this.draft?.path !== draft.path || this.draft.saving
    );
    this.renderImageEditor(
      imageHost,
      imageAction,
      () => this.draft?.path === draft.path ? this.draft.images : [],
      (images) => { if (this.draft?.path === draft.path) this.draft.images = images; },
      () => this.draft?.path === draft.path ? this.draft.pendingImages : [],
      (images) => { if (this.draft?.path === draft.path) this.draft.pendingImages = images; },
      () => this.draft?.path !== draft.path || this.draft.saving
    );

    const controls = editor.createDiv({ cls: "bianlitie-draft-actions" });
    const cancelButton = controls.createEl("button", { text: "取消", cls: "bianlitie-draft-cancel", attr: { type: "button" } });
    const saveButton = controls.createEl("button", {
      text: draft.saving ? "保存中…" : "保存",
      cls: "bianlitie-draft-save",
      attr: { type: "button" }
    });
    cancelButton.disabled = draft.saving;
    saveButton.disabled = draft.saving;
    cancelButton.addEventListener("click", () => this.cancelDraft(draft.path));
    saveButton.addEventListener("click", () => void this.saveDraft(draft.path));
  }

  private renderManualTagEditor(
    holder: HTMLElement,
    actionHost: HTMLElement,
    getTags: () => string[],
    setTags: (tags: string[]) => void,
    isDisabled: () => boolean
  ): void {
    let expanded = false;
    const render = (): void => {
      holder.empty();
      actionHost.empty();
      holder.addClass("bianlitie-tag-editor");
      holder.toggleClass("is-disabled", isDisabled());
      const row = holder.createDiv({ cls: "bianlitie-tag-row" });
      for (const tag of getTags()) {
        const chip = row.createSpan({ cls: "bianlitie-manual-tag" });
        chip.createSpan({ text: `#${tag}` });
        const remove = chip.createEl("button", { attr: { type: "button", "aria-label": `删除标签 ${tag}` } });
        setIcon(remove, "x");
        remove.disabled = isDisabled();
        remove.addEventListener("click", () => {
          if (isDisabled()) return;
          setTags(getTags().filter((item) => item !== tag));
          render();
        });
      }
      const addButton = actionHost.createEl("button", {
        text: "# 添加标签",
        cls: "bianlitie-add-tag",
        attr: { type: "button", "aria-expanded": String(expanded) }
      });
      addButton.disabled = isDisabled();
      addButton.addEventListener("click", () => {
        if (isDisabled()) return;
        expanded = !expanded;
        render();
        if (expanded) window.setTimeout(() => holder.querySelector<HTMLInputElement>(".bianlitie-tag-input")?.focus(), 0);
      });
      if (!expanded) return;

      const panel = holder.createDiv({ cls: "bianlitie-tag-panel" });
      const inputRow = panel.createDiv({ cls: "bianlitie-tag-input-row" });
      const input = inputRow.createEl("input", {
        type: "text",
        cls: "bianlitie-tag-input",
        attr: { placeholder: "输入标签名称", "aria-label": "新手动标签" }
      });
      const confirm = inputRow.createEl("button", { text: "添加", attr: { type: "button" } });
      const addValue = (): void => {
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
        panel.createDiv({ text: "历史标签", cls: "bianlitie-tag-history-label" });
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

  private renderImageEditor(
    holder: HTMLElement,
    actionHost: HTMLElement,
    getExisting: () => string[],
    setExisting: (images: string[]) => void,
    getPending: () => PendingImage[],
    setPending: (images: PendingImage[]) => void,
    isDisabled: () => boolean
  ): void {
    const render = (): void => {
      holder.empty();
      actionHost.empty();
      holder.addClass("bianlitie-image-editor");
      const existing = getExisting();
      const pending = getPending();
      const gallery = holder.createDiv({ cls: "bianlitie-edit-images" });

      for (const path of existing) {
        const source = this.storage.getImageResourcePath(path);
        this.renderEditableImage(gallery, source, path.split("/").pop() ?? "便利贴图片", () => {
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
        attr: { accept: "image/*", multiple: "", "aria-label": "选择便利贴图片" }
      });
      const addButton = actionHost.createEl("button", {
        cls: "bianlitie-add-image",
        attr: { type: "button" }
      });
      const icon = addButton.createSpan();
      setIcon(icon, "image-plus");
      addButton.createSpan({ text: `添加图片 ${existing.length + pending.length}/${MAX_IMAGES_PER_NOTE}` });
      addButton.disabled = isDisabled() || existing.length + pending.length >= MAX_IMAGES_PER_NOTE;
      addButton.addEventListener("click", () => {
        if (!addButton.disabled) input.click();
      });
      input.addEventListener("change", () => {
        if (isDisabled()) return;
        const available = MAX_IMAGES_PER_NOTE - getExisting().length - getPending().length;
        const selected = Array.from(input.files ?? []).filter((file) => this.isImageFile(file));
        if (selected.length > available) new Notice(`每条便利贴最多添加 ${MAX_IMAGES_PER_NOTE} 张图片。`);
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

  private renderEditableImage(
    gallery: HTMLElement,
    source: string | null,
    label: string,
    onRemove: () => void
  ): void {
    const item = gallery.createDiv({ cls: "bianlitie-edit-image" });
    const preview = item.createEl("button", { cls: "bianlitie-edit-image__preview", attr: { type: "button", "aria-label": `查看 ${label}` } });
    if (source) {
      preview.createEl("img", { attr: { src: source, alt: label } });
      preview.addEventListener("click", () => new BianlitieImageModal(this.app, source, label).open());
    } else {
      preview.createSpan({ text: "图片已移动", cls: "bianlitie-image-missing" });
      preview.disabled = true;
    }
    const remove = item.createEl("button", { cls: "bianlitie-edit-image__remove", attr: { type: "button", "aria-label": `移除 ${label}` } });
    setIcon(remove, "x");
    remove.addEventListener("click", onRemove);
  }

  private async beginEdit(record: StickyNoteRecord): Promise<void> {
    if (this.draft?.path === record.file.path) {
      this.focusDraftEditor();
      return;
    }
    if (this.draft && this.isDraftDirty(this.draft)) {
      new Notice("请先保存或取消当前草稿，再编辑另一条便利贴。");
      return;
    }
    if (this.draft) this.revokePendingImages(this.draft.pendingImages);

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
      new Notice(error instanceof Error ? error.message : "无法读取便利贴正文。");
    }
  }

  private cancelDraft(path: string): void {
    if (this.draft?.path !== path || this.draft.saving) return;
    this.revokePendingImages(this.draft.pendingImages);
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

    let createdImagePaths: string[] = [];
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
        bodyChanged ? new Date() : null
      );
      noteUpdated = true;
      this.rememberManualTags(draft.manualTags);

      if (bodyChanged && this.deepseek.isConfigured() && draft.body.trim()) {
        try {
          const metadata = await this.deepseek.generateMetadata(draft.body, snapshot.note.category);
          const latestFile = this.app.vault.getAbstractFileByPath(path);
          if (!(latestFile instanceof TFile) || !this.storage.isManagedFile(latestFile)) {
            throw new Error("便利贴在生成标签期间已被移动或删除。");
          }
          const latest = await this.storage.readNote(latestFile);
          if (latest.body !== draft.body) throw new Error("正文在生成标签期间发生了变化。");
          await this.storage.updateGeneratedMetadata(latestFile, metadata);
        } catch (error) {
          console.warn("便利贴已保存，但 DeepSeek 元数据生成失败。", error);
          new Notice("便利贴已保存；AI 标签生成失败，不影响原文。");
        }
      }

      this.revokePendingImages(draft.pendingImages);
      this.draft = null;
      new Notice("便利贴已保存。");
      await this.refreshResults(false);
    } catch (error) {
      if (!noteUpdated && createdImagePaths.length > 0) await this.storage.discardCreatedImages(createdImagePaths);
      if (this.draft?.path === path) this.draft.saving = false;
      if (error instanceof NoteConflictError) this.showConflict(path);
      else {
        new Notice(error instanceof Error ? error.message : "便利贴保存失败。");
        await this.refreshResults(false);
      }
    }
  }

  private showConflict(path: string): void {
    new BianlitieActionModal(this.app, {
      title: "便利贴已发生变化",
      message: "这条便利贴在编辑期间已发生变化，请重新载入后再编辑。",
      confirmLabel: "重新载入",
      onConfirm: async () => this.reloadDraft(path)
    }).open();
  }

  private async reloadDraft(path: string): Promise<void> {
    const current = this.app.vault.getAbstractFileByPath(path);
    if (!(current instanceof TFile) || !this.storage.isManagedFile(current)) {
      if (this.draft) this.revokePendingImages(this.draft.pendingImages);
      this.draft = null;
      new Notice("这条便利贴已不存在或已被移动。");
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
      new Notice(error instanceof Error ? error.message : "重新载入便利贴失败。");
    }
  }

  private requestDelete(record: StickyNoteRecord): void {
    new BianlitieActionModal(this.app, {
      title: "删除便利贴",
      message: "确定删除这条便利贴吗？对应 Markdown 文件将移入回收站；附件会保留以避免误删。",
      confirmLabel: "删除",
      danger: true,
      onConfirm: async () => this.deleteNote(record.file.path)
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
      if (this.draft?.path === path) {
        this.revokePendingImages(this.draft.pendingImages);
        this.draft = null;
      }
      new Notice("便利贴已移入回收站；附件已保留。");
      await this.refreshResults(false);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "删除便利贴失败。");
    }
  }

  private isDraftDirty(draft: DraftState): boolean {
    return draft.body !== draft.baseBody
      || !this.sameStringArray(draft.manualTags, draft.baseManualTags)
      || !this.sameStringArray(draft.images, draft.baseImages)
      || draft.pendingImages.length > 0;
  }

  private sameStringArray(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private async toImageUploads(images: PendingImage[]): Promise<ImageUpload[]> {
    return Promise.all(images.map(async (image) => ({
      name: image.file.name,
      mimeType: image.file.type,
      data: await image.file.arrayBuffer()
    })));
  }

  private isImageFile(file: File): boolean {
    if (file.type.startsWith("image/")) return true;
    return /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/iu.test(file.name);
  }

  private revokePendingImages(images: PendingImage[]): void {
    for (const image of images) URL.revokeObjectURL(image.previewUrl);
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
      const textarea = this.searchUi?.list.querySelector<HTMLTextAreaElement>(".bianlitie-draft-input");
      if (!textarea) return;
      this.activeEditor = textarea;
      if (window.matchMedia("(max-width: 600px)").matches) this.positionEditorNearViewportTop(textarea, true);
      textarea.focus({ preventScroll: true });
    });
  }

  async onClose(): Promise<void> {
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    if (this.vaultRefreshTimer !== null) window.clearTimeout(this.vaultRefreshTimer);
    if (this.viewportFrame !== null) window.cancelAnimationFrame(this.viewportFrame);
    if (this.keyboardRecoveryFrame !== null) window.cancelAnimationFrame(this.keyboardRecoveryFrame);
    if (this.keyboardStateFrame !== null) window.cancelAnimationFrame(this.keyboardStateFrame);
    if (this.caretFrame !== null) window.cancelAnimationFrame(this.caretFrame);
    this.viewportFrame = null;
    this.keyboardRecoveryFrame = null;
    this.keyboardStateFrame = null;
    this.caretFrame = null;
    this.viewportCleanup?.();
    this.viewportCleanup = null;
    if (this.composerDraft) this.revokePendingImages(this.composerDraft.pendingImages);
    if (this.draft) this.revokePendingImages(this.draft.pendingImages);
    this.composerDraft = null;
    this.draft = null;
    this.searchUi = null;
    this.activeEditor = null;
    this.keyboardOpen = false;
    this.viewportBaselineHeight = 0;
    this.viewportBaselineWidth = 0;
    this.textareaMirror?.remove();
    this.textareaMirror = null;
  }
}
