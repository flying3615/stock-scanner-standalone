FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build TypeScript
RUN npm run build

# Default command matches "npm start" but likely user wants to pass args
ENTRYPOINT ["npm", "run", "scan", "--"]
CMD ["AAPL"] 
