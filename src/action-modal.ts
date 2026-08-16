import { App, Modal } from "obsidian";

interface ActionModalOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export class BianlitieActionModal extends Modal {
  constructor(app: App, private readonly options: ActionModalOptions) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("bianlitie-action-modal");
    this.titleEl.setText(this.options.title);
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: this.options.message, cls: "bianlitie-action-modal__message" });

    const actions = this.contentEl.createDiv({ cls: "bianlitie-action-modal__actions" });
    const cancelButton = actions.createEl("button", {
      text: this.options.cancelLabel ?? "取消",
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

  onClose(): void {
    this.contentEl.empty();
  }
}
