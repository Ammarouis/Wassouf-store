import dotenv from 'dotenv';
import path from 'node:path';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { getMediaRoot, IMAGE_MIME_EXTENSIONS } from './media/media-storage.service';

const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_STORED_BYTES = 8 * 1024 * 1024;
const LOCAL_IMAGE_URL = /^\/api\/media\/[a-f\d-]{36}\.(?:jpg|png|webp|gif)$/i;

function legacyMediaId(image: any): string | undefined {
  const direct = image && typeof image === 'object' ? String(image.mediaId || '') : '';
  if (/^[a-f\d]{24}$/i.test(direct)) return direct;
  const url = typeof image === 'string' ? image : image?.url;
  const match = typeof url === 'string' ? url.match(/^\/api\/media\/([a-f\d]{24})$/i) : null;
  return match?.[1];
}

function detectMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
  return null;
}

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  const uri = process.env.MONGODB_URI;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!uri) throw new Error('Set MONGODB_URI before migrating legacy product images.');
  if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN temporarily to import existing Telegram-hosted images.');

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const products = db.collection('products');
  const branches = db.collection('branches');
  const legacyMedia = db.collection('telegrammedias');
  const mediaRoot = getMediaRoot();
  await mkdir(mediaRoot, { recursive: true });

  const downloaded = new Map<string, { url: string; filePath: string }>();
  const failures: string[] = [];
  let migratedImages = 0;

  async function importMedia(mediaId: string): Promise<{ url: string; filePath: string } | null> {
    if (downloaded.has(mediaId)) return downloaded.get(mediaId)!;
    const record = await legacyMedia.findOne({ _id: new mongoose.Types.ObjectId(mediaId) });
    if (!record || typeof record.fileId !== 'string' || !record.fileId || record.syncStatus === 'missing' || record.syncStatus === 'archived') {
      failures.push(`${mediaId}: no usable legacy media record`);
      return null;
    }

    const metadataResponse = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(record.fileId)}`);
    if (!metadataResponse.ok) throw new Error(`Legacy image ${mediaId}: Telegram file lookup returned ${metadataResponse.status}.`);
    const metadataPayload: any = await metadataResponse.json();
    const filePath = metadataPayload?.ok === true ? metadataPayload?.result?.file_path : undefined;
    if (typeof filePath !== 'string' || filePath.length > 300 || filePath.split('/').some((part: string) => !/^[a-zA-Z0-9_.-]+$/.test(part) || part === '..')) {
      failures.push(`${mediaId}: invalid remote file path`);
      return null;
    }

    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const imageResponse = await fetch(`https://api.telegram.org/file/bot${token}/${encodedPath}`);
    if (!imageResponse.ok) throw new Error(`Legacy image ${mediaId}: Telegram file download returned ${imageResponse.status}.`);
    const declaredLength = Number(imageResponse.headers.get('content-length') || 0);
    if (declaredLength > MAX_SOURCE_BYTES) {
      failures.push(`${mediaId}: source file exceeds 32 MB`);
      return null;
    }
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) {
      failures.push(`${mediaId}: empty or oversized source file`);
      return null;
    }
    const detected = detectMime(bytes);
    if (!detected) {
      failures.push(`${mediaId}: unsupported image format`);
      return null;
    }

    try {
      const image = sharp(bytes, { failOn: 'error', limitInputPixels: 40_000_000, animated: false });
      const details = await image.metadata();
      const format = detected === 'image/jpeg' ? 'jpeg' : detected.slice('image/'.length);
      if (details.format !== format || !details.width || !details.height || details.width * details.height > 40_000_000) {
        failures.push(`${mediaId}: damaged image or unsupported dimensions`);
        return null;
      }
      const clean = await sharp(bytes, { failOn: 'error', limitInputPixels: 40_000_000, animated: false })
        .rotate()
        .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
        .toBuffer();
      if (clean.length > MAX_STORED_BYTES) {
        failures.push(`${mediaId}: normalized image exceeds 8 MB`);
        return null;
      }
      const filename = `${randomUUID()}${IMAGE_MIME_EXTENSIONS[detected]}`;
      const fullPath = path.join(mediaRoot, filename);
      await writeFile(fullPath, clean, { flag: 'wx' });
      const result = { url: `/api/media/${filename}`, filePath: fullPath };
      downloaded.set(mediaId, result);
      return result;
    } catch (error) {
      failures.push(`${mediaId}: ${error instanceof Error ? error.message : 'image processing failed'}`);
      return null;
    }
  }

  try {
    for await (const product of products.find({ images: { $exists: true, $ne: [] } })) {
      const images = Array.isArray(product.images) ? product.images : [];
      const nextImages: any[] = [];
      const createdFiles: string[] = [];
      let changed = false;
      for (const image of images) {
        const currentUrl = typeof image === 'string' ? image : image?.url;
        if (typeof currentUrl === 'string' && LOCAL_IMAGE_URL.test(currentUrl)) {
          nextImages.push(image);
          continue;
        }
        const id = legacyMediaId(image);
        if (!id) {
          nextImages.push(image);
          continue;
        }
        const imported = await importMedia(id);
        if (!imported) {
          nextImages.push(image);
          continue;
        }
        if (!downloaded.has(`written:${id}`)) {
          createdFiles.push(imported.filePath);
          downloaded.set(`written:${id}`, imported);
        }
        const migrated = typeof image === 'object' && image !== null ? { ...image, legacyMediaId: id, url: imported.url } : { index: nextImages.length, legacyMediaId: id, url: imported.url };
        nextImages.push(migrated);
        changed = true;
      }
      if (changed) {
        try {
          await products.updateOne({ _id: product._id }, { $set: { images: nextImages, updatedAt: new Date() } });
          migratedImages += nextImages.filter((image) => image?.legacyMediaId).length;
        } catch (error) {
          for (const filename of createdFiles) await unlink(filename).catch(() => undefined);
          throw error;
        }
      }
    }

    for await (const branch of branches.find({ imageMediaId: { $exists: true, $ne: '' } })) {
      if (typeof branch.imageUrl === 'string' && LOCAL_IMAGE_URL.test(branch.imageUrl)) continue;
      const id = String(branch.imageMediaId || '');
      if (!/^[a-f\d]{24}$/i.test(id)) continue;
      const imported = await importMedia(id);
      if (imported) await branches.updateOne({ _id: branch._id }, { $set: { imageUrl: imported.url, updatedAt: new Date() } });
    }

    console.log(`Legacy media migration complete: ${migratedImages} product image reference(s) now use local storage.`);
    console.log('Original Telegram media records and product metadata were retained.');
    if (failures.length) {
      console.error(`${failures.length} image(s) need manual review or re-upload:`);
      failures.forEach((failure) => console.error(`- ${failure}`));
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Legacy media migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
