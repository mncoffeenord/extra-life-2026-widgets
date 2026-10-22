// @ts-check
// The scenes' pixel lettering: 5x7 bitmap glyphs drawn as merged rectangles, plus the pixel heart bitmaps.
// Ported from the 2026 Asset Library generator (generator/scenes/scenes.py, pixlib_raw.py). Pure: no DOM.

/** Glyph rows, top to bottom, 5 columns each. A cell size of `px` makes a glyph 5px wide and 7px tall. */
export const GLYPHS = /** @type {Record<string, string[]>} */ ({
	A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
	B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
	C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
	D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
	E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
	F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
	G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
	H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
	I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
	J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
	K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
	L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
	M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
	N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
	O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
	P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
	Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
	R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
	S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
	T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
	U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
	V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
	W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
	X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
	Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
	Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
	0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
	1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
	2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
	3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
	4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
	5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
	6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
	7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
	8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
	9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
	':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
	'-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
	$: ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
	'/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
	',': ['00000', '00000', '00000', '00000', '00110', '00100', '01000'],
	'.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
	'!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
	'?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
	"'": ['00110', '00100', '01000', '00000', '00000', '00000', '00000'],
	'"': ['01010', '01010', '01010', '00000', '00000', '00000', '00000'],
	'&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
	'#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
	'(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
	')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
	'+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
	'%': ['11000', '11001', '00010', '00100', '01000', '10011', '00011'],
	'@': ['01110', '10001', '10111', '10101', '10111', '10000', '01111'],
});

/** Small pixel heart, 7x6 cells. */
export const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
/** Outlined heart container, 9x8 cells: O outline, F fill, h highlight. */
export const HEART_OUTLINED = ['.OOO.OOO.', 'OFFFOFFFO', 'OFhFFFFFO', 'OFFFFFFFO', '.OFFFFFO.', '..OFFFO..', '...OFO...', '....O....'];

/** Typographic look-alikes mapped onto glyphs we have. */
const LOOKALIKES = /** @type {Record<string, string>} */ ({ '‘': "'", '’': "'", '`': "'", '“': '"', '”': '"', '–': '-', '—': '-', _: '-', '…': '...' });

/**
 * Uppercase, strip accents, collapse whitespace, and replace anything without a glyph by `?`.
 * Every character of the result is a space or a key of GLYPHS.
 * @param {unknown} text
 */
export function normalizePixelText(text) {
	const s = String(text ?? '')
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toUpperCase()
		.replace(/\s+/g, ' ')
		.trim();
	let out = '';
	for (const ch of s) {
		const mapped = LOOKALIKES[ch] ?? ch;
		for (const c of mapped) out += c === ' ' || GLYPHS[c] ? c : '?';
	}
	return out;
}

/**
 * Width in pixels: 6 cells per character, 4 per space, minus the trailing gap.
 * @param {string} text normalized text
 * @param {number} px cell size
 */
export function pixelWidth(text, px) {
	if (!text) return 0;
	let w = 0;
	for (const ch of text) w += ch === ' ' ? 4 * px : 6 * px;
	return w - px;
}

/**
 * The rectangles that draw `text` with its top-left at (x, y): one per horizontal run of lit cells in a row.
 * @param {string} text normalized text
 * @param {number} px
 * @param {number} x
 * @param {number} y
 * @returns {{ x: number, y: number, w: number, h: number }[]}
 */
export function pixelRuns(text, px, x, y) {
	/** @type {{ x: number, y: number, w: number, h: number }[]} */
	const rects = [];
	let cx = x;
	for (const ch of text) {
		if (ch === ' ') {
			cx += 4 * px;
			continue;
		}
		const rows = GLYPHS[ch] ?? GLYPHS['?'] ?? [];
		rows.forEach((row, ri) => {
			let ci = 0;
			while (ci < 5) {
				if (row[ci] !== '1') {
					ci++;
					continue;
				}
				let cj = ci;
				while (cj < 5 && row[cj] === '1') cj++;
				rects.push({ x: cx + ci * px, y: y + ri * px, w: (cj - ci) * px, h: px });
				ci = cj;
			}
		});
		cx += 6 * px;
	}
	return rects;
}

/**
 * Fit text into `maxWidth`: try each cell size from maxPx down to minPx, then truncate with "..." at minPx.
 * @param {string} text normalized text
 * @param {number} maxWidth
 * @param {number} maxPx
 * @param {number} minPx
 * @returns {{ text: string, px: number, truncated: boolean }}
 */
export function fitPixelText(text, maxWidth, maxPx, minPx) {
	for (let px = maxPx; px >= minPx; px--) {
		if (pixelWidth(text, px) <= maxWidth) return { text, px, truncated: false };
	}
	const chars = Array.from(text);
	for (let n = chars.length - 1; n >= 0; n--) {
		const candidate = chars.slice(0, n).join('').trimEnd() + '...';
		if (pixelWidth(candidate, minPx) <= maxWidth) return { text: candidate, px: minPx, truncated: true };
	}
	return { text: '', px: minPx, truncated: true };
}
