import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const editor = await readFile(new URL("../src/components/ActivityEditor.tsx", import.meta.url), "utf8");
const memory = await readFile(new URL("../src/components/games/MemoryGame.tsx", import.meta.url), "utf8");
const activityImage = await readFile(new URL("../src/components/media/ActivityImage.tsx", import.meta.url), "utf8");
const memoryEditorCss = await readFile(new URL("../src/app/memory-editor.css", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

assert.match(editor, /First side/);
assert.match(editor, /Text ↔ text/);
assert.match(editor, /Image ↔ text/);
assert.match(editor, /This is what students will see\./);
assert.match(editor, /Replace image/);
assert.match(editor, /Remove/);
assert.match(editor, /uploadActivityImage/);
assert.match(editor, /ActivityImage refValue=\{item\.imageUrl\}/);
assert.match(editor, /prompt: candidate\.prompt\.trim\(\) \|\| "Picture"/);
assert.match(editor, /isGeneratedImagePrompt/);

assert.match(editor, /pairMediaModes/);
assert.match(editor, /itemsForSave/);
assert.match(editor, /setPairMediaMode\(item\.id, "text"\)/);
assert.match(editor, /setPairMediaMode\(item\.id, "image"\)/);
assert.match(editor, /Use saved image/);
assert.match(editor, /Your saved image is still available\./);
assert.doesNotMatch(editor, /onClick=\{\(\) => \{ if \(visualPair\) void removeImage\(index\); \}\}/);
assert.match(editor, /imageUrl: ""/);

assert.match(memory, /import \{ ActivityImage \}/);
assert.match(memory, /ActivityImage refValue=\{card\.imageUrl\}/);
assert.doesNotMatch(memory, /<img className="memory-card-image" src=\{card\.imageUrl\}/);

assert.match(activityImage, /SPRITE_PREFIX = "sprite:"/);
assert.match(activityImage, /parseSpriteRef/);
assert.match(activityImage, /viewBox=\{`\$\{sprite\.column\} \$\{sprite\.row\} 1 1`\}/);
assert.match(activityImage, /preserveAspectRatio="xMidYMid slice"/);
assert.match(activityImage, /<image href=\{sprite\.src\}/);
assert.match(memoryEditorCss, /svg\[role="img"\]/);
assert.match(layout, /\.\/memory-editor\.css/);

console.log("ClassPlay Memory image editor contract tests passed.");
