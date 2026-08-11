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
<!-- Favicon (browser-tab icon): a real /favicon.svg file with a version query so
     browsers reliably pick up changes (bump ?v=N to force-refresh the tab icon).
     The Enfinity "E" is drawn as solid shapes in favicon.svg, so it renders the
     same everywhere. PNG fallback for older browsers that ignore SVG favicons. -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2">
<link rel="alternate icon" href="/favicon.svg?v=2">
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
