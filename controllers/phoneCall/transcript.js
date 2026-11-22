const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const multer = require("multer");
const PhoneCall = require("../../model/schema/phoneCall");
const User = require("../../model/schema/user");
const { transcribe } = require("../../utils/transcribe");

const RECORDINGS_DIR = path.join(__dirname, "..", "..", "uploads", "recordings");
fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

const ALLOWED_EXT = [".mp3", ".m4a", ".wav", ".ogg", ".oga", ".opus", ".aac", ".amr", ".3gp", ".webm", ".mp4", ".flac", ".wma"];
const LANGUAGES = ["", "bn", "en", "hi", "ur"];

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, RECORDINGS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${req.params.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: (Number(process.env.MAX_RECORDING_MB) || 200) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXT.includes(ext)) return cb(null, true);
    cb(new Error(`Unsupported file type "${ext}". Use one of: ${ALLOWED_EXT.join(", ")}`));
  },
}).single("recording");

const recordingPath = (call) =>
  call?.recordingFile ? path.join(RECORDINGS_DIR, path.basename(call.recordingFile)) : null;

// Finds the call and checks that this user may use it (admin, or the call's sender / sales agent).
const loadCall = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid call id." });
    }
    const call = await PhoneCall.findOne({ _id: id, deleted: false });
    if (!call) return res.status(404).json({ message: "Call not found." });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(401).json({ message: "User not found." });

    if (user.role !== "superAdmin") {
      const me = String(req.user.userId);
      const allowed = [call.sender, call.salesAgent].filter(Boolean).map(String).includes(me);
      if (!allowed) return res.status(403).json({ message: "You do not have access to this call." });
    }
    req.call = call;
    next();
  } catch (err) {
    console.error("Failed loading call:", err);
    res.status(500).json({ message: "Failed loading call." });
  }
};

const uploadMiddleware = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `Recording is too large (limit ${Number(process.env.MAX_RECORDING_MB) || 200} MB).`
          : err.message;
      return res.status(400).json({ message });
    }
    next();
  });
};

const runTranscription = async (callId, filePath, language) => {
  try {
    const { text, language: detected } = await transcribe(filePath, language);
    await PhoneCall.findByIdAndUpdate(callId, {
      $set: {
        transcript: text,
        transcriptStatus: "done",
        transcriptError: "",
        transcriptLanguage: detected || language || "",
        transcriptUpdatedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("Transcription failed:", err.message);
    await PhoneCall.findByIdAndUpdate(callId, {
      $set: { transcriptStatus: "failed", transcriptError: String(err.message).slice(0, 500) },
    });
  }
};

const cleanLanguage = (value) => {
  const language = String(value || "").trim().toLowerCase();
  return LANGUAGES.includes(language) ? language : "";
};

// POST /api/phoneCall/:id/recording   (multipart: recording, language)
const uploadRecording = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Choose a recording file first." });

    const call = req.call;
    const oldFile = recordingPath(call);
    if (oldFile && oldFile !== req.file.path && fs.existsSync(oldFile)) {
      fs.unlink(oldFile, () => {});
    }

    await PhoneCall.findByIdAndUpdate(call._id, {
      $set: {
        recordingFile: req.file.filename,
        recordingName: req.file.originalname,
        transcript: "",
        transcriptStatus: "processing",
        transcriptError: "",
      },
    });

    // Transcribe in the background so long recordings do not time out the request.
    runTranscription(call._id, req.file.path, cleanLanguage(req.body?.language));
    res.status(202).json({ message: "Recording uploaded. Transcribing...", status: "processing" });
  } catch (err) {
    console.error("Failed to upload recording:", err);
    res.status(500).json({ message: "Failed to upload recording." });
  }
};

// POST /api/phoneCall/:id/transcribe   (retry on the recording already saved)
const retryTranscription = async (req, res) => {
  try {
    const file = recordingPath(req.call);
    if (!file || !fs.existsSync(file)) {
      return res.status(400).json({ message: "This call has no recording. Upload one first." });
    }
    await PhoneCall.findByIdAndUpdate(req.call._id, {
      $set: { transcriptStatus: "processing", transcriptError: "" },
    });
    runTranscription(req.call._id, file, cleanLanguage(req.body?.language));
    res.status(202).json({ message: "Transcribing...", status: "processing" });
  } catch (err) {
    console.error("Failed to retry transcription:", err);
    res.status(500).json({ message: "Failed to start transcription." });
  }
};

// GET /api/phoneCall/:id/recording
const getRecording = async (req, res) => {
  const file = recordingPath(req.call);
  if (!file || !fs.existsSync(file)) return res.status(404).json({ message: "No recording for this call." });
  res.sendFile(file);
};

// PUT /api/phoneCall/:id/transcript   { transcript }   (type or correct the text by hand)
const saveTranscript = async (req, res) => {
  try {
    const transcript = String(req.body?.transcript ?? "");
    if (transcript.length > 500000) return res.status(400).json({ message: "Transcript is too long." });
    await PhoneCall.findByIdAndUpdate(req.call._id, {
      $set: {
        transcript,
        transcriptStatus: transcript.trim() ? "done" : "none",
        transcriptError: "",
        transcriptUpdatedAt: new Date(),
      },
    });
    res.status(200).json({ message: "Transcript saved." });
  } catch (err) {
    console.error("Failed to save transcript:", err);
    res.status(500).json({ message: "Failed to save transcript." });
  }
};

module.exports = { loadCall, uploadMiddleware, uploadRecording, retryTranscription, getRecording, saveTranscript };
