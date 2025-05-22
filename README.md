# Network Package Monitoring System

A real-time network monitoring and device tracking system with distributed server architecture.

## Key Features

- **Real-time Device Monitoring**
  - Live tracking of connected devices
  - Detailed device information (browser, OS, device type)
  - Geolocation tracking with IP-based location detection
  - Connection status monitoring

- **Distributed Architecture**
  - Main monitoring server with centralized dashboard
  - Support for multiple secondary servers
  - Real-time data synchronization between servers
  - Automatic reconnection handling

- **URL Tracking System**
  - Dynamic URL generation for device tracking
  - Visitor analytics and statistics
  - Server-specific URL management
  - Real-time visitor notifications

- **Security Features**
  - CORS protection with configurable origins
  - Security headers implementation
  - Rate limiting and request validation
  - Secure WebSocket connections

## Technical Stack

- **Backend**: Node.js with Express
- **Real-time Communication**: Socket.IO
- **Device Detection**: UA-Parser-JS
- **Geolocation**: GeoIP-Lite
- **Development**: Nodemon for hot-reloading

## Server Architecture

- **Main Server (Port 3000)**
  - Central monitoring dashboard
  - Device tracking hub
  - URL management system
  - Secondary server coordination

- **Secondary Servers (Port 3001+)**
  - Distributed device tracking
  - Local URL generation
  - Real-time data forwarding
  - Automatic failover support

## Setup Requirements

- Node.js (v14 or higher)
- npm package manager
- Network access for server communication
- Environment configuration (.env file)

## Security Considerations

- Configure allowed origins in environment variables
- Implement SSL/TLS in production
- Regular security updates
- Monitor server logs for suspicious activity

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Usage

1. Start the development server:
```bash
npm run dev
```

2. Start the production server:
```bash
npm start
```

## API Endpoints

### HTTP API

- `GET /api/client-info`
  Returns client information including:
  - IP address
  - Browser details
  - Operating system
  - Device information
  - Timestamp

### WebSocket Events

The server emits the following events:

- `client-info`: Emitted when a client connects, containing client information
- `disconnect`: Emitted when a client disconnects

## Example Client Usage

### HTTP API
```javascript
fetch('http://localhost:3000/api/client-info')
  .then(response => response.json())
  .then(data => console.log(data));
```

### WebSocket
```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('client-info', (info) => {
  console.log('Client information:', info);
});
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
PORT=3000
NODE_ENV=development
```

## Security Notes

- In production, update the CORS settings in `server.js` to only allow specific origins
- Consider implementing rate limiting for the API endpoints
- Use HTTPS in production
- Consider implementing authentication for sensitive endpoints

- ![Screenshot 2025-05-22 115339](https://github.com/user-attachments/assets/9d9485e1-abac-48d1-af75-871e553e1fe9)


![Screenshot 2025-05-22 115527](https://github.com/user-attachments/assets/fc326e8a-a18f-4868-911c-948c70a84abc)



![Screenshot 2025-05-22 115759](https://github.com/user-attachments/assets/b28e8912-7953-4b97-b53c-9fcc8054c149)

