const express = require('express');
const db = require('./db/config')
const route = require('./controllers/route');
const bodyParser = require('body-parser');
const cors = require('cors');


require('dotenv').config()
const port = process.env.PORT || 5001

const fs = require('fs');
const path = require('path');

//Setup Express App
const app = express();
// Set up CORS
// CORS_ORIGINS in .env = comma-separated list of website addresses allowed to call this API,
// for example: https://naharbuilders.vercel.app,http://localhost:3000
// If CORS_ORIGINS is empty, every website is allowed (the old behaviour).
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
app.use(cors({
    origin: (origin, callback) => {
        // no Origin header = not a browser page (Postman, server to server): allow
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Origin not allowed by CORS: ' + origin));
    },
}))
// Body parser comes AFTER cors on purpose: if it comes first, an error such as
// "request too large" is sent without CORS headers and the browser shows a CORS error.
// BODY_LIMIT sets the largest request accepted (Excel/CSV imports send all rows at once).
app.use(bodyParser.json({ limit: process.env.BODY_LIMIT || '25mb' }));
//API Routes
app.use('/api', route);


app.get('/', async (req, res) => {
    res.send('Welcome to my world...')
});

// Get port from environment and store in Express.

const server = app.listen(port, () => {
    const protocol = (process.env.HTTPS === true || process.env.NODE_ENV === 'production') ? 'https' : 'http';
    const { address, port } = server.address();
    const host = address === '::' ? '127.0.0.1' : address;
    console.log(`Server listening at ${protocol}://${host}:${port}/`);
});


// Connect to MongoDB
const DATABASE_URL = process.env.DB_URL || 'mongodb://127.0.0.1:27017'
const DATABASE = process.env.DB || 'Prolink'

db(DATABASE_URL, DATABASE);
