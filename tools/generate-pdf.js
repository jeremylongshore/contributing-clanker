import { mdToPdf } from 'md-to-pdf';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { basename, dirname, join } from 'path';

/**
 * Generate PDF from Markdown
 * Usage: node generate-pdf.js <input.md> [output.pdf]
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(`
Usage: npm run pdf -- <input.md> [output.pdf]

Examples:
  npm run pdf -- proposal.md
  npm run pdf -- report.md client-report.pdf
`);
    process.exit(1);
  }

  const [inputFile, outputFile] = args;

  if (!existsSync(inputFile)) {
    console.error(`File not found: ${inputFile}`);
    process.exit(1);
  }

  const output = outputFile || inputFile.replace(/\.md$/, '.pdf');

  console.log(`Converting: ${inputFile} -> ${output}`);

  try {
    const pdf = await mdToPdf(
      { path: inputFile },
      {
        // The dev box disables unprivileged user namespaces (AppArmor), so
        // Chrome's sandbox cannot start. Safe here: this tool renders only
        // our own authored markdown, never untrusted input.
        launch_options: { args: ['--no-sandbox'] },
        pdf_options: {
          format: 'A4',
          margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
          printBackground: true,
        },
        stylesheet: [],
        css: `
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; }
          h1 { color: #1a1a1a; border-bottom: 2px solid #333; padding-bottom: 0.3em; }
          h2 { color: #2a2a2a; }
          code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
          pre { background: #f4f4f4; padding: 16px; border-radius: 6px; overflow-x: auto; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f4f4f4; }
        `,
      }
    );

    if (pdf.content) {
      writeFileSync(output, pdf.content);
      console.log(`✓ PDF generated: ${output}`);
    }
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
}

main();
