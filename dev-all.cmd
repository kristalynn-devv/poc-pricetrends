@echo off
cd /d "%~dp0"
start "poc-pricetrends-api" cmd /k pnpm dev:api
start "poc-pricetrends-web" cmd /k pnpm dev:web
