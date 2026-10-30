import { readFileSync, writeFileSync } from "node:fs";

const file = "src/data/seed/polity.json";
const lines = readFileSync(file, "utf8").split(/\r?\n/);
const row = [
  "Article 21 guarantees:",
  ["Right to life and personal liberty", "Right to equality", "Right against exploitation", "Right to property"],
  0,
  "Article 21 protects life and personal liberty. Courts have read privacy, health and education into it.",
  2,
  "Y",
  {
    year: 2023,
    date: "13 Sept",
    shift: "Shift 1",
    hq: "अनुच्छेद 21 किस अधिकार की गारंटी देता है?",
    ho: [
      "जीवन एवं व्यक्तिगत स्वतंत्रता का अधिकार",
      "समानता का अधिकार",
      "शोषण के विरुद्ध अधिकार",
      "संपत्ति का अधिकार",
    ],
    he: "अनुच्छेद 21 जीवन और व्यक्तिगत स्वतंत्रता की रक्षा करता है। न्यायालयों ने इसमें निजता, स्वास्थ्य और शिक्षा को भी शामिल किया है।",
  },
];
lines[7] = `      ${JSON.stringify(row)},`;
writeFileSync(file, lines.join("\n"), "utf8");
console.log("fixed", lines[7].slice(0, 80));
