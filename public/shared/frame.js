// @ts-check
// Framed style: wrap the widget in its own box (border, header with title, background) so the browser source is
// self-contained and can go anywhere. Runs before the widget module (classic script at the end of <body>).
//
// The server injects window.EL_DISPLAY = { style, frame: { title, h, head, headSize, align } } from config.json.
// URL overrides: ?style=framed | ?style=transparent | ?framed, and ?title=Custom%20title.
(function () {
	const settings = /** @type {{ style?: string, frame?: { title: string, h: number, head: number, headSize: number, align: string } }} */ (
		/** @type {any} */ (window).EL_DISPLAY || {}
	);
	const query = new URLSearchParams(location.search);
	const style = query.get('style') || (query.has('framed') ? 'framed' : settings.style) || 'transparent';
	const spec = settings.frame;
	const widget = document.querySelector('.widget');
	if (style !== 'framed' || !spec || !widget || !widget.parentNode) return;

	const root = document.documentElement.style;
	root.setProperty('--frame-h', String(spec.h));
	root.setProperty('--frame-head', String(spec.head));
	root.setProperty('--frame-head-size', String(spec.headSize));

	const frame = document.createElement('div');
	frame.className = `frame frame-${spec.align === 'left' ? 'left' : 'center'}`;
	const head = document.createElement('div');
	head.className = 'frame-head';
	head.textContent = query.get('title') || spec.title;
	const body = document.createElement('div');
	body.className = 'frame-body';
	widget.parentNode.insertBefore(frame, widget);
	body.appendChild(widget);
	frame.append(head, body);
	document.body.classList.add('framed');
})();
