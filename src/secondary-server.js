const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { io: ClientIO } = require('socket.io-client');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Connect to the main monitoring server
const mainServerUrl = process.env.MAIN_SERVER_URL || 'http://localhost:3000';
const mainServerSocket = ClientIO(mainServerUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 45000,
    autoConnect: true
});

// Store shared URLs
const sharedUrls = new Map();

// Middleware to parse JSON bodies
app.use(express.json());

// Middleware to get client information
const clientInfoMiddleware = (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress;
    
    const userAgent = req.headers['user-agent'];
    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();
    const geoLocation = geoip.lookup(ip);

    req.clientInfo = {
        ip,
        timestamp: new Date().toISOString(),
        browser,
        os,
        device,
        geoLocation,
        referrer: req.headers.referer || 'Direct',
        serverId: process.env.SERVER_ID || 'secondary-1'
    };
    next();
};

// Apply middleware to all routes
app.use(clientInfoMiddleware);

// Add security headers middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// Serve static files
app.use(express.static('public'));

// Generate a unique URL
app.post('/api/generate-url', (req, res) => {
    const urlId = crypto.randomBytes(4).toString('hex');
    const host = req.headers.host || req.get('host');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const url = `${protocol}://${host}/s/${urlId}`;
    
    sharedUrls.set(urlId, {
        url,
        createdAt: new Date().toISOString(),
        visitors: [],
        serverId: process.env.SERVER_ID || 'secondary-1'
    });

    // Forward URL generation to main server
    mainServerSocket.emit('secondary-server-url-generated', {
        urlId,
        url,
        serverId: process.env.SERVER_ID || 'secondary-1'
    });

    res.json({ success: true, url });
});

// Handle shared URL visits
app.get('/s/:urlId', (req, res) => {
    const { urlId } = req.params;
    const urlData = sharedUrls.get(urlId);
    
    if (!urlData) {
        res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
        return;
    }

    // Add visitor information
    urlData.visitors.push(req.clientInfo);
    
    // Forward visitor information to main server
    mainServerSocket.emit('secondary-server-visitor', {
        urlId,
        visitor: req.clientInfo,
        serverId: process.env.SERVER_ID || 'secondary-1'
    });

    res.sendFile(path.join(__dirname, 'public', 'shared.html'));
});

// API endpoint to get client info
app.get('/api/client-info', (req, res) => {
    res.json(req.clientInfo);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected to secondary server');
    
    // Get client IP
    const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0] || 
               socket.handshake.address;
    
    // Get client info
    const userAgent = socket.handshake.headers['user-agent'];
    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();
    const geoLocation = geoip.lookup(ip);

    const deviceInfo = {
        ip,
        timestamp: new Date().toISOString(),
        browser,
        os,
        device,
        geoLocation,
        referrer: socket.handshake.headers.referer || 'Direct',
        serverId: process.env.SERVER_ID || 'secondary-1'
    };

    // Forward device info to main server
    mainServerSocket.emit('secondary-server-client', deviceInfo);

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected from secondary server');
        // Forward disconnection to main server
        mainServerSocket.emit('secondary-server-client-disconnected', deviceInfo);
    });
});

// Handle connection to main server
mainServerSocket.on('connect', () => {
    console.log('Connected to main monitoring server');
});

mainServerSocket.on('disconnect', () => {
    console.log('Disconnected from main monitoring server');
});

mainServerSocket.on('connect_error', (error) => {
    console.error('Error connecting to main server:', error.message);
});

// Add reconnection event handlers
mainServerSocket.on('reconnect_attempt', (attemptNumber) => {
    console.log(`Attempting to reconnect to main server (attempt ${attemptNumber})`);
});

mainServerSocket.on('reconnect', (attemptNumber) => {
    console.log(`Reconnected to main server after ${attemptNumber} attempts`);
});

mainServerSocket.on('reconnect_error', (error) => {
    console.error('Reconnection error:', error.message);
});

mainServerSocket.on('reconnect_failed', () => {
    console.error('Failed to reconnect to main server after all attempts');
});

// Start the server
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    const serverUrl = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
    console.log(`Secondary server running on ${serverUrl}`);
    console.log(`Connecting to main server at ${mainServerUrl}`);
}); 