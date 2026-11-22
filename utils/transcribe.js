// Turns a call recording into text.
// Choose the engine with TRANSCRIBE_PROVIDER in server/.env:
//   local  - Whisper running on this computer (free, recordings never leave it). Needs Python + faster-whisper.
//   openai - OpenAI speech-to-text API (needs OPENAI_API_KEY; recordings are sent to OpenAI).
//   mock   - returns fixed text, for testing only.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const provider = () => (process.env.TRANSCRIBE_PROVIDER || "local").toLowerCase();

const transcribeMock = async (filePath) => {
  await new Promise((r) => setTimeout(r, 300));
  return { text: `[00:00] (mock transcript of ${path.basename(filePath)})`, language: "en" };
};

const transcribeOpenAI = async (filePath, language) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set in server/.env");

  const size = fs.statSync(filePath).size;
  if (size > 25 * 1024 * 1024) {
    throw new Error("Recording is larger than 25 MB, which the OpenAI service does not accept. Compress it or use TRANSCRIBE_PROVIDER=local.");
  }

  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1");
  form.append("response_format", "text");
  if (language) form.append("language", language);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15 * 60 * 1000);
  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: controller.signal,
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${body.slice(0, 300)}`);
    return { text: body.trim(), language: language || "" };
  } finally {
    clearTimeout(timer);
  }
};

const transcribeLocal = (filePath, language) =>
  new Promise((resolve, reject) => {
    const python = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
    const script = path.join(__dirname, "..", "scripts", "transcribe_local.py");
    const model = process.env.WHISPER_MODEL || "small";
    const child = spawn(python, [script, filePath, language || "", model], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString("utf8")));
    child.stderr.on("data", (d) => (err += d.toString("utf8")));

    const timeoutMin = Number(process.env.TRANSCRIBE_TIMEOUT_MIN) || 120;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Transcription took longer than ${timeoutMin} minutes and was stopped.`));
    }, timeoutMin * 60 * 1000);

    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Could not start Python ("${python}"). Install Python and set PYTHON_BIN in server/.env if needed. (${e.message})`));
    });

    child.on("close", () => {
      clearTimeout(timer);
      const lastLine = out.trim().split(/\r?\n/).filter(Boolean).pop();
      try {
        const parsed = JSON.parse(lastLine);
        if (parsed.error) return reject(new Error(parsed.error));
        return resolve({ text: parsed.text || "", language: parsed.language || "" });
      } catch (e) {
        return reject(new Error(`Transcription failed. ${err.trim().split(/\r?\n/).slice(-3).join(" ").slice(0, 300)}`));
      }
    });
  });

const transcribe = async (filePath, language) => {
  const p = provider();
  if (p === "mock") return transcribeMock(filePath);
  if (p === "openai") return transcribeOpenAI(filePath, language);
  if (p === "local") return transcribeLocal(filePath, language);
  throw new Error(`Unknown TRANSCRIBE_PROVIDER "${p}". Use local or openai.`);
};

module.exports = { transcribe };
