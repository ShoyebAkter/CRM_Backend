const express = require('express');
const auth = require('../../middelwares/auth');
const phoneCall = require('./phonCall')
const transcript = require('./transcript')

const router = express.Router();

router.get('/', auth, phoneCall.index)
router.get('/view/:id', auth, phoneCall.view)
router.post('/add', auth, phoneCall.add)

// Call recording + transcript
router.post('/:id/recording', auth, transcript.loadCall, transcript.uploadMiddleware, transcript.uploadRecording)
router.post('/:id/transcribe', auth, transcript.loadCall, transcript.retryTranscription)
router.get('/:id/recording', auth, transcript.loadCall, transcript.getRecording)
router.put('/:id/transcript', auth, transcript.loadCall, transcript.saveTranscript)

module.exports = router
