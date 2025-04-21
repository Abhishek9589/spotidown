# Use more complete base image
FROM node:18-bullseye

# Install dependencies
RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg curl && \
    pip3 install --no-cache-dir yt-dlp

# Create app directory
WORKDIR /app

# Copy all files
COPY . .

# Install Node.js dependencies
RUN npm install

# Expose the app port
EXPOSE 3000

# Start the app
CMD ["node", "server.js"]
