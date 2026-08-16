import type { TFile } from "obsidian";
import type { Category } from "./constants";

export interface BianlitieSettings {
  deepseekApiKey: string;
  deepseekModel: string;
}

export interface GeneratedMetadata {
  tags: string[];
  keywords: string[];
}

export interface StickyNoteRecord {
  file: TFile;
  title: string;
  category: Category;
  created: string;
  modified: string;
  modifiedTimestamp: number;
  tags: string[];
  keywords: string[];
  body: string;
  snippet: string;
  score: number;
}
