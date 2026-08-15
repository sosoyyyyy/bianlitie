export const VIEW_TYPE_BIANLITIE = "bianlitie-view";
export const ROOT_FOLDER = "便利贴";
export const CATEGORIES = ["工作", "生活", "副业"] as const;
export const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
export const DEFAULT_MODEL = "deepseek-chat";

export type Category = (typeof CATEGORIES)[number];
export type CategoryFilter = "全部" | Category;
