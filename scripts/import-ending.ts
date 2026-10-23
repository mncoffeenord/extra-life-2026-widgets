// Import the owner's final Ending scene designs into public/scenes/ending/.
//
//   node scripts/import-ending.ts <ending-dark-animated.html> <ending-light-animated.html>
//
// Each design is a self-contained page: one 1920x1080 SVG of pixel rects plus two embedded images (Marvin and the
// Extra Life logo) and the ambient-motion CSS. This writes art-dark.svg and art-light.svg with the images moved to
// their own files, and with the placeholder team goal value removed (the page draws the live value in its place).
// The two looks must embed the same images.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/scenes/ending/', import.meta.url));
/** The placeholder "$3,250 / $5,000": the tilted group around the value row, the last element of the SVG. */
const VALUE_GROUP = '<g transform="translate(1770 1013) skewX(-8) translate(-1770 -1013)">';
const IMAGES = [
	{ type: 'image/png', file: 'marvin.png' },
	{ type: 'image/svg+xml', file: 'extra-life-logo.svg' },
];

function importLook(html: string): { svg: string; images: Map<string, Buffer> } {
	let svg = html.slice(html.indexOf('<svg'), html.lastIndexOf('</svg>') + '</svg>'.length);
	const images = new Map<string, Buffer>();
	for (const { type, file } of IMAGES) {
		const re = new RegExp(`href="data:${type.replace('+', '\\+')};base64,([^"]+)"`);
		const m = re.exec(svg);
		if (!m) throw new Error(`no embedded ${type} image found`);
		images.set(file, Buffer.from(m[1] ?? '', 'base64'));
		svg = svg.replace(m[0], `href="${file}"`);
	}
	const at = svg.lastIndexOf(VALUE_GROUP);
	if (at < 0) throw new Error('team goal value group not found');
	svg = `${svg.slice(0, at)}</svg>\n`;
	return { svg, images };
}

const [darkPath, lightPath] = process.argv.slice(2);
if (!darkPath || !lightPath) {
	console.error('usage: node scripts/import-ending.ts <ending-dark-animated.html> <ending-light-animated.html>');
	process.exit(1);
}
const dark = importLook(readFileSync(darkPath, 'utf8'));
const light = importLook(readFileSync(lightPath, 'utf8'));
const hash = (b: Buffer | undefined) => (b ? createHash('sha256').update(b).digest('hex') : '');
for (const { file } of IMAGES) {
	if (hash(dark.images.get(file)) !== hash(light.images.get(file))) throw new Error(`${file} differs between the looks`);
	writeFileSync(join(OUT, file), dark.images.get(file) ?? Buffer.alloc(0));
}
writeFileSync(join(OUT, 'art-dark.svg'), dark.svg);
writeFileSync(join(OUT, 'art-light.svg'), light.svg);
console.log(`wrote ${OUT}: art-dark.svg (${dark.svg.length} B), art-light.svg (${light.svg.length} B), ${IMAGES.map((i) => i.file).join(', ')}`);
