const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const UAParser = require('ua-parser-js');
const path = require('path');
const crypto = require('crypto');
const geoip = require('geoip-lite');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : "*",
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["*"]
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000
});

// Store connected devices and shared URLs
const connectedDevices = new Map();
const sharedUrls = new Map();

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cors());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Add security headers middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// Function to get geolocation from IP
function getGeoLocation(ip) {
    // Remove IPv6 prefix if present
    const cleanIp = ip.replace('::ffff:', '');
    const geo = geoip.lookup(cleanIp);
    
    if (geo) {
        return {
            country: geo.country,
            region: geo.region,
            city: geo.city,
            ll: geo.ll, // latitude and longitude
            timezone: geo.timezone
        };
    }
    return null;
}

// Middleware to capture client information
const clientInfoMiddleware = (req, res, next) => {
    const userAgent = req.headers['user-agent'];
    const parser = new UAParser(userAgent);
    const ip = req.ip || req.connection.remoteAddress;
    
    const clientInfo = {
        ip: ip,
        userAgent: userAgent,
        browser: parser.getBrowser(),
        os: parser.getOS(),
        device: parser.getDevice(),
        timestamp: new Date().toISOString(),
        referrer: req.headers.referer || 'Direct',
        url: req.originalUrl,
        geoLocation: getGeoLocation(ip)
    };
    
    // Attach client info to request object
    req.clientInfo = clientInfo;
    next();
};

// Apply the middleware to all routes
app.use(clientInfoMiddleware);

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
        serverId: 'main'
    });

    io.emit('url-generated', { urlId, url, serverId: 'main' });
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
    
    // Broadcast new visitor to all connected clients
    io.emit('new-visitor', {
        urlId,
        visitor: req.clientInfo
    });

    res.sendFile(path.join(__dirname, 'public', 'shared.html'));
});

// Get URL statistics
app.get('/api/url-stats/:urlId', (req, res) => {
    const { urlId } = req.params;
    const urlData = sharedUrls.get(urlId);
    
    if (!urlData) {
        res.status(404).json({ success: false, error: 'URL not found' });
        return;
    }

    res.json({
        success: true,
        data: {
            url: urlData.url,
            createdAt: urlData.createdAt,
            visitors: urlData.visitors
        }
    });
});

// Example API endpoint that returns client information
app.get('/api/client-info', (req, res) => {
    res.json({
        success: true,
        data: req.clientInfo
    });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected');
    
    // Get client IP
    const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0] || 
               socket.handshake.address;
    
    // Get client info
    const userAgent = socket.handshake.headers['user-agent'];
    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();
    const geoLocation = getGeoLocation(ip);

    const deviceInfo = {
        ip,
        timestamp: new Date().toISOString(),
        browser,
        os,
        device,
        geoLocation,
        referrer: socket.handshake.headers.referer || 'Direct',
        serverId: 'main' // Main server identifier
    };

    // Broadcast the new client to all connected clients
    io.emit('client-info', deviceInfo);

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected');
        io.emit('client-disconnected', deviceInfo);
    });
});

// Handle connections from secondary servers
io.on('connection', (socket) => {
    // Listen for clients from secondary servers
    socket.on('secondary-server-client', (deviceInfo) => {
        console.log(`New client from secondary server ${deviceInfo.serverId}`);
        // Broadcast the client info to all connected clients
        io.emit('client-info', deviceInfo);
    });

    // Listen for disconnections from secondary servers
    socket.on('secondary-server-client-disconnected', (deviceInfo) => {
        console.log(`Client disconnected from secondary server ${deviceInfo.serverId}`);
        io.emit('client-disconnected', deviceInfo);
    });

    // Listen for URL generation from secondary servers
    socket.on('secondary-server-url-generated', ({ urlId, url, serverId }) => {
        console.log(`New URL generated on secondary server ${serverId}: ${url}`);
        // Store the URL with server information
        sharedUrls.set(urlId, {
            url,
            createdAt: new Date().toISOString(),
            visitors: [],
            serverId
        });
        // Broadcast the new URL to all connected clients
        io.emit('url-generated', { urlId, url, serverId });
    });

    // Listen for visitors from secondary servers
    socket.on('secondary-server-visitor', ({ urlId, visitor, serverId }) => {
        console.log(`New visitor on secondary server ${serverId} for URL ${urlId}`);
        const urlData = sharedUrls.get(urlId);
        if (urlData) {
            urlData.visitors.push(visitor);
            // Broadcast the visitor to all connected clients
            io.emit('new-visitor', {
                urlId,
                visitor: {
                    ...visitor,
                    serverId
                }
            });
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error'
    });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    const serverUrl = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
    console.log(`Server is running on ${serverUrl}`);
    console.log(`HTTP API available at ${serverUrl}/api/client-info`);
    console.log(`WebSocket server running on ws://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`Device monitor available at ${serverUrl}`);
}); 