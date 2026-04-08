#!/bin/bash
set -e
npm install
echo "1" | npm run db:push -- --force
