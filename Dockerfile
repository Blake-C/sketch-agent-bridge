FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4
RUN npm install --global pnpm@12.15.0 && apk add --no-cache git && mkdir -p /repo/node_modules && chown -R node:node /repo
WORKDIR /repo
USER node
