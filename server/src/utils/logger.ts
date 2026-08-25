import fs from "node:fs";
import path from "node:path";

let logDir = "./logs";

export function configureLogger(dir: string): void {
  logDir = dir;
  fs.mkdirSync(logDir, { recursive: true });
}

function write(file: string, line: string): void {
  const stamped = `[${new Date().toISOString()}] ${line}\n`;
  try {
    fs.appendFileSync(path.join(logDir, file), stamped);
  } catch {
    // Logging must never crash the app.
  }
}

export const logger = {
  info: (msg: string) => write("app.log", `INFO  ${msg}`),
  warn: (msg: string) => write("app.log", `WARN  ${msg}`),
  download: (msg: string) => write("downloads.log", msg),
  error: (msg: string) => {
    write("errors.log", `ERROR ${msg}`);
    write("app.log", `ERROR ${msg}`);
  },
};
