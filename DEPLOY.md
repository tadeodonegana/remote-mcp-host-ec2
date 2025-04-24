# Deployment Guide

This guide will help you deploy the MCP server on your cloud instance.

## Prerequisites

- Node.js v18 or later
- npm

## Deployment Steps

1. **Clone the repository**

   ```bash
   git clone <your-repository-url>
   cd remote-mcp-host-ec2
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set environment variables**

   Make sure to set your environment variable for the API key:
   
   ```bash
   export SERPER_API_KEY=your_api_key_here
   ```

   For persistent environment variables, you might want to add this to your `.bashrc` or `.bash_profile`.

4. **Build the TypeScript code**

   ```bash
   npm run build
   ```

   This will compile your TypeScript code to JavaScript in the `dist` directory.

5. **Start the server**

   ```bash
   npm start
   ```

   Or to run it directly:

   ```bash
   node dist/server.js
   ```

## Troubleshooting

- **Error: Module not found**: Make sure you've built the TypeScript code with `npm run build`
- **Error: Cannot find API key**: Check that you've set the SERPER_API_KEY environment variable
- **Error: Port already in use**: Change the PORT environment variable (e.g., `export PORT=3001`)

## Running as a Background Service

To keep your server running after you log out, you can use tools like `pm2`:

```bash
npm install -g pm2
pm2 start dist/server.js --name "mcp-server"
pm2 save
```

To ensure it starts on system reboot:

```bash
pm2 startup
```

Then follow the instructions provided by the command. 