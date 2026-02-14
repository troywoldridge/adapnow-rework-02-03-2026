// src/lib/artworkThumb.ts

function isPdfPathname(pathname: string): boolean {
  return /\.pdf$/i.test(pathname);
}

function stripPdfExt(pathname: string): string {
  return pathname.replace(/\.pdf$/i, "");
}

/**
 * Returns true if the URL (absolute or relative) points to a PDF.
 */
export function isPdfUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return isPdfPathname(u.pathname);
  } catch {
    try {
      const u = new URL(url, "https://local.invalid");
      return isPdfPathname(u.pathname);
    } catch {
      return /\.pdf(\?|#|$)/i.test(url);
    }
  }
}

/**
 * If the original is a PDF, we try common sidecar names:
 *   file.pdf  -> file.jpg
 *   file.pdf  -> file.png
 *   file.pdf  -> file-thumb.jpg
 *   file.pdf  -> file.preview.jpg
 *   file.pdf  -> file_preview.jpg
 *   file.pdf  -> file.thumb.jpg
 *
 * If it's already an image (or non-PDF), we just return [original].
 *
 * Note: Preserves query string + hash from the original URL.
 */
export function thumbCandidatesFor(url: string): string[] {
  const variantsForBasePath = (basePath: string) => [
    `${basePath}.jpg`,
    `${basePath}.png`,
    `${basePath}-thumb.jpg`,
    `${basePath}.preview.jpg`,
    `${basePath}_preview.jpg`,
    `${basePath}.thumb.jpg`,
  ];

  // Absolute URL path
  try {
    const u = new URL(url);
    if (!isPdfPathname(u.pathname)) return [url];

    const basePath = stripPdfExt(u.pathname);
    const variants = variantsForBasePath(basePath);

    return variants.map((pathname) => {
      const v = new URL(u.toString());
      v.pathname = pathname; // keep search/hash as-is
      return v.toString();
    });
  } catch {
    // Relative URL path (use dummy base, then strip origin back out)
    try {
      const base = new URL(url, "https://local.invalid");
      if (!isPdfPathname(base.pathname)) return [url];

      const basePath = stripPdfExt(base.pathname);
      const variants = variantsForBasePath(basePath);

      return variants.map((pathname) => {
        const v = new URL(base.toString());
        v.pathname = pathname;
        return v.toString().replace(/^https:\/\/local\.invalid/, "");
      });
    } catch {
      // Last resort: string check + safe slicing (preserve ? and #)
      if (!/\.pdf(\?|#|$)/i.test(url)) return [url];

      const hashIdx = url.indexOf("#");
      const beforeHash = hashIdx === -1 ? url : url.slice(0, hashIdx);
      const hash = hashIdx === -1 ? "" : url.slice(hashIdx);

      const queryIdx = beforeHash.indexOf("?");
      const beforeQuery = queryIdx === -1 ? beforeHash : beforeHash.slice(0, queryIdx);
      const query = queryIdx === -1 ? "" : beforeHash.slice(queryIdx);

      const noPdf = beforeQuery.replace(/\.pdf$/i, "");
      const suffix = `${query}${hash}`;

      return [
        `${noPdf}.jpg${suffix}`,
        `${noPdf}.png${suffix}`,
        `${noPdf}-thumb.jpg${suffix}`,
        `${noPdf}.preview.jpg${suffix}`,
        `${noPdf}_preview.jpg${suffix}`,
        `${noPdf}.thumb.jpg${suffix}`,
      ];
    }
  }
}
