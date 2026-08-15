import { Notice, Plugin } from "obsidian";
import { VIEW_TYPE_BIANLITIE, DEFAULT_MODEL } from "./constants";
import { DeepSeekClient } from "./deepseek";
import { BianlitieSettingTab } from "./settings";
import { StickyNoteStorage } from "./storage";
import type { BianlitieSettings } from "./types";
import { BianlitieView } from "./view";

const DEFAULT_SETTINGS: BianlitieSettings = {
  deepseekApiKey: "",
  deepseekModel: DEFAULT_MODEL
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
      (leaf) => new BianlitieView(leaf, this.storage, this.deepseek)
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
    this.addSettingTab(new BianlitieSettingTab(this.app, this));

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
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
