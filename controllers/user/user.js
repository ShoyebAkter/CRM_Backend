const User = require("../../model/schema/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Admin register
const adminRegister = async (req, res) => {
  try {
    const { username, password, firstName, lastName, phoneNumber } = req.body;
    const user = await User.findOne({ username: username });
    if (user) {
      return res
        .status(400)
        .json({ message: "Admin already exist please try another email" });
    } else {
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
      // Create a new user
      const user = new User({
        username,
        password: hashedPassword,
        firstName,
        lastName,
        phoneNumber,
        role: "superAdmin",
      });
      // Save the user to the database
      await user.save();
      res.status(200).json({ message: "Admin created successfully" });
    }
  } catch (error) {
    res.status(500).json({ error: error });
  }
};

// User Registration
const register = async (req, res) => {
  try {
    const { username, password, firstName, lastName, phoneNumber, roles } =
      req.body;
    const user = await User.findOne({ username: username });

    if (user) {
      return res
        .status(401)
        .json({ message: "user already exist please try another email" });
    } else {
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
      // Create a new user
      const user = new User({
        username,
        password: hashedPassword,
        roles,
        firstName,
        lastName,
        phoneNumber,
        createdDate: new Date(),
      });
      // Save the user to the database
      await user.save();
      res.status(200).json({ message: "User created successfully" });
    }
  } catch (error) {
    res.status(500).json({ error });
  }
};

const index = async (req, res) => {
  try {
    const query = { ...req.query, deleted: false };

    let user = await User.find(query)
      .populate({
        path: "roles",
      })
      .exec();

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error });
  }
};

const view = async (req, res) => {
  try {
    let user = await User.findOne({ _id: req.params.id }).populate({
      path: "roles",
    });
    if (!user) return res.status(404).json({ message: "no Data Found." });
    res.status(200).json(user);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
};

let deleteData = async (req, res) => {
  try {
    const userId = req.params.id;

    // Assuming you have retrieved the user document using userId
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    if ((process.env.DEFAULT_USERS || "").includes(user.username)) {
      return res
        .status(400)
        .json({ message: `You don't have access to delete ${user.username}` });
    }
    if (user.role !== "superAdmin") {
      // Update the user's 'deleted' field to true
      await User.updateOne({ _id: userId }, { $set: { deleted: true } });
      res.send({ message: "Record deleted Successfully" });
    } else {
      res.status(404).json({ message: "admin can not delete" });
    }
  } catch (error) {
    res.status(500).json({ error });
  }
};

const deleteMany = async (req, res) => {
  try {
    // if(process.env.DEFAULT_USERS.includes(username)){
    //     return res.status(400).json({ message: `You don't have access to change ${username}` })
    // }
    // const updatedUsers = await User.updateMany({ _id: { $in: req.body }, role: { $ne: 'superAdmin' } }, { $set: { deleted: true } });

    const userIds = req.body; // Assuming req.body is an array of user IDs
    const users = await User.find({ _id: { $in: userIds } });

    // Check for default users and filter them out
    const defaultUsers = process.env.DEFAULT_USERS || "";
    const filteredUsers = users.filter(
      (user) => !defaultUsers.includes(user.username)
    );

    // Further filter out superAdmin users
    const nonSuperAdmins = filteredUsers.filter(
      (user) => user.role !== "superAdmin"
    );
    const nonSuperAdminIds = nonSuperAdmins.map((user) => user._id);

    if (nonSuperAdminIds.length === 0) {
      return res
        .status(400)
        .json({ message: "No users to delete or all users are protected." });
    }

    // Update the 'deleted' field to true for the remaining users
    const updatedUsers = await User.updateMany(
      { _id: { $in: nonSuperAdminIds } },
      { $set: { deleted: true } }
    );

    res.status(200).json({ message: "done", updatedUsers });
  } catch (err) {
    res.status(404).json({ message: "error", err });
  }
};

const edit = async (req, res) => {
  try {
    let { username, firstName, lastName, phoneNumber } = req.body;

    const editor = await User.findById(req.user.userId);
    if (!editor) {
      return res.status(401).json({ error: "User not found" });
    }
    const isAdmin = editor.role === "superAdmin";
    // Only the admin may edit other people's profiles
    if (!isAdmin && String(editor._id) !== String(req.params.id)) {
      return res.status(403).json({ error: "You can only edit your own profile" });
    }

    const changes = { firstName, lastName, phoneNumber };

    // Only the admin may change a login email, and it must not be taken by someone else
    if (isAdmin && typeof username === "string" && username.trim()) {
      const newUsername = username.trim();
      const taken = await User.findOne({
        username: newUsername,
        _id: { $ne: req.params.id },
        deleted: false,
      });
      if (taken) {
        return res.status(400).json({ error: "This email is already used by another user" });
      }
      changes.username = newUsername;
    }

    let result = await User.updateOne({ _id: req.params.id }, { $set: changes });

    res.status(200).json(result);
  } catch (err) {
    console.error("Failed to Update User:", err);
    res.status(400).json({ error: "Failed to Update User" });
  }
};

const MIN_PASSWORD_LENGTH = 8;

// PUT /api/user/change-password  { currentPassword, newPassword }  - for the logged-in user
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const matches = await bcrypt.compare(String(currentPassword || ""), user.password);
    if (!matches) return res.status(400).json({ message: "Current password is wrong." });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });
    res.status(200).json({ message: "Password changed." });
  } catch (err) {
    console.error("Failed to change password:", err);
    res.status(500).json({ message: "Failed to change password." });
  }
};

// PUT /api/user/reset-password/:id  { newPassword }  - admin sets a new password for any user
const resetPassword = async (req, res) => {
  try {
    const admin = await User.findById(req.user.userId);
    if (!admin || admin.role !== "superAdmin") {
      return res.status(403).json({ message: "Only the admin can reset passwords." });
    }
    const { newPassword } = req.body;
    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    const target = await User.findOne({ _id: req.params.id, deleted: false });
    if (!target) return res.status(404).json({ message: "User not found" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.updateOne({ _id: target._id }, { $set: { password: hashedPassword } });
    res.status(200).json({ message: "Password reset." });
  } catch (err) {
    console.error("Failed to reset password:", err);
    res.status(500).json({ message: "Failed to reset password." });
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    // Find the user by username
    const user = await User.findOne({ username, deleted: false }).populate({
      path: "roles",
    });
    if (!user) {
      res
        .status(401)
        .json({ error: "Authentication failed, invalid username" });
      return;
    }
    // Compare the provided password with the hashed password stored in the database
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      res
        .status(401)
        .json({ error: "Authentication failed,password does not match" });
      return;
    }
    // Create a JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "secret_key", {
      expiresIn: "1d",
    });

    res
      .status(200)
      .setHeader("Authorization", `Bearer${token}`)
      .json({ token: token, user });
  } catch (error) {
    res.status(500).json({ error: "An error occurred" });
  }
};

const changeRoles = async (req, res) => {
  try {
    const userId = req.params.id;

    let result = await User.updateOne(
      { _id: userId },
      { $set: { roles: req.body } }
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("Failed to Change Role:", error);
    res.status(400).json({ error: "Failed to Change Role" });
  }
};

module.exports = {
  changePassword,
  resetPassword,
  register,
  login,
  adminRegister,
  index,
  deleteMany,
  view,
  deleteData,
  edit,
  changeRoles,
};
