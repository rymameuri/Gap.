import type { Slide } from "../services/types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Opens a print-ready window so the teacher can save the deck as a PDF. */
export function downloadSlidesAsPdf(title: string, slides: Slide[]): void {
  const deckTitle = title.trim() || "Presentation";
  const pages = slides
    .map((slide, i) => {
      const bullets = slide.bullets
        .map((b) => b.trim())
        .filter(Boolean)
        .map((b) => `<li>${escapeHtml(b)}</li>`)
        .join("");
      return `<section class="page">
  <h1>${escapeHtml(slide.title || `Slide ${i + 1}`)}</h1>
  <ul>${bullets}</ul>
  <footer>${escapeHtml(deckTitle)} · ${i + 1} / ${slides.length}</footer>
</section>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(deckTitle)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", system-ui, sans-serif;
      color: #1c1917;
      background: #e7e5e4;
    }
    .page {
      width: 11in;
      height: 6.1875in;
      margin: 0.4in auto;
      padding: 0.7in 0.85in;
      background: #fff;
      position: relative;
      page-break-after: always;
      break-after: page;
    }
    .page:last-child { page-break-after: auto; break-after: auto; }
    h1 {
      font-size: 28pt;
      font-weight: 650;
      line-height: 1.2;
      margin-bottom: 0.35in;
    }
    ul {
      padding-left: 0.35in;
      font-size: 16pt;
      line-height: 1.55;
    }
    li { margin-bottom: 0.12in; }
    footer {
      position: absolute;
      left: 0.85in;
      right: 0.85in;
      bottom: 0.35in;
      font-size: 9pt;
      color: #78716c;
    }
    @page { size: landscape; margin: 0; }
    @media print {
      body { background: none; }
      .page {
        margin: 0;
        width: 100vw;
        height: 100vh;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
${pages}
<script>
  window.onload = function () {
    setTimeout(function () {
      window.focus();
      window.print();
    }, 150);
  };
</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    throw new Error(
      "Pop-up blocked. Allow pop-ups for this site to download the PDF.",
    );
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
