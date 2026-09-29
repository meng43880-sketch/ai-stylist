FROM node:20-alpine
WORKDIR /app
COPY backend/package.json backend/
RUN cd backend && npm install --omit=dev
COPY backend/server.js backend/
COPY backend/lib/ backend/lib/
COPY index.html styles.css app.js demo.js ./
RUN mkdir -p backend/data
ENV NODE_ENV=production PORT=8001 HOST=0.0.0.0
EXPOSE 8001
CMD ["node", "backend/server.js"]
