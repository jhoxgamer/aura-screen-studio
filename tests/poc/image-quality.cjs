/**
 * Objective Video Frame Quality Analyzer (PSNR, SSIM, Text Contrast)
 * Pure JavaScript implementation with zero external dependencies.
 */

function computeMSE(img1, img2) {
  if (img1.width !== img2.width || img1.height !== img2.height) {
    throw new Error('Image dimensions must match for MSE comparison');
  }

  const d1 = img1.data;
  const d2 = img2.data;
  let sumSquaredDiff = 0;
  const totalPixels = img1.width * img1.height;

  for (let i = 0; i < d1.length; i += 4) {
    const dr = d1[i] - d2[i];
    const dg = d1[i + 1] - d2[i + 1];
    const db = d1[i + 2] - d2[i + 2];
    sumSquaredDiff += (dr * dr + dg * dg + db * db) / 3;
  }

  return sumSquaredDiff / totalPixels;
}

function computePSNR(img1, img2) {
  const mse = computeMSE(img1, img2);
  if (mse === 0) return 100.0; // Identical images
  return 10 * Math.log10((255 * 255) / mse);
}

/**
 * Structural Similarity Index (SSIM) computed over luminance
 * using 8x8 block sampling across the image.
 */
function computeSSIM(img1, img2, step = 8, blockSize = 8) {
  if (img1.width !== img2.width || img1.height !== img2.height) {
    throw new Error('Image dimensions must match for SSIM comparison');
  }

  const w = img1.width;
  const h = img1.height;
  const d1 = img1.data;
  const d2 = img2.data;

  // Convert RGB to luminance Y = 0.299*R + 0.587*G + 0.114*B
  const y1 = new Float32Array(w * h);
  const y2 = new Float32Array(w * h);

  for (let i = 0, j = 0; i < d1.length; i += 4, j++) {
    y1[j] = 0.299 * d1[i] + 0.587 * d1[i + 1] + 0.114 * d1[i + 2];
    y2[j] = 0.299 * d2[i] + 0.587 * d2[i + 1] + 0.114 * d2[i + 2];
  }

  const C1 = 6.5025;  // (0.01 * 255)^2
  const C2 = 58.5225; // (0.03 * 255)^2

  let ssimSum = 0;
  let blockCount = 0;

  for (let y = 0; y <= h - blockSize; y += step) {
    for (let x = 0; x <= w - blockSize; x += step) {
      let sum1 = 0;
      let sum2 = 0;

      for (let by = 0; by < blockSize; by++) {
        const rowOffset = (y + by) * w;
        for (let bx = 0; bx < blockSize; bx++) {
          const idx = rowOffset + (x + bx);
          sum1 += y1[idx];
          sum2 += y2[idx];
        }
      }

      const N = blockSize * blockSize;
      const mu1 = sum1 / N;
      const mu2 = sum2 / N;

      let var1 = 0;
      let var2 = 0;
      let covar = 0;

      for (let by = 0; by < blockSize; by++) {
        const rowOffset = (y + by) * w;
        for (let bx = 0; bx < blockSize; bx++) {
          const idx = rowOffset + (x + bx);
          const diff1 = y1[idx] - mu1;
          const diff2 = y2[idx] - mu2;
          var1 += diff1 * diff1;
          var2 += diff2 * diff2;
          covar += diff1 * diff2;
        }
      }

      const sigma1Sq = var1 / (N - 1);
      const sigma2Sq = var2 / (N - 1);
      const sigma12 = covar / (N - 1);

      const numerator = (2 * mu1 * mu2 + C1) * (2 * sigma12 + C2);
      const denominator = (mu1 * mu1 + mu2 * mu2 + C1) * (sigma1Sq + sigma2Sq + C2);
      const ssim = numerator / denominator;

      ssimSum += ssim;
      blockCount++;
    }
  }

  return blockCount > 0 ? (ssimSum / blockCount) : 1.0;
}

/**
 * Text Edge Sharpness metric (Variance of Laplacian)
 * Measures preservation of high-frequency edges essential for code text readability.
 */
function computeEdgeSharpness(img) {
  const w = img.width;
  const h = img.height;
  const d = img.data;

  // Convert to grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }

  // 3x3 Laplacian kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
  let lapSum = 0;
  let lapSumSq = 0;
  let count = 0;

  for (let y = 1; y < h - 1; y += 2) {
    const row = y * w;
    const rowPrev = (y - 1) * w;
    const rowNext = (y + 1) * w;

    for (let x = 1; x < w - 1; x += 2) {
      const val = 
        gray[rowPrev + x] +
        gray[rowNext + x] +
        gray[row + x - 1] +
        gray[row + x + 1] -
        4 * gray[row + x];

      lapSum += val;
      lapSumSq += val * val;
      count++;
    }
  }

  const mean = lapSum / count;
  const variance = (lapSumSq / count) - (mean * mean);
  return variance;
}

module.exports = {
  computeMSE,
  computePSNR,
  computeSSIM,
  computeEdgeSharpness
};
