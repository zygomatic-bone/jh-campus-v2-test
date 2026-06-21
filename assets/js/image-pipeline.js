/* ============================================================
   JH+ IMAGE PIPELINE — client-side compression/resize
   ------------------------------------------------------------
   Runs entirely in the browser before upload. This is real
   compression (canvas re-encode), not a placeholder:
     - Resizes anything wider/taller than MAX_DIMENSION
     - Re-encodes as WebP when the browser supports it,
       falling back to JPEG otherwise
     - Targets a quality level that keeps files under the
       recommended size, backing off quality if still too big

   LIMITATION (be upfront about this): true server-side thumbnail
   generation (multiple sizes stored per image) needs a backend —
   e.g. a Supabase Edge Function triggered on upload. This file
   only does pre-upload client-side compression, which covers the
   "don't let people upload 20MB photos" problem but does not
   generate separate thumbnail files server-side.
   ============================================================ */

const JH_IMAGE_LIMITS = {
  maxUploadBytes: 5 * 1024 * 1024,      // hard cap: 5MB (reject above this even after compression)
  recommendedBytes: 2 * 1024 * 1024,    // try to compress down to this
  maxDimension: 1920,                   // longest side, px
};

/**
 * Compresses/resizes an image File in the browser.
 * Returns a new File (WebP if supported, else JPEG), or throws
 * if the result still exceeds the hard size cap.
 */
async function jhCompressImage(file) {
  if (!file.type.startsWith("image/")) return file; // not an image, pass through (PDFs etc.)

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  const scale = Math.min(1, JH_IMAGE_LIMITS.maxDimension / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const supportsWebp = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  const outputType = supportsWebp ? "image/webp" : "image/jpeg";
  const ext = supportsWebp ? "webp" : "jpg";

  let quality = 0.85;
  let blob = await canvasToBlob(canvas, outputType, quality);

  // Back off quality if still above the recommended size, down to a floor of 0.5.
  while (blob.size > JH_IMAGE_LIMITS.recommendedBytes && quality > 0.5) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, outputType, quality);
  }

  if (blob.size > JH_IMAGE_LIMITS.maxUploadBytes) {
    throw new Error(
      `Image is still ${(blob.size / 1024 / 1024).toFixed(1)}MB after compression — please choose a smaller image (max 5MB).`
    );
  }

  const newName = file.name.replace(/\.[^.]+$/, "") + "." + ext;
  return new File([blob], newName, { type: outputType });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Full upload helper: compresses (if image), uploads to the given
 * Supabase Storage bucket/path, records it in media_library, and
 * returns { url, sizeBytes, mediaType }.
 */
async function jhUploadMedia(file, bucket, pathPrefix, uploaderId) {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";

  if (!isImage && !isPdf) {
    throw new Error("Only image and PDF files are supported here.");
  }

  if (file.size > JH_IMAGE_LIMITS.maxUploadBytes) {
    throw new Error("File exceeds the 5MB upload limit.");
  }

  const finalFile = isImage ? await jhCompressImage(file) : file;
  const path = `${pathPrefix}/${Date.now()}-${finalFile.name}`;

  const { error: uploadError } = await sb.storage.from(bucket).upload(path, finalFile, {
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data: urlData } = sb.storage.from(bucket).getPublicUrl(path);
  const url = urlData.publicUrl;

  await sb.from("media_library").insert({
    file_name: finalFile.name,
    file_url: url,
    media_type: isImage ? "image" : "pdf",
    size_bytes: finalFile.size,
    uploaded_by: uploaderId,
  });

  return { url, sizeBytes: finalFile.size, mediaType: isImage ? "image" : "pdf" };
}
