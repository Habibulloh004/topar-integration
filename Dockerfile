# Use a small Node.js image
FROM node:20-alpine AS base

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install only production dependencies using lockfile
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the app
COPY . .

# Expose the app port
EXPOSE 3000

# Default command starts the app
CMD ["npm", "start"]

