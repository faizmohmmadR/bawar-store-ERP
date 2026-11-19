/** Sanitize a string for safe insertion into HTML content (escapes HTML entities). */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Print HTML in a hidden iframe so the app page is not replaced.
 *  IMPORTANT: The caller must ensure all user-supplied values in `html`
 *  are escaped with escapeHtml() before being passed here.
 */
export function printHtmlInHiddenIframe(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute(
    'style',
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden',
  );
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const doc = frameWindow?.document;
  if (!doc || !frameWindow) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  };

  const trigger = () => {
    frameWindow.focus();
    frameWindow.print();
    setTimeout(cleanup, 2500);
  };

  const imgs = Array.from(doc.images || []);
  if (imgs.length === 0) {
    setTimeout(trigger, 50);
    return;
  }

  let pending = imgs.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) setTimeout(trigger, 50);
  };
  imgs.forEach((img) => {
    if (img.complete) done();
    else {
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    }
  });
  setTimeout(() => {
    if (pending > 0) trigger();
  }, 1500);

  frameWindow.onafterprint = cleanup;
}
