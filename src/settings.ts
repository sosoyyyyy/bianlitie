import { App, PluginSettingTab, Setting } from "obsidian";
import type BianlitiePlugin from "./main";

export class BianlitieSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: BianlitiePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("bianlitie-settings");
    containerEl.createEl("h2", { text: "便利贴设置" });
    containerEl.createEl("p", {
      text: "DeepSeek 是可选能力。未配置或请求失败时，原始便利贴仍会正常保存并可在本地搜索。",
      cls: "bianlitie-settings__intro"
    });

    new Setting(containerEl)
      .setName("DeepSeek API Key")
      .setDesc("仅保存在 Obsidian 的插件数据中，不会写入源码。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
        text
          .setPlaceholder("sk-…")
          .setValue(this.plugin.settings.deepseekApiKey)
          .onChange(async (value) => {
            this.plugin.settings.deepseekApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("模型名称")
      .setDesc("默认使用 deepseek-chat。")
      .addText((text) => text
        .setPlaceholder("deepseek-chat")
        .setValue(this.plugin.settings.deepseekModel)
        .onChange(async (value) => {
          this.plugin.settings.deepseekModel = value.trim();
          await this.plugin.saveSettings();
        }));
  }
}
