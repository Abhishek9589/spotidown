# Use Node.js 18 as base
FROM node:18

# Install yt-dlp (Python-based tool)
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg && \
    pip3 install yt-dlp

# Create app directory
WORKDIR /app

# Copy project files
COPY . .

# Install dependencies
RUN npm install

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
