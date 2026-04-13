import { readFile } from 'node:fs/promises';

const buildDataUrl = async (filePath) => {
  const buffer = await readFile(filePath);
  return `data:image/png;base64,${buffer.toString('base64')}`;
};

export const renderContactSheet = async (browser, options) => {
  const frames = await Promise.all(options.frames.map(async (frame) => ({
    label: frame.label,
    src: await buildDataUrl(frame.path)
  })));

  if (frames.length === 0) {
    throw new Error('renderContactSheet requires at least one frame.');
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  await page.setContent('<!doctype html><html><body style="margin:0;background:#07131b;"><canvas id="sheet"></canvas></body></html>');

  const size = await page.evaluate(async ({ title, columns, frames }) => {
    const loadImage = (src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });

    const images = await Promise.all(frames.map((frame) => loadImage(frame.src)));
    const canvas = document.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Contact sheet canvas missing.');
    }

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Contact sheet context missing.');
    }

    const padding = 24;
    const titleHeight = 54;
    const cellWidth = 280;
    const cellHeight = 180;
    const rows = Math.ceil(images.length / columns);
    canvas.width = (padding * 2) + (columns * cellWidth) + ((columns - 1) * padding);
    canvas.height = titleHeight + (padding * 2) + (rows * (cellHeight + 24)) + ((rows - 1) * padding);

    context.fillStyle = '#07131b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#eff8ff';
    context.font = '600 24px Trebuchet MS';
    context.fillText(title, padding, 34);

    images.forEach((image, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + (column * (cellWidth + padding));
      const y = titleHeight + padding + (row * (cellHeight + 24 + padding));
      const scale = Math.min(cellWidth / image.width, cellHeight / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const dx = x + ((cellWidth - drawWidth) / 2);
      const dy = y + ((cellHeight - drawHeight) / 2);

      context.fillStyle = '#0c2030';
      context.fillRect(x, y, cellWidth, cellHeight);
      context.drawImage(image, dx, dy, drawWidth, drawHeight);
      context.strokeStyle = 'rgba(122, 205, 255, 0.35)';
      context.lineWidth = 2;
      context.strokeRect(x, y, cellWidth, cellHeight);
      context.fillStyle = '#d9efff';
      context.font = '600 12px Consolas';
      context.fillText(frames[index].label, x, y + cellHeight + 16);
    });

    return { width: canvas.width, height: canvas.height };
  }, {
    title: options.title,
    columns: options.columns ?? 3,
    frames
  });

  await page.setViewportSize({
    width: Math.ceil(size.width),
    height: Math.ceil(size.height)
  });
  await page.locator('canvas').screenshot({ path: options.outputPath });
  await page.close();
};
