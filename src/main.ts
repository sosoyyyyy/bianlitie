import { Notice, Plugin, TFile } from "obsidian";
import { VIEW_TYPE_BIANLITIE, DEFAULT_MODEL } from "./constants";
import { DeepSeekClient } from "./deepseek";
import { BianlitieSettingTab } from "./settings";
import { StickyNoteStorage } from "./storage";
import type { BianlitieSettings } from "./types";
import { normalizeManualTags } from "./utils";
import { BianlitieView } from "./view";

const DEFAULT_SETTINGS: BianlitieSettings = {
  deepseekApiKey: "",
  deepseekModel: DEFAULT_MODEL,
  manualTagHistory: []
};

export default class BianlitiePlugin extends Plugin {
  settings: BianlitieSettings = { ...DEFAULT_SETTINGS };
  private storage!: StickyNoteStorage;
  private deepseek!: DeepSeekClient;

  async onload(): Promise<void> {
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
    this.addRibbonIcon("sticky-note", "打开便利贴", () => {
      void this.activateView();
    });
    this.addCommand({
      id: "open-bianlitie",
      name: "打开便利贴",
      callback: () => {
        void this.activateView();
      }
    });
    this.addCommand({
      id: "regenerate-current-note-metadata",
      name: "重新生成当前便利贴标签",
      callback: () => {
        void this.regenerateCurrentNoteMetadata();
      }
    });
    this.addSettingTab(new BianlitieSettingTab(this.app, this));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (!(file instanceof TFile)
        || (!this.storage.isManagedAttachmentPath(oldPath) && !this.storage.isImagePath(oldPath))) return;
      void this.storage.updateImagePath(oldPath, file.path).catch((error) => {
        console.warn("便利贴附件路径更新失败。", error);
      });
    }));

    try {
      await this.storage.ensureFolders();
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法创建便利贴分类文件夹。";
      new Notice(`便利贴：${message}`);
    }
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_BIANLITIE);
  }

  private async regenerateCurrentNoteMetadata(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || !this.storage.isManagedFile(file)) {
      new Notice("请先打开一条便利贴 Markdown 文件。");
      return;
    }

    try {
      const note = await this.storage.readNote(file);
      if (!note.body.trim()) {
        new Notice("便利贴正文为空，无法生成标签。");
        return;
      }
      if (!this.deepseek.isConfigured()) {
        new Notice("请先在便利贴设置中填写 DeepSeek API Key 和模型名称。");
        return;
      }

      const metadata = await this.deepseek.generateMetadata(note.body, note.category);
      const current = this.app.vault.getAbstractFileByPath(file.path);
      if (!(current instanceof TFile) || !this.storage.isManagedFile(current)) return;
      const latest = await this.storage.readNote(current);
      if (latest.body !== note.body) {
        new Notice("正文在生成标签期间发生了变化，请重试。");
        return;
      }

      await this.storage.updateGeneratedMetadata(current, metadata);
      new Notice("便利贴标签已重新生成");
    } catch (error) {
      const message = error instanceof Error ? error.message : "标签生成失败，请稍后重试。";
      new Notice(message);
    }
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_BIANLITIE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_BIANLITIE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    const saved = await this.loadData() as Partial<BianlitieSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
    this.settings.manualTagHistory = normalizeManualTags(this.settings.manualTagHistory, 50);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private rememberManualTags(tags: string[]): void {
    const next = normalizeManualTags([...this.settings.manualTagHistory, ...tags], 50);
    if (next.length === this.settings.manualTagHistory.length
      && next.every((tag, index) => tag === this.settings.manualTagHistory[index])) return;
    this.settings.manualTagHistory = next;
    void this.saveSettings().catch((error) => console.warn("便利贴历史标签保存失败。", error));
  }
}
