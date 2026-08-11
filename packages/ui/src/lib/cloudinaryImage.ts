export interface CloudinaryTransformOptions {
  width?: number;
  height?: number;
  crop?: 'fill' | 'fit' | 'scale' | 'thumb' | 'limit';
  quality?: 'auto' | number;
  format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png';
  dpr?: number;
}

export interface BuildSrcSetOptions extends CloudinaryTransformOptions {
  /** Base widths to generate srcset entries for */
  widths?: number[];
  /** Cloudinary cloud name — defaults to extracting from URL if present */
  cloudName?: string;
}

const DEFAULT_WIDTHS = [320, 640, 768, 1024, 1280, 1536];

/**
 * Build a Cloudinary srcSet string for responsive images.
 *
 * Accepts either a full Cloudinary URL or a public ID with cloudName option.
 *
 * @example
 * buildSrcSet('https://res.cloudinary.com/demo/image/upload/v123/sample.jpg', { widths: [400, 800] })
 */
export function buildSrcSet(
  src: string,
  options: BuildSrcSetOptions = {},
): string {
  const {
    widths = DEFAULT_WIDTHS,
    width,
    height,
    crop = 'fill',
    quality = 'auto',
    format = 'auto',
    dpr = 1,
    cloudName,
  } = options;

  const buildTransform = (w: number): string => {
    const parts = [`c_${crop}`, `w_${w}`, `q_${quality}`, `f_${format}`, `dpr_${dpr}`];
    if (height) parts.splice(2, 0, `h_${height}`);
    if (width && !height) parts.push(`w_${width}`);
    return parts.join(',');
  };

  const buildUrl = (w: number): string => {
    const transform = buildTransform(w);

    if (src.includes('res.cloudinary.com')) {
      const uploadIndex = src.indexOf('/upload/');
      if (uploadIndex === -1) return src;
      const prefix = src.slice(0, uploadIndex + '/upload/'.length);
      const suffix = src.slice(uploadIndex + '/upload/'.length).replace(/^v\d+\//, '');
      return `${prefix}${transform}/${suffix}`;
    }

    const cloud = cloudName ?? 'commercenest';
    const publicId = src.replace(/^\//, '');
    return `https://res.cloudinary.com/${cloud}/image/upload/${transform}/${publicId}`;
  };

  return widths.map((w) => `${buildUrl(w)} ${w}w`).join(', ');
}

/**
 * Build a single optimized Cloudinary URL with transforms applied.
 */
export function buildCloudinaryUrl(
  src: string,
  options: CloudinaryTransformOptions = {},
): string {
  const srcSet = buildSrcSet(src, { ...options, widths: [options.width ?? 800] });
  return srcSet.split(' ')[0] ?? src;
}
