// All resizing happens on the visitor's device; original files and EXIF are never uploaded.
export async function thumbnail(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error(
      "JPG, PNG, WebP 사진만 지원해요. SVG·GIF·HEIC는 JPG로 바꿔 주세요.",
    );
  if (file.size > 10 * 1024 * 1024)
    throw Error("원본 한 장은 10MB 이하로 골라 주세요.");
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height || image.width * image.height > 40000000)
      throw Error(
        "사진 해상도가 너무 높습니다. 4천만 화소 이하로 줄여 주세요.",
      );
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d");
    for (const side of [256, 224, 192, 160, 128, 96]) {
      const scale = Math.min(1, side / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      ctx.fillStyle = "#edf0e7";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.65, 0.48, 0.32]) {
        const src = canvas.toDataURL("image/jpeg", quality);
        if (src.length <= 10947) return src;
      }
    }
    throw Error(
      "이 사진은 충분히 압축하지 못했어요. 다른 사진을 선택해 주세요.",
    );
  } finally {
    image.close();
  }
}
let database;
async function db() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const r = indexedDB.open("theme-sa-party-drafts", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("drafts");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return database;
}
export async function localDraft(key, value) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(
        "drafts",
        value === undefined ? "readonly" : "readwrite",
      ),
      s = tx.objectStore("drafts");
    const r =
      value === undefined
        ? s.get(key)
        : value === null
          ? s.delete(key)
          : s.put(structuredClone(value), key);
    tx.oncomplete = () => resolve(r.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function clearDrafts() {
  const d = await db();
  await new Promise((resolve, reject) => {
    const tx = d.transaction("drafts", "readwrite");
    tx.objectStore("drafts").clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
