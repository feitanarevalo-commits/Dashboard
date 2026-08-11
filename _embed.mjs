import { readFileSync, writeFileSync } from 'fs';

const appJs = readFileSync('app.js', 'utf8');
const wrapped = `;(function() {\n${appJs}\n})();`;

// Build clean index.html
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LeadFlow — YouTube &amp; Social Scraper</title>
<!-- Favicon (browser-tab icon). Self-contained URL-encoded SVG so there's no
     extra file or network request, and it survives every rebuild. To change it,
     edit the SVG below: swap the letter (E), the tile colour (%235b5bd6 = #5b5bd6),
     or replace the whole <text> with an emoji, e.g. <text ...>🎯</text>. -->
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%235b5bd6'/%3E%3Ctext%20x='16'%20y='23'%20font-family='Arial,Helvetica,sans-serif'%20font-size='21'%20font-weight='700'%20fill='%23ffffff'%20text-anchor='middle'%3EE%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
<script src="config.js"><\/script>
<!-- crossorigin: without it, ANY error thrown inside these CDN scripts reaches
     window.onerror as a bare "Script error." with no message or stack, which is
     exactly what the Error Log captured for Mica. Both CDNs send
     Access-Control-Allow-Origin: *, so this just makes failures legible. -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" crossorigin="anonymous"><\/script>
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin="anonymous"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin="anonymous"><\/script>
</head>
<body>
<div id="root"></div>
<script>
${wrapped}
<\/script>
</body>
</html>
`;

writeFileSync('index.html', html, 'utf8');
console.log('index.html written, lines:', html.split('\n').length);
