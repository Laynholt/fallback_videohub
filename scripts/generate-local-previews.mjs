import fs from 'fs';
import path from 'path';
import vm from 'vm';

const rootDir = process.cwd();
const catalogPath = path.join(rootDir, 'scripts', 'catalog-data.js');
const outputDir = path.join(rootDir, 'assets', 'previews');

const context = {
  window: {},
  console,
  Intl
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(catalogPath, 'utf8'), context);

const { ALL_CARDS, buildLocalPreviewPath, buildPreviewSvgMarkup } = context.window.REMOVI_DATA;

fs.mkdirSync(outputDir, { recursive: true });

for (const card of ALL_CARDS) {
  const outputPath = path.join(rootDir, buildLocalPreviewPath(card.id));
  fs.writeFileSync(outputPath, buildPreviewSvgMarkup(card), 'utf8');
}

console.log(`Generated ${ALL_CARDS.length} local preview files in ${outputDir}`);
