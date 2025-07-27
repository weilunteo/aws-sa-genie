# Minimal Overlay App

A minimal Electron application that creates an invisible overlay window with global keyboard shortcuts. The app features a transparent, frameless window that can be toggled and moved around the screen using keyboard shortcuts.

## Features

- **Invisible Overlay**: Transparent, frameless window that stays on top of other applications
- **Global Keyboard Shortcuts**:
  - `Cmd/Ctrl + B`: Toggle window visibility
  - `Cmd/Ctrl + Arrow Keys`: Move window position
  - `Cmd/Ctrl + N`: Trigger mock API call
  - `Cmd/Ctrl + M`: Cancel ongoing mock API call
  - `Cmd/Ctrl + Q`: Quit application
- **Security Features**:
  - Context isolation enabled
  - Node integration disabled
  - Content protection to prevent screen capture
- **TypeScript Support**: Full TypeScript implementation for type safety
- **IPC Communication**: Efficient main process and renderer process communication
- **Responsive Window Management**: Dynamic window resizing and positioning
- **Audio Recording Integration**: Record audio from Amazon Chime meetings using Tampermonkey script
- **AWS Integration**: Automatically upload recorded audio to S3 via Lambda function

## Prerequisites

- Node.js (Latest LTS version recommended)
- npm (Comes with Node.js)
- AWS Account with appropriate permissions for Lambda and S3
- Tampermonkey browser extension (for Chime audio recording)

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Development

- **Build the project**:
```bash
npm run build
```

- **Start the application**:
```bash
npm start
```

- **Watch for changes** (TypeScript compilation):
```bash
npm run watch
```

## Project Structure

```
sa-genie/
├── minimal-overlay-app/      # Main Electron application
│   ├── electron/
│   │   ├── main.ts           # Main process code
│   │   ├── preload.ts        # Preload script for secure IPC
│   │   └── shortcuts.ts      # Global keyboard shortcuts handling
│   ├── index.html            # Main window HTML
│   ├── renderer.js           # Renderer process code
│   ├── package.json          # Project configuration and dependencies
│   └── tsconfig.json         # TypeScript configuration
├── audio-stream/             # AWS CDK project for audio processing
│   ├── lambda/               # Lambda function for audio processing
│   │   ├── index.mjs         # Lambda handler for S3 uploads
│   │   └── package.json      # Lambda dependencies
│   └── src/                  # CDK infrastructure code
├── tapermonkey/              # Browser extension scripts
│   └── downloadtranscript.js # Script for recording Chime audio
```

## Technical Details

### Main Process (`main.ts`)
- Manages the application lifecycle
- Creates and controls the overlay window
- Handles window visibility and positioning
- Manages IPC communication
- Implements security features

### Shortcuts (`shortcuts.ts`)
- Registers and manages global keyboard shortcuts
- Handles window movement commands
- Controls API mock triggers and cancellation
- Provides clean shortcut unregistration

### Window Features
- Initial Height: 35px
- Maximum Height: 750px
- Transparent background
- Always-on-top behavior
- Click-through when invisible
- Cross-workspace visibility
- Screen capture protection

### Audio Recording Integration
- Tampermonkey script for recording audio from Amazon Chime meetings
- Keyboard shortcut (`Cmd/Ctrl + R`) to toggle recording
- Automatic conversion of recorded audio to MP3 format
- Seamless upload to AWS via API Gateway and Lambda

### AWS Backend
- Lambda function for processing audio files
- S3 storage for recorded audio
- API Gateway endpoint for secure communication

## Setup Instructions

### Running the Invisible Overlay Application
1. Navigate to the minimal-overlay-app directory:
```bash
cd minimal-overlay-app
```
2. Build the application:
```bash
npm run build
```
3. Start the application:
```bash
npm start
```
4. The invisible overlay will now be running. Use the keyboard shortcuts to interact with it:
   - `Cmd/Ctrl + B`: Toggle window visibility
   - `Cmd/Ctrl + Arrow Keys`: Move window position

### Tampermonkey Script Installation
1. Install the Tampermonkey browser extension
2. Create a new script and copy the content from `tapermonkey/downloadtranscript.js`
3. Save the script and ensure it's enabled

### AWS Configuration
1. Create an S3 bucket for storing audio recordings
2. Deploy the Lambda function from `audio-stream/lambda/`
3. Set the environment variable `TAPERMONKEY_RECORDED_AUDIOS` in the Lambda function with your S3 bucket name
4. Ensure the Lambda execution role has `s3:PutObject` permission for the bucket
5. Create an API Gateway endpoint that triggers the Lambda function

## Security

The application implements several security best practices:
- Context isolation enabled to prevent direct access to Node.js/Electron APIs
- Node integration disabled to prevent malicious code execution
- Preload script for secure IPC communication
- Content protection to prevent screen capture
- CORS headers for secure API communication

## License

MIT
