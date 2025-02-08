const suppressedKeywords = [
  "lit-js-sdk:constants:errors",
  "lit-js-sdk:constants:constants",
  "deprecated",
  "Storage key",
  "Unable to store walletSig",
  "using deprecated parameters for `initSync()`",
];

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function shouldSuppressLog(message: any) {
  if (typeof message !== "string") return false;
  return suppressedKeywords.some((keyword) => message.includes(keyword));
}

console.log = (...args) => {
  if (!shouldSuppressLog(args[0])) {
    originalLog(...args);
  }
};

console.warn = (...args) => {
  if (!shouldSuppressLog(args[0])) {
    originalWarn(...args);
  }
};

console.error = (...args) => {
  if (!shouldSuppressLog(args[0])) {
    originalError(...args);
  }
};
