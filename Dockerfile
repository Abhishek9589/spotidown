# Use Node.js 18 with Debian
FROM node:18-slim

# Install yt-dlp dependencies and ffmpeg
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg curl && \
    pip3 install --no-cache-dir yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy all files
COPY . .

# Install Node dependencies
RUN npm install

# Expose the app port
EXPOSE 3000

# Start the app
CMD ["node", "server.js"]
