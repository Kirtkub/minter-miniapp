export async function saveImageFromUrl(src: string, filename: string): Promise<void> {
  const response = await fetch(src, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Image download failed");
  }
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not available");
  }
  ctx.drawImage(bitmap, 0, 0);

  const outBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (file) => (file ? resolve(file) : reject(new Error("Could not encode image"))),
      "image/jpeg",
      0.95,
    );
  });

  const file = new File([outBlob], filename, { type: "image/jpeg" });
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };

  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: filename });
    return;
  }

  const objectUrl = URL.createObjectURL(outBlob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
