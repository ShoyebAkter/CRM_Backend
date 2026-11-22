const mongoose = require("mongoose");
const CustomField = require("../../model/schema/customField");
const applyRecordScope = require("../../utils/applyRecordScope");

// The Add/Edit forms send "" for dropdown fields that were left empty.
// "" cannot be saved into an ObjectId field (e.g. assignUser, associatedListing),
// so find those fields and leave them out (add) or clear them (edit).
const emptyObjectIdFields = (Model, body) =>
    Object.keys(body || {}).filter((key) => {
        const schemaPath = Model.schema.path(key);
        return body[key] === "" && schemaPath && schemaPath.instance === "ObjectId";
    });

const index = async (req, res) => {
    try {
        if (!req?.query?.moduleId) {
            return res.status(400).send({ success: false, message: "moduleId is required" });
        }

        const customFieldName = await CustomField.findById(req.query?.moduleId).select("moduleName");

        if (!customFieldName) {
            return res.status(404).send({ success: false, message: "Module not found" });
        }

        const collectionName = customFieldName.moduleName;
        const collectionExists = await mongoose.connection.db.listCollections({ name: collectionName }).hasNext();

        if (!collectionExists) {
            return res.status(404).send({ success: false, message: "Collection does not exist" });
        }

        const ExistingModel = mongoose.model(collectionName);

        if (!ExistingModel) {
            return res.status(500).send({ success: false, message: 'Model not found' });
        }

        // Admin sees everything; other users only the records they created (see utils/applyRecordScope.js)
        const scope = await applyRecordScope(req);
        const filter = { deleted: false };
        if (scope.createBy) filter.createBy = scope.createBy;
        const allData = await ExistingModel.find(filter);

        return res.status(200).json({ data: allData });

    } catch (err) {
        console.error(`Failed to display Record`, err);
        return res.status(400).json({ success: false, message: `no data found`, error: err.toString() });
    }
};

const view = async (req, res) => {
    try {
        if (!req?.query?.moduleId) {
            return res.status(400).send({ success: false, message: "moduleId is required" });
        }

        const customField = await CustomField.findById(req.query?.moduleId).select("moduleName");

        if (!customField) {
            return res.status(404).send({ success: false, message: "Module not found" });
        }

        const collectionName = customField.moduleName;
        const collectionExists = await mongoose.connection.db.listCollections({ name: collectionName }).hasNext();

        if (!collectionExists) {
            return res.status(404).send({ success: false, message: "Collection does not exist" });
        }

        const ExistingModel = mongoose.model(collectionName);

        if (!ExistingModel) {
            return res.status(500).send({ success: false, message: 'Model not found' });
        }

        let allData = await ExistingModel.findOne({ _id: req.params.id });

        const scope = await applyRecordScope(req);
        if (allData && scope.createBy && String(allData.createBy) !== String(scope.createBy)) {
            return res.status(403).json({ success: false, message: "You do not have access to this record." });
        }

        return res.status(200).json({ data: allData });

    } catch (err) {
        console.error(`Failed to display Record`, err);
        return res.status(400).json({ success: false, message: `no data found`, error: err.toString() });
    }
};

const add = async (req, res) => {
    try {
        if (!req?.body?.moduleId) {
            return res.status(400).send({ success: false, message: "moduleId is required" });
        }

        const customField = await CustomField.findById(req.body?.moduleId).select("moduleName");

        if (!customField) {
            return res.status(404).send({ success: false, message: "Module not found" });
        }

        const collectionName = customField.moduleName;
        const collectionExists = await mongoose.connection.db.listCollections({ name: collectionName }).hasNext();

        if (!collectionExists) {
            return res.status(404).send({ success: false, message: "Collection does not exist" });
        }

        const ExistingModel = mongoose.model(collectionName);

        if (!ExistingModel) {
            return res.status(500).send({ success: false, message: 'Model not found' });
        }
        emptyObjectIdFields(ExistingModel, req.body).forEach((key) => delete req.body[key]);
        req.body.createBy = req.user.userId;
        req.body.updatedDate = new Date();
        req.body.deleted = false;

        const newDocument = new ExistingModel(req.body);
        newDocument.createdDate = new Date();

        await newDocument.save();

        return res.status(200).json({ message: 'Record added successfully', data: newDocument });

    } catch (err) {
        console.error(`Failed to create Record`, err);
        return res.status(400).json({ success: false, message: `Failed to Add Record`, error: err.toString() });
    }
};

