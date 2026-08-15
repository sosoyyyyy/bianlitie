import { readFile, stat } from "node:fs/promises";

const [manifestText, bundleText] = await Promise.all([
  readFile("manifest.json", "utf8"),
  readFile("main.js", "utf8")
]);
const manifest = JSON.parse(manifestText);

if (manifest.id !== "bianlitie") {
  throw new Error("manifest id 必须是 bianlitie");
}
if (manifest.isDesktopOnly !== false) {
  throw new Error("manifest 必须明确声明 isDesktopOnly: false");
}

const bannedRuntimeImports = [
  /require\(["'](?:node:)?fs["']\)/,
  /require\(["'](?:node:)?path["']\)/,
  /require\(["']electron["']\)/
];
for (const pattern of bannedRuntimeImports) {
  if (pattern.test(bundleText)) {
    throw new Error(`发现桌面专属运行时依赖：${pattern}`);
  }
}

for (const file of ["main.js", "manifest.json", "styles.css"]) {
  const fileStat = await stat(file);
  if (!fileStat.isFile() || fileStat.size === 0) {
    throw new Error(`${file} 不存在或为空`);
  }
}

console.log("构建检查通过：manifest、产物与跨平台运行时依赖均符合要求。");
