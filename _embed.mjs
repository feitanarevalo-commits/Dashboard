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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
<script src="config.js"><\/script>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
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
