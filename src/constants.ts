export const VIEW_TYPE_BIANLITIE = "bianlitie-view";
export const ROOT_FOLDER = "便利贴";
export const ATTACHMENT_ROOT = "attachments/bianlitie";
export const MAX_IMAGES_PER_NOTE = 5;
export const CATEGORIES = ["生活", "副业", "工作"] as const;
export const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
export const DEFAULT_MODEL = "deepseek-chat";

export type Category = (typeof CATEGORIES)[number];
export type CategoryFilter = "全部" | Category;
