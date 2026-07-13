export const DEFAULT_IMAGE_FORMAT_ID = "landscape";

export const IMAGE_FORMATS = Object.freeze([
  Object.freeze({
    id: "landscape",
    label: "Горизонтальная",
    ratio: "16:9",
    cssRatio: "16 / 9",
    openaiSize: "1536x864",
    geminiAspectRatio: "16:9",
  }),
  Object.freeze({
    id: "square",
    label: "Квадрат",
    ratio: "1:1",
    cssRatio: "1 / 1",
    openaiSize: "1024x1024",
    geminiAspectRatio: "1:1",
  }),
  Object.freeze({
    id: "portrait",
    label: "Вертикальная",
    ratio: "9:16",
    cssRatio: "9 / 16",
    openaiSize: "864x1536",
    geminiAspectRatio: "9:16",
  }),
]);

export function findImageFormat(formatId) {
  return IMAGE_FORMATS.find((format) => format.id === formatId) ?? null;
}
