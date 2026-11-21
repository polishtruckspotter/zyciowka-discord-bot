const { spawn } = require("node:child_process");
const path = require("node:path");

let child = null;
let stopping = false;
let restartTimer = null;
let restartAttempt = 0;
let startedAt = 0;

function startBot() {
  if (stopping) return;
  startedAt = Date.now();
  child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    stdio: "inherit",
    env: process.env,
  });
  child.once("error", (error) => {
    console.error("Nie udało się uruchomić procesu bota:", error);
  });
  child.once("close", (code, signal) => {
    child = null;
    if (stopping) {
      process.exitCode = code ?? 0;
      return;
    }
    if (code === 0 && !signal) {
      console.info("Proces bota zakończył się poprawnie.");
      return;
    }
    if (Date.now() - startedAt >= 5 * 60 * 1000) restartAttempt = 0;
    const delay = Math.min(1000 * (2 ** restartAttempt), 30_000);
    restartAttempt += 1;
    console.error(`Proces bota zakończył się (kod ${code ?? "brak"}, sygnał ${signal ?? "brak"}). Ponowne uruchomienie za ${Math.ceil(delay / 1000)} s.`);
    restartTimer = setTimeout(startBot, delay);
  });
}

function stopBot(signal) {
  if (stopping) return;
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  if (child) {
    child.kill(signal);
  } else {
    process.exitCode = 0;
  }
}

process.once("SIGINT", () => stopBot("SIGINT"));
process.once("SIGTERM", () => stopBot("SIGTERM"));
startBot();
