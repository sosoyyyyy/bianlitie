import { App, Modal } from "obsidian";

export class BianlitieImageModal extends Modal {
  constructor(
    app: App,
    private readonly source: string,
    private readonly altText: string
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("bianlitie-image-modal");
    this.contentEl.empty();
    const image = this.contentEl.createEl("img", {
      cls: "bianlitie-image-modal__image",
      attr: { src: this.source, alt: this.altText }
    });
    image.addEventListener("click", () => this.close());
    if (this.altText) this.contentEl.createEl("p", { text: this.altText, cls: "bianlitie-image-modal__caption" });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
