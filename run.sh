#!/bin/bash

# Simple script to launch the local development server for Mellow Simulator
# Kill any existing process on port 8080 to prevent "Address already in use" errors
PID=$(lsof -ti :8080)
if [ ! -z "$PID" ]; then
    echo "Cleaning up existing process on port 8080 (PID: $PID)..."
    kill -9 $PID
fi

echo "Starting local Python HTTP server on port 8080..."
echo "You can access the simulation in your browser at: http://localhost:8080"
echo "Press Ctrl+C to stop the server."

python3 server.py
