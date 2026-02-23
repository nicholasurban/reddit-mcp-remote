FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY auth-proxy.mjs oauth.mjs reddit-proxy-shim.cjs entrypoint.sh ./
RUN chmod +x entrypoint.sh
ENV PORT=3000 BACKEND_PORT=3001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:3000/health || exit 1
CMD ["./entrypoint.sh"]
