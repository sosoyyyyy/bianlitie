import { App, Modal, Notice, setIcon } from "obsidian";
import { DeepSeekClient } from "./deepseek";
import { StickyNoteStorage } from "./storage";
import type { StickyNoteRecord } from "./types";

export class AskStickyNotesModal extends Modal {
  constructor(
    app: App,
    private readonly storage: StickyNoteStorage,
    private readonly deepseek: DeepSeekClient
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass("bianlitie-ask-modal");
    contentEl.empty();

    const header = contentEl.createDiv({ cls: "bianlitie-ask__header" });
    const icon = header.createSpan({ cls: "bianlitie-ask__icon" });
    setIcon(icon, "message-circle-question");
    const heading = header.createDiv();
    heading.createEl("h2", { text: "问便利贴" });
    heading.createEl("p", { text: "先从本地 Markdown 找资料，再交给 DeepSeek 回答。" });

    const input = contentEl.createEl("textarea", {
      cls: "bianlitie-ask__input",
      attr: {
        rows: "4",
        placeholder: "例如：上次谈到的发布计划是什么？",
        "aria-label": "输入要向便利贴提问的问题"
      }
    });
    const askButton = contentEl.createEl("button", {
      text: "查找并回答",
      cls: "bianlitie-primary-button bianlitie-ask__submit"
    });
    const output = contentEl.createDiv({ cls: "bianlitie-ask__output" });

    askButton.addEventListener("click", () => {
      void this.ask(input, askButton, output);
    });
  }

  private async ask(input: HTMLTextAreaElement, button: HTMLButtonElement, output: HTMLElement): Promise<void> {
    const question = input.value.trim();
    if (!question) {
      new Notice("请先输入问题。");
      input.focus();
      return;
    }
    if (!this.deepseek.isConfigured()) {
      new Notice("请先在“设置 → 便利贴”中填写 DeepSeek API Key 和模型名称。");
      return;
    }

    button.disabled = true;
    button.setText("正在本地查找…");
    output.empty();
    try {
      const candidates = await this.storage.findRelevant(question, 6);
      if (candidates.length === 0) {
        output.createEl("p", {
          text: "在便利贴中没有找到与这个问题相关的资料，因此没有调用 DeepSeek。",
          cls: "bianlitie-ask__empty"
        });
        return;
      }

      button.setText("正在依据资料回答…");
      const answer = await this.deepseek.answerFromNotes(question, candidates);
      output.createEl("h3", { text: "回答" });
      output.createEl("p", { text: answer, cls: "bianlitie-ask__answer" });
      this.renderSources(output, candidates);
    } catch (error) {
      const message = error instanceof Error ? error.message : "问答失败，请稍后重试。";
      output.createEl("p", { text: message, cls: "bianlitie-ask__error" });
    } finally {
      button.disabled = false;
      button.setText("查找并回答");
    }
  }

  private renderSources(container: HTMLElement, records: StickyNoteRecord[]): void {
    container.createEl("h3", { text: "引用来源" });
    const list = container.createDiv({ cls: "bianlitie-ask__sources" });
    records.forEach((record, index) => {
      const button = list.createEl("button", {
        cls: "bianlitie-source-link",
        attr: { type: "button" }
      });
      button.createSpan({ text: `[来源 ${index + 1}]`, cls: "bianlitie-source-link__index" });
      button.createSpan({ text: record.title, cls: "bianlitie-source-link__title" });
      button.addEventListener("click", () => {
        void this.app.workspace.getLeaf(false).openFile(record.file);
        this.close();
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
