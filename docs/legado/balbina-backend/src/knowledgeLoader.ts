import { promises as fs } from "fs";
import path from "path";

export async function loadConhecimento(projectRoot = process.cwd(), filename = "conhecimento_tambaqui.txt") {
  const p = path.join(projectRoot, filename);
  try {
    const raw = await fs.readFile(p, "utf-8");
    try {
      return JSON.parse(raw);
    } catch {
      const obj: any = {};
      for (const line of raw.split("\n")) {
        const l = line.trim();
        if (!l || l.startsWith("#")) continue;
        const [k, ...rest] = l.split(":");
        if (!k) continue;
        const val = rest.join(":").trim();
        const n = Number(val);
        obj[k.trim()] = Number.isFinite(n) ? n : val;
      }
      return obj;
    }
  } catch {
    return {};
  }
}