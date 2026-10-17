# QueueSight web app: build the React code into plain files, then serve them with nginx.

# ---- Stage 1: build. Node is only needed here. ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --fetch-retries=5 --fetch-retry-maxtimeout=120000
COPY . .
RUN npm run build

# ---- Stage 2: serve. The final image has nginx + the built files, no Node, no node_modules. ----
FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80