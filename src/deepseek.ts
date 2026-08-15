import { requestUrl } from "obsidian";
import { DEEPSEEK_ENDPOINT, type Category } from "./constants";
import type { BianlitieSettings, GeneratedMetadata, StickyNoteRecord } from "./types";
import { normalizeList } from "./utils";

interface DeepSeekChoice {
  message?: {
    content?: string;
  };
}

interface DeepSeekResponse {
  choices?: DeepSeekChoice[];
  error?: {
    message?: string;
  };
}

export class DeepSeekClient {
  constructor(private readonly getSettings: () => BianlitieSettings) {}

  isConfigured(): boolean {
    const settings = this.getSettings();
    return settings.deepseekApiKey.trim().length > 0 && settings.deepseekModel.trim().length > 0;
  }

  async generateMetadata(originalContent: string, category: Category): Promise<GeneratedMetadata> {
    const prompt = [
      "你是私人便利贴的元数据助手。一级分类已经由用户手动选择，绝对不要修改或重新判断一级分类。",
      "只分析原文，生成便于本地检索的二级标签和检索关键词。",
      "返回严格 JSON：{\"tags\":[\"...\"],\"keywords\":[\"...\"]}。",
      "tags 2-5 个，keywords 3-8 个，短语要简洁；不要添加原文没有依据的事实。",
      `用户选择的一级分类：${category}`,
      "原文如下：",
      originalContent
    ].join("\n");
    const content = await this.chat(
      [
        { role: "system", content: "只输出合法 JSON，不要使用 Markdown 代码块。" },
        { role: "user", content: prompt }
      ],
      true
    );
    const parsed = this.parseJsonObject(content);
    return {
      tags: normalizeList(parsed.tags, 5),
      keywords: normalizeList(parsed.keywords, 8)
    };
  }

  async answerFromNotes(question: string, candidates: StickyNoteRecord[]): Promise<string> {
    const sourceText = candidates.map((record, index) => {
      const body = record.body.length > 3000 ? `${record.body.slice(0, 3000)}…` : record.body;
      return `[来源 ${index + 1}] ${record.file.path}\n${body}`;
    }).join("\n\n");

    const prompt = [
      "请仅根据下方便利贴资料回答用户问题。",
      "每个关键结论尽量用 [来源 N] 标注依据。",
      "如果资料不足以回答，明确说“在便利贴中没有找到足够依据”，不要使用常识补全或编造。",
      `用户问题：${question}`,
      "便利贴资料：",
      sourceText
    ].join("\n\n");

    return this.chat([
      { role: "system", content: "你是谨慎的私人资料问答助手，只能依据提供的便利贴资料回答。" },
      { role: "user", content: prompt }
    ]);
  }

  private async chat(messages: Array<{ role: "system" | "user"; content: string }>, jsonMode = false): Promise<string> {
    const settings = this.getSettings();
    const apiKey = settings.deepseekApiKey.trim();
    const model = settings.deepseekModel.trim();
    if (!apiKey || !model) throw new Error("请先在便利贴设置中填写 DeepSeek API Key 和模型名称。");

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: 0.2,
      max_tokens: jsonMode ? 800 : 1800,
      stream: false
    };
    if (jsonMode) body.response_format = { type: "json_object" };

    const response = await requestUrl({
      url: DEEPSEEK_ENDPOINT,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      throw: false
    });
    const payload = response.json as DeepSeekResponse;
    if (response.status < 200 || response.status >= 300) {
      throw new Error(payload?.error?.message || `DeepSeek 请求失败（HTTP ${response.status}）。`);
    }
    const content = payload?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("DeepSeek 返回了空内容。");
    return content;
  }

  private parseJsonObject(content: string): Record<string, unknown> {
    const cleaned = content.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
    try {
      const value = JSON.parse(cleaned) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
      // 下方给出统一、不会泄露响应正文的错误。
    }
    throw new Error("DeepSeek 返回的标签格式无效。");
  }
}
