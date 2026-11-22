// Emergency use only: sets a new password for the admin account directly in the database.
// Run from the server folder:   node scripts/reset-admin-password.js NewPassword123
// It uses DB_URL and DB from server/.env (the same database as the server).
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const newPassword = process.argv[2];
if (!newPassword || newPassword.length < 8) {
  console.log("Usage: node scripts/reset-admin-password.js <new password, at least 8 characters>");
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(process.env.DB_URL || "mongodb://127.0.0.1:27017", {
      dbName: process.env.DB || "Prolink",
    });
    const users = mongoose.connection.collection("User");
    const admin = await users.findOne({ role: "superAdmin" });
    if (!admin) {
      console.log("No admin account found in this database.");
      process.exit(1);
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await users.updateOne({ _id: admin._id }, { $set: { password: hash, deleted: false } });
    console.log(`Password changed for admin: ${admin.username}`);
    process.exit(0);
  } catch (err) {
    console.log("Failed:", err.message);
    process.exit(1);
  }
})();
