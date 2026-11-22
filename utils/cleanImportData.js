// The import screens send "" for every CRM field that was not mapped.
// Empty strings cannot be saved into ObjectId / Date fields, so drop empty values.
const cleanImportData = (rows) =>
  (Array.isArray(rows) ? rows : []).map((item) =>
    Object.fromEntries(
      Object.entries(item || {}).filter(
        ([, value]) => value !== "" && value !== null && value !== undefined
      )
    )
  );

module.exports = cleanImportData;
