const User = require("../model/schema/user");

// Decides which records a list request may see (Leads, Contacts, Properties, calendar meetings/tasks).
//   - The admin (account type superAdmin) sees everything.
//   - Every other user sees only the records they created. This is enforced here on the server,
//     so it does not depend on what the browser asks for.
//   - Set SHARED_RECORDS=true in server/.env to let all users see all records instead.
const applyRecordScope = async (req) => {
  const query = { ...req.query };

  if (process.env.SHARED_RECORDS === "true") {
    delete query.createBy;
    return query;
  }

  const user = await User.findById(req.user.userId);
  if (user && user.role === "superAdmin") {
    return query;
  }

  query.createBy = req.user.userId;
  return query;
};

module.exports = applyRecordScope;