const deleteField = async (req, res) => {
    try {
        if (!req.query?.moduleId) {
            return res.status(400).send({ success: false, message: "moduleId is required" })
        }

        const customField = await CustomField.findOne({ _id: req.query?.moduleId }).select("moduleName");

        if (!customField) {
            return res.status(404).send({ success: false, message: "Module not found" });
        }

        const collectionExists = await mongoose.connection.db.listCollections({ name: (`${customField?.moduleName}`) }).hasNext();


        if (!collectionExists) {
            return res.status(404).send({ success: false, message: "Collection not exists" })
        }

        const ExistingModel = mongoose.model(`${customField?.moduleName}`);

        if (typeof ExistingModel !== 'function') {
            return res.status(500).send({ success: false, message: 'Invalid model' });
        }

        const result = await ExistingModel.findByIdAndUpdate(req.params.id, { deleted: true });

        return res.status(200).json({ message: 'Record deleted successfully', data: result });

    } catch (err) {
        console.error(`Failed to delete Record`, err);
        return res.status(400).json({ success: false, message: `Failed to delete Record`, error: err.toString() });
    }
};

const deleteManyField = async (req, res) => {
    try {
        if (!req.body?.moduleId) {
            return res.status(400).send({ success: false, message: "moduleId is required" })
        }

        const customField = await CustomField.findOne({ _id: req.body?.moduleId }).select("moduleName");

        if (!customField) {
            return res.status(404).send({ success: false, message: "Module not found" });
        }

        const collectionExists = await mongoose.connection.db.listCollections({ name: (`${customField?.moduleName}`) }).hasNext();


        if (!collectionExists) {
            return res.status(404).send({ success: false, message: "Collection not exists" })
        }

        const ExistingModel = mongoose.model(`${customField?.moduleName}`);

        if (typeof ExistingModel !== 'function') {
            return res.status(500).send({ success: false, message: 'Invalid model' });
        }

        const result = await ExistingModel.updateMany({ _id: { $in: req.body.ids } }, { $set: { deleted: true } });

        return res.status(200).json({ message: 'Record deleted successfully', data: result });

    } catch (err) {
        console.error(`Failed to delete Record`, err);
        return res.status(400).json({ success: false, message: `Failed to delete Record`, error: err.toString() });
    }
};

const edit = async (req, res) => {
    try {
        if (!req?.body?.moduleId) {
            return res.status(400).send({ success: false, message: "moduleId is required" });
        }

        const customField = await CustomField.findOne({ _id: req.body?.moduleId }).select("moduleName");

        if (!customField) {
            return res.status(404).send({ success: false, message: "Module not found" });
        }

        const collectionName = customField?.moduleName;

        const collectionExists = await mongoose.connection.db.listCollections({ name: collectionName }).hasNext();

        if (!collectionExists) {
            return res.status(404).send({ success: false, message: `Collection '${collectionName}' not exists` });
        }

        const ExistingModel = mongoose.model(collectionName);

        if (typeof ExistingModel !== 'function') {
            return res.status(500).send({ success: false, message: 'Invalid model' });
        }

        // Editing a record must never change who created it (the edit form sends the editor's id)
        delete req.body.createBy;
        const emptyKeys = emptyObjectIdFields(ExistingModel, req.body);
        const update = { $set: { ...req.body } };
        if (emptyKeys.length) {
            emptyKeys.forEach((key) => delete update.$set[key]);
            update.$unset = Object.fromEntries(emptyKeys.map((key) => [key, ""]));
        }

        const result = await ExistingModel.findOneAndUpdate(
            { _id: req.params.id },
            update,
            { new: true }
        );

        if (result) {
            return res.status(200).json({ success: true, message: 'Record updated successfully', data: result });
        } else {
            return res.status(404).json({ success: false, message: 'Record not found for the given id' });
        }
    } catch (err) {
        console.error(`Failed to Update Record`, err);
        return res.status(400).json({ success: false, message: `Failed to Update Record`, error: err.toString() });
    }
};

module.exports = { index, view, add, edit, deleteField, deleteManyField };