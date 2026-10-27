FROM node:24-alpine
RUN npm install --global pnpm@12.15.0 && apk add --no-cache git
WORKDIR /repo
