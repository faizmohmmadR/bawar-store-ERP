#!/bin/bash
# Clear Vite cache and restart dev server

echo "Clearing Vite cache..."
rm -rf node_modules/.vite
echo "Cache cleared!"
echo "Please restart your dev server with: npm run dev"
