import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

function sanitizeFilename(value) {
  return (
    String(value || 'report')
      .trim()
      .replace(/[^\w.-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80) || 'report'
  );
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.readAsDataURL(blob);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFonts() {
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch {
    /* ignore */
  }
}

function isRemoteImageSrc(src) {
  if (!src) return false;
  if (src.startsWith('data:') || src.startsWith('blob:')) return false;
  if (src.startsWith('/') || src.startsWith(window.location.origin)) return false;
  return /^https?:\/\//i.test(src);
}

/**
 * Replace remote <img> sources with same-origin proxied data URLs so html2canvas can paint them.
 */
async function inlineRemoteImages(root) {
  const imgs = Array.from(root.querySelectorAll('img[src]'));
  const restores = [];

  await Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.getAttribute('src') || '';
      if (!isRemoteImageSrc(src)) return;

      try {
        const proxyUrl = `/api/chess-com/proxy-image?url=${encodeURIComponent(src)}`;
        const res = await fetch(proxyUrl, { credentials: 'include' });
        if (!res.ok) throw new Error(`Proxy ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error('Not an image');
        const dataUrl = await blobToDataUrl(blob);
        restores.push(() => {
          img.src = src;
        });
        img.removeAttribute('crossorigin');
        img.src = dataUrl;
        if (typeof img.decode === 'function') {
          await img.decode().catch(() => undefined);
        }
      } catch (err) {
        console.warn('PDF image inline failed:', src, err);
      }
    })
  );

  return () => {
    restores.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  };
}

function prepareClone(clonedDoc, clonedEl) {
  clonedDoc.querySelectorAll('[data-pdf-ignore]').forEach((node) => {
    node.style.display = 'none';
  });
  clonedDoc.querySelectorAll('[data-pdf-hidden]').forEach((node) => {
    node.style.display = 'none';
  });

  clonedDoc.querySelectorAll('style').forEach((styleEl) => {
    if (!styleEl.textContent) return;
    styleEl.textContent = styleEl.textContent
      .replace(/color-mix\((?:[^)(]+|\([^)(]*\))*\)/gi, 'transparent')
      .replace(/oklch\([^)]*\)/gi, '#cccccc')
      .replace(/lab\([^)]*\)/gi, '#cccccc')
      .replace(/lch\([^)]*\)/gi, '#cccccc');
  });

  const sticky = clonedEl.querySelectorAll('.chess-basic-sticky-filters');
  sticky.forEach((node) => {
    node.style.position = 'static';
    node.style.top = 'auto';
    node.style.boxShadow = 'none';
  });

  // Prevent html2canvas from clipping rating-card labels/deltas at the top.
  clonedEl.querySelectorAll('.chess-live-rating-card').forEach((card) => {
    card.style.overflow = 'visible';
    card.style.alignItems = 'flex-start';
    card.style.paddingTop = '18px';
    card.style.minHeight = '108px';
  });
  clonedEl.querySelectorAll('.chess-live-rating-text').forEach((node) => {
    node.style.overflow = 'visible';
    node.style.lineHeight = '1.35';
    node.style.gap = '4px';
  });
  clonedEl.querySelectorAll('.chess-live-rating-head').forEach((node) => {
    node.style.overflow = 'visible';
    node.style.alignItems = 'flex-start';
    node.style.minHeight = '1.45em';
  });
  clonedEl
    .querySelectorAll(
      '.chess-live-rating-label, .chess-live-rating-delta, .chess-live-rating-value, .chess-live-rating-best'
    )
    .forEach((node) => {
      node.style.overflow = 'visible';
      node.style.textOverflow = 'clip';
      node.style.lineHeight = '1.45';
      node.style.paddingTop = '2px';
      node.style.paddingBottom = '1px';
    });

  clonedEl.style.background = '#ffffff';
  clonedEl.style.overflow = 'visible';
  clonedEl.style.maxWidth = 'none';
}

async function captureElement(element) {
  const width = Math.max(element.scrollWidth, element.offsetWidth, 800);
  return html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: -window.scrollY,
    windowWidth: width,
    width,
    onclone: prepareClone,
  });
}

function addCanvasPages(pdf, canvas, { pageMarginMm = 10, forceNewFirstPage = false } = {}) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - pageMarginMm * 2;
  const contentHeight = pageHeight - pageMarginMm * 2;
  const imgWidth = contentWidth;
  const pxPerMm = canvas.width / imgWidth;
  const pageCanvasHeight = Math.max(1, Math.floor(contentHeight * pxPerMm));

  let renderedY = 0;
  let pageIndex = 0;

  while (renderedY < canvas.height) {
    const sliceHeight = Math.min(pageCanvasHeight, canvas.height - renderedY);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const ctx = pageCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(
      canvas,
      0,
      renderedY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight
    );

    const sliceData = pageCanvas.toDataURL('image/jpeg', 0.95);
    const sliceHeightMm = sliceHeight / pxPerMm;

    if (pageIndex > 0 || forceNewFirstPage) {
      pdf.addPage();
    }
    pdf.addImage(
      sliceData,
      'JPEG',
      pageMarginMm,
      pageMarginMm,
      imgWidth,
      sliceHeightMm,
      undefined,
      'FAST'
    );

    renderedY += sliceHeight;
    pageIndex += 1;
  }

  return pageIndex;
}

/**
 * Capture a player report as PDF:
 * - page 1+: summary (profile, ratings, chart, achievement cards)
 * - next page+: win streak badges (always starts on a fresh page)
 */
export async function downloadElementAsPdf(element, { filename = 'report.pdf' } = {}) {
  if (!element) {
    throw new Error('Nothing to export.');
  }

  const restoreImages = await inlineRemoteImages(element);
  element.classList.add('is-pdf-export');

  const streaksEl = element.querySelector('[data-pdf-part="streaks"]');

  try {
    await waitForFonts();
    await wait(120);

    if (streaksEl) {
      streaksEl.setAttribute('data-pdf-hidden', '1');
    }

    const summaryCanvas = await captureElement(element);

    if (streaksEl) {
      streaksEl.removeAttribute('data-pdf-hidden');
    }

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    addCanvasPages(pdf, summaryCanvas, { forceNewFirstPage: false });

    if (streaksEl) {
      await wait(100);
      // Capture streaks as their own tree — mirror PDF class onto the section root
      // so compact spacing rules still apply without the parent wrapper.
      const prevMinWidth = streaksEl.style.minWidth;
      streaksEl.classList.add('is-pdf-export');
      streaksEl.style.minWidth = `${Math.max(element.clientWidth || 0, 780)}px`;
      try {
        const streakCanvas = await captureElement(streaksEl);
        addCanvasPages(pdf, streakCanvas, { forceNewFirstPage: true });
      } finally {
        streaksEl.style.minWidth = prevMinWidth;
        streaksEl.classList.remove('is-pdf-export');
      }
    }

    const safeName = sanitizeFilename(filename.replace(/\.pdf$/i, ''));
    pdf.save(`${safeName}.pdf`);
  } finally {
    if (streaksEl) {
      streaksEl.removeAttribute('data-pdf-hidden');
    }
    element.classList.remove('is-pdf-export');
    restoreImages();
  }
}
