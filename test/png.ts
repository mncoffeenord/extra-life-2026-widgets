// Minimal PNG reader for screenshot tests: 8-bit RGB or RGBA, not interlaced (what Chrome and Pillow write).
import { inflateSync } from 'node:zlib';

export interface Image {
	width: number;
	height: number;
	/** RGBA, 4 bytes per pixel */
	data: Uint8Array;
}

export function decodePng(buf: Buffer): Image {
	if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
	let pos = 8;
	let width = 0;
	let height = 0;
	let colorType = 0;
	const idat: Buffer[] = [];
	while (pos < buf.length) {
		const len = buf.readUInt32BE(pos);
		const type = buf.toString('latin1', pos + 4, pos + 8);
		const body = buf.subarray(pos + 8, pos + 8 + len);
		if (type === 'IHDR') {
			width = body.readUInt32BE(0);
			height = body.readUInt32BE(4);
			const depth = body[8];
			colorType = body[9]!;
			if (depth !== 8 || (colorType !== 2 && colorType !== 6) || body[12] !== 0) throw new Error(`unsupported PNG (depth ${depth}, color ${colorType}, interlace ${body[12]})`);
		} else if (type === 'IDAT') {
			idat.push(body);
		} else if (type === 'IEND') {
			break;
		}
		pos += 12 + len;
	}
	const bpp = colorType === 6 ? 4 : 3;
	const raw = inflateSync(Buffer.concat(idat));
	const stride = width * bpp;
	const out = new Uint8Array(width * height * 4);
	let prev = new Uint8Array(stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const line = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
		for (let i = 0; i < stride; i++) {
			const a = i >= bpp ? line[i - bpp]! : 0;
			const b = prev[i]!;
			const c = i >= bpp ? prev[i - bpp]! : 0;
			let add = 0;
			if (filter === 1) add = a;
			else if (filter === 2) add = b;
			else if (filter === 3) add = (a + b) >> 1;
			else if (filter === 4) {
				const p = a + b - c;
				const pa = Math.abs(p - a);
				const pb = Math.abs(p - b);
				const pc = Math.abs(p - c);
				add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			}
			line[i] = (line[i]! + add) & 0xff;
		}
		for (let x = 0; x < width; x++) {
			const o = (y * width + x) * 4;
			out[o] = line[x * bpp]!;
			out[o + 1] = line[x * bpp + 1]!;
			out[o + 2] = line[x * bpp + 2]!;
			out[o + 3] = bpp === 4 ? line[x * bpp + 3]! : 255;
		}
		prev = line;
	}
	return { width, height, data: out };
}

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Share of pixels whose largest channel difference exceeds `threshold` (0..255), ignoring pixels inside `skip`. */
export function diffRatio(a: Image, b: Image, threshold = 48, skip: Box[] = []): number {
	if (a.width !== b.width || a.height !== b.height) throw new Error(`size ${a.width}x${a.height} vs ${b.width}x${b.height}`);
	let bad = 0;
	for (let i = 0; i < a.data.length; i += 4) {
		const px = (i / 4) % a.width;
		const py = Math.floor(i / 4 / a.width);
		if (skip.some((r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h)) continue;
		const d = Math.max(Math.abs(a.data[i]! - b.data[i]!), Math.abs(a.data[i + 1]! - b.data[i + 1]!), Math.abs(a.data[i + 2]! - b.data[i + 2]!));
		if (d > threshold) bad++;
	}
	return bad / (a.width * a.height);
}
