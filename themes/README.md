# Custom themes

Each `<name>.json` file here is a color theme. Make one with `npm run theme`, then use it per source with
`?theme=<name>` on a widget URL, or for every widget with `"theme": { "preset": "<name>" }` in `config.json`.

```json
{
	"description": "Purple on dark",
	"base": "midnight",
	"colors": { "primary": "#6A1B9A", "primaryLight": "#9C4DCC", "accent": "#FFB300" }
}
```

- The file name is the theme name: lowercase letters, digits and dashes. Built-in names (`extra-life`, `midnight`,
  `mono`) are taken.
- `base` (optional, default `extra-life`) is a built-in theme that fills any colors you leave out. `npm run theme`
  writes all 8 colors, so its files stand on their own.
- The server re-reads this folder on every widget page load: a new or edited theme shows after the source refreshes,
  with no restart. A broken file is skipped, and the server prints why.

See INSTALL.md ("Colors and themes") for what each color is used for.
