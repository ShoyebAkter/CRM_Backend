const mongoose = require("mongoose");

const phoneCall = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  recipient: { type: String },
  callDuration: { type: String },
  callNotes: { type: String },
  phoneNumber: { type: String },
  property: [{
      type: mongoose.Schema.ObjectId,
      ref: "Properties"
  }],
  startDate: { type: String, default: Date.now },
  createByLead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Lead",
  },
  createByContact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contact",
  },
  createBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  salesAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  // Call recording + transcript
  recordingFile: { type: String },
  recordingName: { type: String },
  transcript: { type: String },
  transcriptStatus: {
    type: String,
    enum: ["none", "processing", "done", "failed"],
    default: "none",
  },
  transcriptError: { type: String },
  transcriptLanguage: { type: String },
  transcriptUpdatedAt: { type: Date },
  // Optional: the contact shown in the "Sender Name" column
  senderContact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contact",
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  deleted: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model("Calls", phoneCall, "Calls");
