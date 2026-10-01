/**
 * Utility for directly printing jsPDF documents in the browser without forcing a file download.
 * Uses an off-screen iframe to trigger the native browser print dialog, with automatic fallback
 * to a print-triggered tab if iframe printing is restricted.
 */

export function printPdfBlob(blob) {
  if (typeof window === 'undefined' || !blob) return;

  const blobUrl = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');

  // Keep in layout tree so browser renders PDF, but off-screen and invisible
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.opacity = '0.01';
  iframe.style.pointerEvents = 'none';
  iframe.style.border = '0';
  iframe.style.zIndex = '-9999';
  iframe.setAttribute('aria-hidden', 'true');

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
      URL.revokeObjectURL(blobUrl);
    } catch (_) {}
  };

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('Iframe print error, falling back to window.open:', e);
      const win = window.open(blobUrl, '_blank');
      if (win) {
        win.focus();
      }
    }
  };

  iframe.onload = () => {
    setTimeout(triggerPrint, 300);
  };

  // Fallback in case onload is suppressed by certain browser extensions or PDF plugin
  setTimeout(triggerPrint, 1600);

  // Retain blob URL long enough for print spooling before cleanup
  setTimeout(cleanup, 120000);

  iframe.src = blobUrl;
  document.body.appendChild(iframe);
}

export function printPdfDocument(doc) {
  if (!doc) return;
  try {
    if (typeof doc.autoPrint === 'function') {
      doc.autoPrint();
    }
  } catch (_) {}
  const blob = doc.output('blob');
  printPdfBlob(blob);
}
