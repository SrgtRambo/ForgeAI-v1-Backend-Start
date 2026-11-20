// WebSocket Handler for Forge AI Live Preview
// Enables real-time preview updates between backend and frontend

import WS from 'ws';

// Create WebSocket server attached to HTTP server
let wss = null;

export function initializeWebSocket(server) {
  wss = new WS.Server({ noServer: true });
  
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
  
  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        // Broadcast to all connected clients
        wss.clients.forEach((client) => {
          if (client.readyState === WS.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      } catch (e) {
        console.error('WS message parse error:', e);
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
  
  return wss;
}

// Broadcast a message to all connected clients
export function broadcast(message) {
  if (wss) {
    wss.clients.forEach((client) => {
      if (client.readyState === WS.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }
}

// Get number of connected clients
export function getClientCount() {
  return wss ? wss.clients.size : 0;
}

export default { initializeWebSocket, broadcast, getClientCount };
