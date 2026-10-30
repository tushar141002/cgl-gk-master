const MAX_DIMENSION = 1100;
const MAX_DATA_URL_LENGTH = 900_000;

export async function imageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("NOT_AN_IMAGE");
  }
  const original = await readAsDataUrl(file);
  if (original.length > MAX_DATA_URL_LENGTH * 2) {
    throw new Error("IMAGE_TOO_LARGE");
  }

  const image = await loadImage(original);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
  if (scale === 1 && original.length <= MAX_DATA_URL_LENGTH) {
    return original;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return original;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const compressed = canvas.toDataURL("image/jpeg", 0.72);
  if (compressed.length > MAX_DATA_URL_LENGTH) {
    throw new Error("IMAGE_TOO_LARGE");
  }
  return compressed;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("READ_FAILED"));
    image.src = src;
  });
}
