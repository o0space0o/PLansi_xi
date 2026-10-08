import { marked } from 'marked';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';

const sections = [
  ['tutorial', 'First visit', 'tutorial.md'],
  ['website', 'Website controls', 'website-guide.md'],
  ['music', 'Music player', 'music-player.md'],
  ['space', 'Black hole and 3D matter', 'space-objects.md'],
  ['science', 'Stars and dust', 'starlight-science.md'],
  ['credits', 'Credits', 'credits.md'],
  ['architecture', 'Code reference', 'architecture.md'],
  ['validation', 'Validation', 'validation.md'],
];
const anchors = Object.fromEntries(sections.map(([id, , file]) => [file, `#${id}`]));
const bodies = [];
for (const [id, , file] of sections) {
  let markdown = await readFile(`docs/${file}`, 'utf8');
  // File-relative links become sections in the combined, offline guide.
  markdown = markdown.replace(/\]\(([^)]+)\)/g, (match, url) => {
    const name = url.split('#')[0];
    return anchors[name] ? `](${anchors[name]})` : match;
  });
  bodies.push(`<section id="${id}">${marked.parse(markdown)}</section>`);
}
const navigation = sections.map(([id, title]) => `<a href="#${id}">${title}</a>`).join('');
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>PLansi_xi — user guide and reference</title>
  <style>
    :root { color-scheme: dark; font: 16px/1.7 system-ui,sans-serif; background:#080e18; color:#e0e7ef; }
    body { margin:0; }
    header { padding:38px max(24px,calc((100vw - 1000px)/2)); background:#101c2b; }
    header p { margin:0; color:#b6c7d9; }
    nav { display:flex; flex-wrap:wrap; gap:12px 24px; margin-top:18px; }
    a { color:#93cafa; text-underline-offset:3px; }
    main { max-width:1000px; margin:auto; padding:20px 24px 70px; }
    section { border-bottom:1px solid #263344; padding:20px 0 40px; scroll-margin-top:20px; }
    h1,h2,h3 { color:#f3f6fa; line-height:1.3; }
    h1 { font-size:2rem; } h2 { margin-top:32px; font-size:1.35rem; }
    table { display:block; overflow-x:auto; border-collapse:collapse; width:100%; margin:20px 0; }
    th,td { text-align:left; vertical-align:top; border:1px solid #304155; padding:10px 14px; }
    th { background:#142335; } code,pre { background:#111e2d; border-radius:5px; }
    code { padding:2px 5px; } pre { overflow-x:auto; padding:18px; } pre code { padding:0; }
    img { display:block; max-width:100%; height:auto; margin:24px auto; border-radius:6px; }
    li { margin:8px 0; } strong { color:#fff; }
    @media print { :root { color-scheme:light; background:white; color:#111; } header,th { background:#eee; } h1,h2,h3,strong { color:#111; } a { color:#174f7c; } }
  </style>
</head>
<body>
  <header><h1>PLansi_xi</h1><p>Website instructions, hidden music controls, and a reusable implementation reference.</p><nav>${navigation}</nav><p><a href="http://127.0.0.1:4173/">Open the local observatory</a></p></header>
  <main>${bodies.join('\n')}</main>
</body>
</html>`;
await mkdir('dist/guide-images', { recursive: true });
await cp('docs/images', 'dist/guide-images', { recursive: true });
await mkdir('dist/guide-screenshots', { recursive: true });
await cp('docs/screenshots', 'dist/guide-screenshots', { recursive: true });
await writeFile(
  'Guide.html',
  html
    .replaceAll('src="images/', 'src="docs/images/')
    .replaceAll('src="screenshots/', 'src="docs/screenshots/'),
);
await writeFile(
  'dist/help.html',
  html
    .replaceAll('src="images/', 'src="guide-images/')
    .replaceAll('src="screenshots/', 'src="guide-screenshots/')
    .replaceAll('href="http://127.0.0.1:4173"', 'href="/"')
    .replaceAll('href="http://127.0.0.1:4173/', 'href="/'),
);
console.log('Generated Guide.html (offline) and /help.html (local website).');
