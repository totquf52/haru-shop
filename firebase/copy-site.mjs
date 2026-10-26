// 하루상점 가게 파일을 firebase/public 폴더로 복사한다 - Firebase Hosting 배포 바로 앞에 돈다

// 1. 쓰는 도구
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 2. 어디서 어디로 - 이 파일이 있는 firebase 폴더 기준
const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const OUT = join(HERE, "public");

// 3. 싣지 않는 것 - 폴더 이름 · 파일 끝 글자
const SKIP_NAMES = new Set(["firebase", "node_modules"]);
const SKIP_ENDS = [".md", ".docx", ".xlsx", ".pptx", ".pdf"];

// 4. public 폴더를 비우고 다시 만든다
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);

// 5. 맨 위의 파일과 폴더를 하나씩 복사한다 - 점(.)으로 시작하는 것은 싣지 않는다
let count = 0;
for (const name of readdirSync(SITE)) {
  if (name.startsWith(".")) continue;
  if (SKIP_NAMES.has(name)) continue;
  if (SKIP_ENDS.some((end) => name.toLowerCase().endsWith(end))) continue;
  cpSync(join(SITE, name), join(OUT, name), { recursive: true });
  count += 1;
}

console.log(
  "copy-site: 가게 파일 " + count + "개를 public 폴더로 복사했습니다",
);
